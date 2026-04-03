"""
Download a Kaggle dataset with kagglehub, copy the raw files into the repo,
and export canonical SentinelOps CSV files.

Examples:
  python download_kaggle_dataset.py --dataset hassan06/nslkdd
  python download_kaggle_dataset.py --dataset hassan06/nslkdd --output ../datasets
"""
from __future__ import annotations

import argparse
import json
import csv
import re
import shutil
import urllib.error
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path

import pandas as pd
import kagglehub

CANONICAL_COLUMNS = [
    "timestamp",
    "src_ip",
    "dst_ip",
    "protocol",
    "packet_size",
    "duration",
    "tcp_flags",
    "byte_rate",
    "connection_state",
]


def main() -> None:
    parser = argparse.ArgumentParser(description="Download and normalize a Kaggle dataset.")
    parser.add_argument("--dataset", default="hassan06/nslkdd", help="Kaggle dataset slug")
    parser.add_argument(
        "--output",
        default="datasets",
        help="Repo-relative output directory for raw and canonical files",
    )
    parser.add_argument(
        "--server-url",
        default="http://localhost:4000",
        help="Backend URL used to sync the imported CSV into the UI",
    )
    parser.add_argument(
        "--sync-token",
        default="",
        help="Internal token required by the backend sync endpoint",
    )
    parser.add_argument(
        "--upload-dir",
        default="server/uploads",
        help="Repo-relative upload folder used by the backend",
    )
    parser.add_argument(
        "--source",
        default="",
        help="Override the dataset source name (UNSW-NB15, NSL-KDD, CICIDS)",
    )
    args = parser.parse_args()

    downloaded_path = Path(kagglehub.dataset_download(args.dataset)).resolve()
    print(f"Path to dataset files: {downloaded_path}")

    repo_root = Path(__file__).resolve().parent.parent
    output_root = (repo_root / args.output).resolve() if not Path(args.output).is_absolute() else Path(args.output).resolve()
    raw_dir = output_root / "raw" / slugify(args.dataset)
    canonical_dir = output_root / "canonical" / slugify(args.dataset)
    raw_dir.mkdir(parents=True, exist_ok=True)
    canonical_dir.mkdir(parents=True, exist_ok=True)

    copy_raw_files(downloaded_path, raw_dir)

    source_files = sorted(
        p for p in downloaded_path.rglob("*")
        if p.is_file() and p.suffix.lower() in {".csv", ".txt", ".arff"}
    )
    if not source_files:
        raise FileNotFoundError(f"No supported data files found in {downloaded_path}")

    canonical_frames = []
    for source_file in source_files:
        df = load_dataset_frame(source_file)
        canonical = normalize_to_canonical(df, args.dataset, source_file.stem)
        out_file = canonical_dir / f"{source_file.stem}_canonical.csv"
        canonical.to_csv(out_file, index=False)
        canonical_frames.append(canonical)
        print(f"Canonical CSV written: {out_file}")

    merged = pd.concat(canonical_frames, ignore_index=True)
    merged_file = canonical_dir / "canonical_merged.csv"
    merged.to_csv(merged_file, index=False)
    print(f"Merged canonical CSV written: {merged_file}")
    print(f"Raw files copied to: {raw_dir}")

    upload_root = (repo_root / args.upload_dir).resolve() if not Path(args.upload_dir).is_absolute() else Path(args.upload_dir).resolve()
    upload_root.mkdir(parents=True, exist_ok=True)
    synced_name = f"{slugify(args.dataset)}_canonical_merged.csv"
    synced_file = upload_root / synced_name
    shutil.copy2(merged_file, synced_file)
    print(f"Copied merged CSV to backend uploads: {synced_file}")

    sync_source = args.source.strip() or infer_source(args.dataset)
    sync_dataset_name = f"{sync_source} Imported Dataset"
    sync_local_dataset(
        server_url=args.server_url,
        file_name=synced_name,
        source=sync_source,
        name=sync_dataset_name,
        sync_token=args.sync_token.strip(),
    )


def copy_raw_files(source_dir: Path, target_dir: Path) -> None:
    for item in source_dir.rglob("*"):
        if item.is_dir():
            continue
        relative = item.relative_to(source_dir)
        dest = target_dir / relative
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(item, dest)


def load_dataset_frame(file_path: Path) -> pd.DataFrame:
    suffix = file_path.suffix.lower()
    if suffix == ".csv":
        return pd.read_csv(file_path)
    if suffix == ".txt":
        return pd.read_csv(file_path, header=None)
    if suffix == ".arff":
        return parse_arff_file(file_path)
    raise ValueError(f"Unsupported file type: {suffix}")


def parse_arff_file(file_path: Path) -> pd.DataFrame:
    columns = []
    data_rows = []
    in_data = False

    with file_path.open("r", encoding="utf-8", errors="ignore") as handle:
      for raw_line in handle:
          line = raw_line.strip()
          if not line or line.startswith("%"):
              continue

          lower = line.lower()
          if lower.startswith("@attribute"):
              match = re.match(r"@attribute\s+['\"]?([^'\"]+)['\"]?\s+", line, flags=re.IGNORECASE)
              if match:
                  columns.append(match.group(1).strip())
              continue

          if lower.startswith("@data"):
              in_data = True
              continue

          if in_data:
              row = next(csv.reader([line], skipinitialspace=True))
              data_rows.append([clean_arff_value(value) for value in row])

    if not columns and data_rows:
        columns = [f"col_{i}" for i in range(len(data_rows[0]))]

    df = pd.DataFrame(data_rows, columns=columns[: len(data_rows[0])] if data_rows else columns)
    return df


def clean_arff_value(value: str):
    cleaned = str(value).strip()
    if cleaned == "?":
        return None
    if cleaned.startswith(("'", '"')) and cleaned.endswith(("'", '"')):
        cleaned = cleaned[1:-1]
    return cleaned


def normalize_to_canonical(df: pd.DataFrame, dataset_slug: str, source_name: str) -> pd.DataFrame:
    df = df.copy()
    df.columns = [str(c).strip() for c in df.columns]

    slug = dataset_slug.lower()
    if "nsl" in slug or "kdd" in slug or "kdd" in source_name.lower():
        df = normalize_nsl_kdd(df)
    elif "unsw" in slug:
        df = normalize_unsw(df)
    elif "cic" in slug or "ids" in slug:
        df = normalize_cicids(df)
    else:
        df = normalize_generic(df)

    for col in CANONICAL_COLUMNS:
        if col not in df.columns:
            if col == "timestamp":
                df[col] = generate_timestamps(len(df))
            elif col in {"src_ip", "dst_ip"}:
                df[col] = "0.0.0.0"
            elif col in {"protocol", "connection_state"}:
                df[col] = "unknown"
            else:
                df[col] = 0

    df = df[CANONICAL_COLUMNS]
    timestamps = pd.Series(generate_timestamps(len(df)), index=df.index)
    df["timestamp"] = df["timestamp"].astype(str).replace({"nan": "", "None": ""}).where(
        df["timestamp"].astype(str).str.strip().ne(""), timestamps
    )
    return df


def normalize_nsl_kdd(df: pd.DataFrame) -> pd.DataFrame:
    if len(df.columns) == 43 and not any(c in df.columns for c in ["protocol_type", "flag", "src_bytes"]):
        df.columns = [
            "duration",
            "protocol_type",
            "service",
            "flag",
            "src_bytes",
            "dst_bytes",
            "land",
            "wrong_fragment",
            "urgent",
            "hot",
            "num_failed_logins",
            "logged_in",
            "num_compromised",
            "root_shell",
            "su_attempted",
            "num_root",
            "num_file_creations",
            "num_shells",
            "num_access_files",
            "num_outbound_cmds",
            "is_host_login",
            "is_guest_login",
            "count",
            "srv_count",
            "serror_rate",
            "srv_serror_rate",
            "rerror_rate",
            "srv_rerror_rate",
            "same_srv_rate",
            "diff_srv_rate",
            "srv_diff_host_rate",
            "dst_host_count",
            "dst_host_srv_count",
            "dst_host_same_srv_rate",
            "dst_host_diff_srv_rate",
            "dst_host_same_src_port_rate",
            "dst_host_srv_diff_host_rate",
            "dst_host_serror_rate",
            "dst_host_srv_serror_rate",
            "dst_host_rerror_rate",
            "dst_host_srv_rerror_rate",
            "label",
            "difficulty_level",
        ]

    cols = [
        "duration",
        "protocol_type",
        "service",
        "flag",
        "src_bytes",
        "dst_bytes",
        "land",
        "wrong_fragment",
        "urgent",
        "hot",
        "num_failed_logins",
        "logged_in",
        "num_compromised",
        "root_shell",
        "su_attempted",
        "num_root",
        "num_file_creations",
        "num_shells",
        "num_access_files",
        "num_outbound_cmds",
        "is_host_login",
        "is_guest_login",
        "count",
        "srv_count",
        "serror_rate",
        "srv_serror_rate",
        "rerror_rate",
        "srv_rerror_rate",
        "same_srv_rate",
        "diff_srv_rate",
        "srv_diff_host_rate",
        "dst_host_count",
        "dst_host_srv_count",
        "dst_host_same_srv_rate",
        "dst_host_diff_srv_rate",
        "dst_host_same_src_port_rate",
        "dst_host_srv_diff_host_rate",
        "dst_host_serror_rate",
        "dst_host_srv_serror_rate",
        "dst_host_rerror_rate",
        "dst_host_srv_rerror_rate",
        "label",
        "difficulty_level",
    ]

    if len(df.columns) == 43 and not any(c in df.columns for c in ["protocol_type", "flag"]):
        df.columns = cols

    df = df.rename(
        columns={
            "protocol_type": "protocol",
            "src_bytes": "packet_size",
            "flag": "tcp_flags",
            "dst_host_srv_count": "connection_state",
            "service": "service_name",
        }
    )
    df["src_ip"] = "0.0.0.0"
    df["dst_ip"] = "0.0.0.0"
    df["byte_rate"] = numeric_series(df, "packet_size")
    df["label"] = string_series(df, "label", default="normal").apply(normalize_label)
    df["timestamp"] = generate_timestamps(len(df))
    return df


def normalize_unsw(df: pd.DataFrame) -> pd.DataFrame:
    rename_map = {
        "srcip": "src_ip",
        "dstip": "dst_ip",
        "proto": "protocol",
        "sbytes": "packet_size",
        "dur": "duration",
        "stcpb": "tcp_flags",
        "sload": "byte_rate",
        "state": "connection_state",
        "label": "label",
        "attack_cat": "_attack_cat",
        "timestamp": "timestamp",
    }
    df = df.rename(columns={k: v for k, v in rename_map.items() if k in df.columns})
    df["label"] = string_series(df, "label", default="normal").apply(normalize_label)
    if "byte_rate" not in df.columns:
        df["byte_rate"] = 0
    df["timestamp"] = string_series(df, "timestamp", default=None)
    return df


def normalize_cicids(df: pd.DataFrame) -> pd.DataFrame:
    rename_map = {
        "Source IP": "src_ip",
        "Destination IP": "dst_ip",
        "Protocol": "protocol",
        "Total Length of Fwd Packets": "packet_size",
        "Flow Duration": "duration",
        "FIN Flag Count": "tcp_flags",
        "Flow Bytes/s": "byte_rate",
        "Flow ID": "connection_state",
        "Label": "label",
        "Timestamp": "timestamp",
    }
    df = df.rename(columns={k: v for k, v in rename_map.items() if k in df.columns})
    df["label"] = string_series(df, "label", default="BENIGN").apply(normalize_label)
    df["timestamp"] = string_series(df, "timestamp", default=None)
    return df


def normalize_generic(df: pd.DataFrame) -> pd.DataFrame:
    rename_map = {
        "timestamp": "timestamp",
        "src_ip": "src_ip",
        "dst_ip": "dst_ip",
        "protocol": "protocol",
        "packet_size": "packet_size",
        "duration": "duration",
        "tcp_flags": "tcp_flags",
        "byte_rate": "byte_rate",
        "connection_state": "connection_state",
        "label": "label",
    }
    df = df.rename(columns={k: v for k, v in rename_map.items() if k in df.columns})
    return df


def normalize_label(value) -> str:
    normalized = str(value).strip().lower()
    if normalized in {"0", "normal", "benign", ""}:
        return "normal"
    return "anomaly"


def generate_timestamps(count: int) -> list[str]:
    start = datetime(2026, 4, 3, 8, 0, 0)
    return [(start + timedelta(seconds=i * 30)).isoformat(timespec="seconds") for i in range(count)]


def string_series(df: pd.DataFrame, column: str, default: str | None) -> pd.Series:
    if column in df.columns:
        return df[column].astype(str).fillna("" if default is None else default)
    values = [default if default is not None else "" for _ in range(len(df))]
    return pd.Series(values, index=df.index, dtype="object")


def numeric_series(df: pd.DataFrame, column: str) -> pd.Series:
    if column in df.columns:
        return pd.to_numeric(df[column], errors="coerce").fillna(0)
    return pd.Series([0] * len(df), index=df.index, dtype="float64")


def slugify(value: str) -> str:
    return re.sub(r"[^a-zA-Z0-9._-]+", "_", value.strip()).strip("_").lower() or "dataset"


def infer_source(dataset_slug: str) -> str:
    slug = dataset_slug.lower()
    if "nsl" in slug or "kdd" in slug:
        return "NSL-KDD"
    if "unsw" in slug:
        return "UNSW-NB15"
    if "cic" in slug or "ids" in slug:
        return "CICIDS"
    return "NSL-KDD"


def sync_local_dataset(server_url: str, file_name: str, source: str, name: str, sync_token: str = "") -> None:
    payload = json.dumps({
        "fileName": file_name,
        "source": source,
        "name": name,
    }).encode("utf-8")

    headers = {"Content-Type": "application/json"}
    if sync_token:
        headers["X-Sync-Token"] = sync_token

    request = urllib.request.Request(
        f"{server_url.rstrip('/')}/api/dataset/sync-local",
        data=payload,
        headers=headers,
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            body = response.read().decode("utf-8")
            print(f"Backend sync response: {body}")
    except urllib.error.HTTPError as err:
        print(f"Backend sync failed: {err.code} {err.reason}")
        print(err.read().decode("utf-8", errors="ignore"))
    except urllib.error.URLError as err:
        print(f"Backend sync unavailable: {err.reason}")


if __name__ == "__main__":
    main()
