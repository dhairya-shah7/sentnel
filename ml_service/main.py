"""
SentinelOps ML Service — FastAPI Application
Isolation Forest + One-Class SVM anomaly detection
"""
import os
import uuid
import json
import asyncio
import threading
import re
from pathlib import Path
from typing import Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import pandas as pd
import numpy as np
from dotenv import load_dotenv

from models.isolation_forest import IsolationForestModel
from models.svm import OneClassSVMModel
from utils.dataset_adapter import DatasetAdapter
from utils.preprocessor import Preprocessor

load_dotenv()

# Force absolute paths relative to the script location to avoid Windows path errors (Errno 22)
BASE_DIR = Path(__file__).resolve().parent

MODEL_SAVE_PATH_RAW = os.getenv("MODEL_SAVE_PATH", "./data/saved_models").strip().strip('"').strip("'")
MODEL_SAVE_PATH = (BASE_DIR / MODEL_SAVE_PATH_RAW).resolve()
MODEL_SAVE_PATH.mkdir(parents=True, exist_ok=True)

JOB_STORE_PATH_RAW = os.getenv("JOB_STORE_PATH", "./data/job_store.json").strip().strip('"').strip("'")
# Ensure we don't accidentally use a name with a space if it's meant to be job_store.json
if "job store.json" in JOB_STORE_PATH_RAW:
    JOB_STORE_PATH_RAW = JOB_STORE_PATH_RAW.replace("job store.json", "job_store.json")

JOB_STORE_PATH = (BASE_DIR / JOB_STORE_PATH_RAW).resolve()
JOB_STORE_PATH.parent.mkdir(parents=True, exist_ok=True)

# Global model registry
models: dict = {}
job_store: dict = {}
job_store_lock = threading.Lock()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load persisted models and job state on startup."""
    global models, job_store
    for model_file in MODEL_SAVE_PATH.glob("*.joblib"):
        model_id = model_file.stem
        try:
            if "svm" in model_id:
                m = OneClassSVMModel()
            else:
                m = IsolationForestModel()
            m.load(str(model_file))
            models[model_id] = m
            print(f"[ML] Loaded model: {model_id}")
        except Exception as e:
            print(f"[ML] Failed to load {model_id}: {e}")
    job_store = load_job_store()
    if job_store:
        print(f"[ML] Restored {len(job_store)} job records")
    yield
    # cleanup
    models.clear()


app = FastAPI(
    title="SentinelOps ML Service",
    description="Anomaly detection microservice for network traffic analysis",
    version="1.0.0",
    lifespan=lifespan,
)

def _split_origins(value: str):
    return [item.strip() for item in str(value or "").split(",") if item.strip()]


def get_allowed_origins():
    origins = {
        "http://localhost:4000",
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:4000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
    }

    for env_name in ("CLIENT_URL", "CLIENT_URLS", "FRONTEND_URL", "CORS_ORIGINS"):
        origins.update(_split_origins(os.getenv(env_name, "")))

    return sorted(origins)


app.add_middleware(
    CORSMiddleware,
    allow_origins=get_allowed_origins(),
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─────────────────────────────────────────────────────────────
# Pydantic Schemas
# ─────────────────────────────────────────────────────────────

class TrainRequest(BaseModel):
    dataset_source: str  # "UNSW-NB15" | "NSL-KDD" | "CICIDS"
    model_type: str = "isolation_forest"  # "isolation_forest" | "one_class_svm"
    contamination: float = 0.1
    dataset_id: str  # MongoDB dataset ID for result storage


class PredictRequest(BaseModel):
    model_id: str
    dataset_source: str
    dataset_id: Optional[str] = None


class JobStatus(BaseModel):
    job_id: str
    status: str  # queued | running | complete | failed
    progress: int = 0
    message: str = ""
    result: Optional[dict] = None


IP_ALIASES = {
    "src": [
        "src_ip", "source_ip", "srcip", "src_addr", "saddr", "ip_src", "sourceaddress",
        "source_address", "source_addr", "src_address", "src_ip_address", "source", "origin_ip",
    ],
    "dst": [
        "dst_ip", "destination_ip", "dstip", "dst_addr", "daddr", "ip_dst", "destinationaddress",
        "destination_address", "destination_addr", "dst_address", "dst_ip_address", "destination",
    ],
}


def normalize_text(value) -> str:
    return str(value or "").strip().lower()


def normalize_column_name(value) -> str:
    return re.sub(r"[^a-z0-9]+", "_", str(value or "").strip().lower()).strip("_")


def normalize_dataframe_columns(df: pd.DataFrame) -> pd.DataFrame:
    if df is None or df.empty:
        return df
    renamed = {column: normalize_column_name(column) for column in df.columns}
    return df.rename(columns=renamed)


def is_missing_ip(value) -> bool:
    text = normalize_text(value)
    return not text or text in {"0.0.0.0", "unknown", "null", "nan", "-"}


def pick_first_value(*values, default=""):
    for value in values:
        if value is None:
            continue
        if isinstance(value, pd.Series):
            nested = pick_first_value(*value.tolist(), default="")
            if nested != "":
                return nested
            continue
        if isinstance(value, (list, tuple)):
            nested = pick_first_value(*value, default="")
            if nested != "":
                return nested
            continue
        text = str(value).strip()
        if text and text.lower() != "nan":
            return text
    return default


def extract_ip(raw_row: pd.Series, canonical_row: pd.Series, which: str) -> str:
    aliases = IP_ALIASES.get(which, [])
    raw_candidates = [raw_row.get(alias) for alias in aliases]
    canonical_candidates = [canonical_row.get(alias) for alias in aliases]
    return pick_first_value(
        *raw_candidates,
        *canonical_candidates,
        raw_row.get("src_ip" if which == "src" else "dst_ip"),
        canonical_row.get("src_ip" if which == "src" else "dst_ip"),
        default="0.0.0.0",
    )


def detect_threat_type(raw_row: pd.Series, canonical_row: pd.Series, risk_score: float, classification: str) -> str:
    src_ip = extract_ip(raw_row, canonical_row, "src")
    dst_ip = extract_ip(raw_row, canonical_row, "dst")
    protocol = normalize_text(
        pick_first_value(
            canonical_row.get("protocol"),
            raw_row.get("protocol"),
            raw_row.get("proto"),
        )
    )
    flags = normalize_text(
        pick_first_value(
            canonical_row.get("tcp_flags"),
            raw_row.get("tcp_flags"),
            raw_row.get("flags"),
        )
    )
    state = normalize_text(
        pick_first_value(
            canonical_row.get("connection_state"),
            raw_row.get("connection_state"),
            raw_row.get("state"),
        )
    )
    packet_size = float(pick_first_value(canonical_row.get("packet_size"), raw_row.get("packet_size"), default=0) or 0)
    duration = float(pick_first_value(canonical_row.get("duration"), raw_row.get("duration"), default=0) or 0)
    byte_rate = float(pick_first_value(canonical_row.get("byte_rate"), raw_row.get("byte_rate"), default=0) or 0)

    invalid_ips = is_missing_ip(src_ip) or is_missing_ip(dst_ip) or (src_ip and dst_ip and src_ip == dst_ip)
    is_udp_or_icmp = protocol in {"udp", "icmp", "17", "1"}
    bursty = duration <= 1.0 and (packet_size <= 128 or byte_rate >= 1000)
    flood = packet_size >= 5000 or byte_rate >= 5000
    syn_like = "syn" in flags or "syn" in state

    if invalid_ips:
        return "spoofing"
    if is_udp_or_icmp and (bursty or flood):
        return "jamming"
    if syn_like or classification == "critical" or risk_score > 0.7:
        return "intrusion_attempt"
    return "suspicious_activity"


def build_explanation(raw_row: pd.Series, canonical_row: pd.Series, threat_type: str, risk_score: float, classification: str) -> dict:
    src_ip = extract_ip(raw_row, canonical_row, "src")
    dst_ip = extract_ip(raw_row, canonical_row, "dst")
    protocol = normalize_text(
        pick_first_value(
            canonical_row.get("protocol"),
            raw_row.get("protocol"),
            raw_row.get("proto"),
        )
    )
    flags = normalize_text(
        pick_first_value(
            canonical_row.get("tcp_flags"),
            raw_row.get("tcp_flags"),
            raw_row.get("flags"),
        )
    )
    state = normalize_text(
        pick_first_value(
            canonical_row.get("connection_state"),
            raw_row.get("connection_state"),
            raw_row.get("state"),
        )
    )
    packet_size = float(pick_first_value(canonical_row.get("packet_size"), raw_row.get("packet_size"), default=0) or 0)
    duration = float(pick_first_value(canonical_row.get("duration"), raw_row.get("duration"), default=0) or 0)
    byte_rate = float(pick_first_value(canonical_row.get("byte_rate"), raw_row.get("byte_rate"), default=0) or 0)

    signals = []
    if is_missing_ip(src_ip):
        signals.append("missing source IP")
    if is_missing_ip(dst_ip):
        signals.append("missing destination IP")
    if src_ip and dst_ip and src_ip == dst_ip:
        signals.append("source and destination IP match")
    if protocol in {"udp", "icmp", "17", "1"} and (duration <= 1.0 or byte_rate >= 1000):
        signals.append(f"{protocol.upper()} burst pattern")
    if packet_size >= 5000 or byte_rate >= 5000:
        signals.append("high-volume burst")
    if "syn" in flags or "syn" in state:
        signals.append("SYN-like session state")
    if classification == "critical":
        signals.append("critical risk score")
    if risk_score > 0.7:
        signals.append("high anomaly score")

    description_map = {
        "spoofing": "Likely spoofing because the traffic identifiers look invalid or duplicated.",
        "jamming": "Likely jamming because the flow looks like a bursty flood on UDP/ICMP-style traffic.",
        "intrusion_attempt": "Likely intrusion attempt because the record shows a high-risk or SYN-like attack pattern.",
        "suspicious_activity": "Suspicious behavior detected but not enough evidence for a stronger threat class.",
    }

    return {
        "summary": description_map.get(threat_type, "Anomaly detected by the scoring model."),
        "signals": signals,
        "risk_score": round(risk_score, 4),
        "classification": classification,
        "threat_type": threat_type,
    }


def build_executive_summary(anomaly_count: int, critical_count: int, threat_breakdown: dict, total_records: int) -> str:
    threat_parts = []
    for key in ("intrusion_attempt", "spoofing", "jamming"):
        count = int(threat_breakdown.get(key, 0) or 0)
        if count:
            threat_parts.append(f"{count} {key.replace('_', ' ')}")
    threat_text = ", ".join(threat_parts) if threat_parts else "no dominant threat cluster"
    anomaly_ratio = round((anomaly_count / max(total_records, 1)) * 100, 2)
    return (
        f"Analysis covered {total_records} records and flagged {anomaly_count} anomalies "
        f"({anomaly_ratio}%). Critical cases total {critical_count}. "
        f"Threat profile: {threat_text}."
    )


def build_technical_summary(results: list) -> dict:
    anomalous = [row for row in results if row.get("is_anomaly")]
    if not anomalous:
        return {
            "top_signals": [],
            "average_risk_score": 0,
            "high_risk_count": 0,
            "summary": "No anomalous rows were detected in this run.",
            "notes": "No anomalous rows were detected in this run.",
        }

    avg_risk = round(sum(float(row.get("risk_score", 0) or 0) for row in anomalous) / len(anomalous), 4)
    high_risk_count = sum(1 for row in anomalous if float(row.get("risk_score", 0) or 0) > 0.7)
    signal_counts = {}
    for row in anomalous:
        explanation = row.get("explanation") or {}
        for signal in explanation.get("signals", []):
            signal_counts[signal] = signal_counts.get(signal, 0) + 1

    top_signals = [
        {"signal": signal, "count": count}
        for signal, count in sorted(signal_counts.items(), key=lambda item: item[1], reverse=True)[:5]
    ]

    return {
        "top_signals": top_signals,
        "average_risk_score": avg_risk,
        "high_risk_count": high_risk_count,
        "summary": f"Technical review indicates {len(anomalous)} anomalous rows with {high_risk_count} above the critical threshold.",
        "notes": f"Technical review indicates {len(anomalous)} anomalous rows with {high_risk_count} above the critical threshold.",
    }


def load_job_store() -> dict:
    """Load persisted job state from disk."""
    if not JOB_STORE_PATH.exists():
        return {}

    try:
        with JOB_STORE_PATH.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
        return data if isinstance(data, dict) else {}
    except Exception as exc:
        print(f"[ML] Failed to load job store: {exc}")
        return {}


def persist_job_store() -> None:
    """Persist job state to disk so restarts do not lose queued jobs."""
    with job_store_lock:
        payload = json.dumps(job_store, ensure_ascii=False, indent=2)
        JOB_STORE_PATH.write_text(payload, encoding="utf-8")


def set_job_state(job_id: str, **updates) -> dict:
    """Update a job record and persist the change atomically."""
    with job_store_lock:
        current = job_store.get(
            job_id,
            {"job_id": job_id, "status": "queued", "progress": 0, "message": "", "result": None},
        )
        current.update(updates)
        job_store[job_id] = current
        payload = json.dumps(job_store, ensure_ascii=False, indent=2)
        JOB_STORE_PATH.write_text(payload, encoding="utf-8")
        return current


# ─────────────────────────────────────────────────────────────
# Background Training Job
# ─────────────────────────────────────────────────────────────

def _run_training_job(job_id: str, df: pd.DataFrame, req: TrainRequest):
    """Blocking training function executed in thread pool."""
    try:
        set_job_state(job_id, status="running", progress=10)

        # Preprocess
        preprocessor = Preprocessor()
        X, y, feature_names = preprocessor.fit_transform(df)
        set_job_state(job_id, progress=30)

        # Train model
        if req.model_type == "one_class_svm":
            model = OneClassSVMModel(nu=req.contamination)
        else:
            model = IsolationForestModel(contamination=req.contamination)

        model.fit(X, feature_names)
        set_job_state(job_id, progress=70)

        # Predict on training data to get initial anomaly count
        predictions = model.predict(X)
        risk_scores = model.score_samples(X)
        set_job_state(job_id, progress=85)

        # Save model
        model_id = f"{req.model_type}_{req.dataset_id}_{job_id[:8]}"
        save_path = MODEL_SAVE_PATH / f"{model_id}.joblib"
        model.save(str(save_path))
        models[model_id] = model

        # Build result
        anomaly_count = int(np.sum(predictions == -1))
        total = len(predictions)
        critical = int(np.sum(risk_scores > 0.7))
        suspicious = int(np.sum((risk_scores > 0.4) & (risk_scores <= 0.7)))
        normal = total - anomaly_count

        set_job_state(job_id, progress=100, status="complete", result={
            "model_id": model_id,
            "model_type": req.model_type,
            "dataset_id": req.dataset_id,
            "total_records": total,
            "anomaly_count": anomaly_count,
            "normal_count": normal,
            "critical_count": critical,
            "suspicious_count": suspicious,
            "contamination": req.contamination,
            "feature_names": feature_names,
            "accuracy_estimate": round((total - anomaly_count) / total * 100, 2),
        })
    except Exception as e:
        set_job_state(job_id, status="failed", message=str(e))
        print(f"[ML] Training job {job_id} failed: {e}")


def _run_prediction_job(job_id: str, model_id: str, dataset_source: str, dataset_id: str, df_raw: pd.DataFrame):
    """Blocking prediction function executed in a thread pool."""
    try:
        set_job_state(job_id, status="running", progress=10, message="Loading dataset for prediction")

        adapter = DatasetAdapter(dataset_source)
        df = adapter.adapt(df_raw)
        df_raw = normalize_dataframe_columns(df_raw)
        set_job_state(job_id, progress=25, message="Preprocessing prediction data")

        preprocessor = Preprocessor()
        X, _, _ = preprocessor.fit_transform(df)
        total_records = len(df)
        model = get_model(model_id)
        if model is None:
            raise RuntimeError(f"Model '{model_id}' not found. Train first.")

        batch_size = int(os.getenv("ML_PREDICT_BATCH_SIZE", "5000"))
        batch_size = max(500, batch_size)
        total_batches = max(1, (total_records + batch_size - 1) // batch_size)

        anomalies = []
        anomaly_count = 0
        critical_count = 0
        suspicious_count = 0
        normal_count = 0
        threat_breakdown: dict = {}

        for batch_index, start in enumerate(range(0, total_records, batch_size), start=1):
            end = min(start + batch_size, total_records)
            x_batch = X[start:end]
            batch_predictions = model.predict(x_batch)
            batch_scores = model.score_samples(x_batch)
            set_job_state(
                job_id,
                progress=25 + int((batch_index / total_batches) * 65),
                message=f"Scoring batch {batch_index}/{total_batches}",
            )

            for offset, i in enumerate(range(start, end)):
                canonical_row = df.iloc[i]
                raw_row = df_raw.iloc[i] if i < len(df_raw) else canonical_row
                risk = float(batch_scores[offset])
                classification = (
                    "critical" if risk > 0.7
                    else "suspicious" if risk > 0.4
                    else "normal"
                )
                src_ip = extract_ip(raw_row, canonical_row, "src")
                dst_ip = extract_ip(raw_row, canonical_row, "dst")
                threat_type = detect_threat_type(raw_row, canonical_row, risk, classification)
                explanation = build_explanation(raw_row, canonical_row, threat_type, risk, classification)
                is_anomaly = bool(batch_predictions[offset] == -1)

                if classification == "critical":
                    critical_count += 1
                elif classification == "suspicious":
                    suspicious_count += 1
                else:
                    normal_count += 1

                if is_anomaly:
                    anomaly_count += 1
                    threat_breakdown[threat_type] = threat_breakdown.get(threat_type, 0) + 1
                    anomalies.append({
                        "index": i,
                        "src_ip": src_ip,
                        "dst_ip": dst_ip,
                        "protocol": pick_first_value(canonical_row.get("protocol"), raw_row.get("protocol"), raw_row.get("proto"), default="unknown"),
                        "packet_size": float(canonical_row.get("packet_size", 0) or 0),
                        "duration": float(canonical_row.get("duration", 0) or 0),
                        "byte_rate": float(canonical_row.get("byte_rate", 0) or 0),
                        "event_timestamp": str(
                            raw_row.get("timestamp")
                            or raw_row.get("event_timestamp")
                            or raw_row.get("time")
                            or canonical_row.get("timestamp")
                            or canonical_row.get("event_timestamp")
                            or canonical_row.get("time")
                            or ""
                        ),
                        "risk_score": round(risk, 4),
                        "decision_score": float(batch_scores[offset]),
                        "classification": classification,
                        "threat_type": threat_type,
                        "explanation": explanation,
                        "is_anomaly": True,
                        "dataset_id": dataset_id,
                    })

        normal_count = total_records - anomaly_count
        executive_summary = build_executive_summary(anomaly_count, critical_count, threat_breakdown, total_records)
        technical_summary = build_technical_summary(anomalies)

        set_job_state(
            job_id,
            progress=100,
            status="complete",
            message="Prediction complete",
            result={
                "model_id": model_id,
                "total_records": total_records,
                "anomaly_count": anomaly_count,
                "critical_count": critical_count,
                "suspicious_count": suspicious_count,
                "normal_count": normal_count,
                "accuracy_estimate": round((normal_count / max(total_records, 1)) * 100, 2),
                "threat_breakdown": threat_breakdown,
                "executive_summary": executive_summary,
                "technical_summary": technical_summary,
                "anomalies": anomalies,
                "results": anomalies,
            },
        )
    except Exception as e:
        set_job_state(job_id, status="failed", message=str(e))
        print(f"[ML] Prediction job {job_id} failed: {e}")


# ─────────────────────────────────────────────────────────────
# Routes
# ─────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "models_loaded": len(models)}


@app.post("/ml/train")
async def train_model(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    dataset_source: str = "UNSW-NB15",
    model_type: str = "isolation_forest",
    contamination: float = 0.1,
    dataset_id: str = "unknown",
):
    """Upload CSV and train a new model asynchronously."""
    if not file.filename.endswith(".csv"):
        raise HTTPException(400, "Only CSV files are accepted")

    try:
        content = await file.read()
        df_raw = pd.read_csv(__import__("io").BytesIO(content))
    except Exception as e:
        raise HTTPException(400, f"Failed to parse CSV: {e}")

    # Adapt schema
    adapter = DatasetAdapter(dataset_source)
    try:
        df = adapter.adapt(df_raw)
    except Exception as e:
        raise HTTPException(422, f"Schema validation failed: {e}")

    job_id = str(uuid.uuid4())
    set_job_state(
        job_id,
        status="queued",
        progress=0,
        message="Queued for training",
        result=None,
    )

    req = TrainRequest(
        dataset_source=dataset_source,
        model_type=model_type,
        contamination=contamination,
        dataset_id=dataset_id,
    )

    # Run in thread pool so FastAPI stays async
    import concurrent.futures
    loop = asyncio.get_event_loop()
    executor = concurrent.futures.ThreadPoolExecutor(max_workers=2)
    loop.run_in_executor(executor, _run_training_job, job_id, df, req)

    return {"job_id": job_id, "status": "queued", "message": "Training started"}


@app.get("/ml/train/{job_id}/status")
def get_train_status(job_id: str):
    """Poll training job status."""
    if job_id not in job_store:
        refreshed = load_job_store()
        if refreshed:
            job_store.update(refreshed)

    if job_id not in job_store:
        raise HTTPException(404, "Job not found")
    return job_store[job_id]


@app.post("/ml/predict")
async def predict(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    model_id: str = "",
    dataset_source: str = "UNSW-NB15",
    dataset_id: str = "unknown",
):
    """Start an asynchronous prediction job for a CSV file."""
    model = get_model(model_id)
    if model is None:
        raise HTTPException(404, f"Model '{model_id}' not found. Train first.")

    if not file.filename.endswith(".csv"):
        raise HTTPException(400, "Only CSV files are accepted")

    try:
        content = await file.read()
        df_raw = pd.read_csv(__import__("io").BytesIO(content))
    except Exception as e:
        raise HTTPException(400, f"Failed to parse CSV: {e}")

    job_id = str(uuid.uuid4())
    set_job_state(
        job_id,
        status="queued",
        progress=0,
        message="Queued for prediction",
        result=None,
    )

    import concurrent.futures
    loop = asyncio.get_event_loop()
    executor = concurrent.futures.ThreadPoolExecutor(max_workers=2)
    loop.run_in_executor(executor, _run_prediction_job, job_id, model_id, dataset_source, dataset_id, df_raw)

    return {"job_id": job_id, "status": "queued", "message": "Prediction started"}


@app.get("/ml/predict/{job_id}/status")
def get_predict_status(job_id: str):
    """Poll prediction job status."""
    if job_id not in job_store:
        refreshed = load_job_store()
        if refreshed:
            job_store.update(refreshed)

    if job_id not in job_store:
        raise HTTPException(404, "Job not found")
    return job_store[job_id]


def get_model(model_id: str):
    """Return a trained model from memory or disk."""
    if model_id in models:
        return models[model_id]

    model_file = MODEL_SAVE_PATH / f"{model_id}.joblib"
    if not model_file.exists():
        return None

    try:
        if "svm" in model_id:
            model = OneClassSVMModel()
        else:
            model = IsolationForestModel()
        model.load(str(model_file))
        models[model_id] = model
        print(f"[ML] Lazily loaded model: {model_id}")
        return model
    except Exception as exc:
        print(f"[ML] Failed to lazy-load {model_id}: {exc}")
        return None


@app.get("/ml/model/status")
def model_status():
    """Return metadata for all loaded models."""
    return {
        "models": [
            {
                "model_id": mid,
                "model_type": m.__class__.__name__,
                "trained": m.is_trained,
                "feature_count": len(m.feature_names) if m.feature_names else 0,
                "contamination": getattr(m, "contamination", None),
            }
            for mid, m in models.items()
        ],
        "total": len(models),
    }


@app.post("/ml/retrain")
async def retrain(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    model_id: str = "",
    dataset_source: str = "UNSW-NB15",
    contamination: float = 0.1,
):
    """Retrain an existing model with new data."""
    if model_id not in models:
        raise HTTPException(404, f"Model '{model_id}' not found")

    content = await file.read()
    df_raw = pd.read_csv(__import__("io").BytesIO(content))
    adapter = DatasetAdapter(dataset_source)
    df = adapter.adapt(df_raw)

    job_id = str(uuid.uuid4())
    existing = models[model_id]
    req = TrainRequest(
        dataset_source=dataset_source,
        model_type="isolation_forest" if "isolation" in model_id else "one_class_svm",
        contamination=contamination,
        dataset_id=model_id,
    )

    set_job_state(
        job_id,
        status="queued",
        progress=0,
        message="Retraining queued",
        result=None,
    )

    import concurrent.futures
    loop = asyncio.get_event_loop()
    executor = concurrent.futures.ThreadPoolExecutor(max_workers=2)
    loop.run_in_executor(executor, _run_training_job, job_id, df, req)

    return {"job_id": job_id, "status": "queued", "message": "Retraining started"}


@app.get("/ml/export")
def export_results(model_id: str = "", limit: int = 1000):
    """Export anomaly report as CSV stream."""
    # Build CSV from job results
    rows = []
    for jid, job in job_store.items():
        if job.get("status") == "complete" and job.get("result"):
            r = job["result"]
            if not model_id or r.get("model_id") == model_id:
                rows.append({
                    "job_id": jid,
                    "model_id": r.get("model_id"),
                    "dataset_id": r.get("dataset_id"),
                    "total_records": r.get("total_records"),
                    "anomaly_count": r.get("anomaly_count"),
                    "critical_count": r.get("critical_count"),
                    "contamination": r.get("contamination"),
                    "accuracy_estimate": r.get("accuracy_estimate"),
                })

    if not rows:
        raise HTTPException(404, "No completed jobs found")

    import io
    df_out = pd.DataFrame(rows[:limit])
    csv_buffer = io.StringIO()
    df_out.to_csv(csv_buffer, index=False)
    csv_buffer.seek(0)

    return StreamingResponse(
        iter([csv_buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=anomaly_report.csv"},
    )
