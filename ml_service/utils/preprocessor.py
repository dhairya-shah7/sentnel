"""
Preprocessor - cleans, normalizes, and encodes the canonical DataFrame
for ML model consumption.
"""
from typing import Tuple

import numpy as np
import pandas as pd
from sklearn.preprocessing import MinMaxScaler


NUMERIC_FEATURES = ["packet_size", "duration", "byte_rate", "tcp_flags"]
CATEGORICAL_FEATURES = ["protocol", "connection_state"]

# Known protocol values for consistent encoding
PROTOCOL_MAP = {
    "tcp": 0,
    "udp": 1,
    "icmp": 2,
    "http": 3,
    "https": 4,
    "dns": 5,
    "ftp": 6,
    "ssh": 7,
    "smtp": 8,
    "other": 9,
    "unknown": 9,
    "nan": 9,
    "6": 0,
    "17": 1,
    "1": 2,
}

STATE_MAP = {
    "established": 0,
    "syn_sent": 1,
    "syn_recv": 2,
    "fin_wait": 3,
    "close_wait": 4,
    "closed": 5,
    "unknown": 6,
    "nan": 6,
    "con": 0,
    "int": 1,
    "fin": 3,
    "req": 1,
    "rsp": 2,
}


class Preprocessor:
    def __init__(self):
        self.scaler = MinMaxScaler()
        self.fitted = False

    def fit_transform(self, df: pd.DataFrame) -> Tuple[np.ndarray, np.ndarray, list]:
        """
        Clean, encode, and normalize the canonical DataFrame.
        Returns: (X, y, feature_names)
        """
        df = df.copy()

        # 1. Clean numeric cols
        for col in NUMERIC_FEATURES:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors="coerce")
                df[col] = df[col].replace([np.inf, -np.inf], np.nan)
                df[col] = df[col].fillna(df[col].median() if df[col].notna().any() else 0)
            else:
                df[col] = 0.0

        # 2. Encode categoricals
        df["protocol_enc"] = (
            df["protocol"].astype(str).str.lower().str.strip().map(lambda x: PROTOCOL_MAP.get(x, 9))
        )
        df["state_enc"] = (
            df["connection_state"].astype(str).str.lower().str.strip().map(lambda x: STATE_MAP.get(x, 6))
        )

        # 3. Build feature matrix
        feature_names = NUMERIC_FEATURES + ["protocol_enc", "state_enc"]
        X = df[feature_names].values.astype(np.float64)
        X = np.clip(X, -1e9, 1e9)

        self.fitted = True

        # 4. Labels are intentionally ignored - this is an unsupervised pipeline.
        y = np.zeros(len(df), dtype=int)

        return X, y, feature_names

    def transform(self, df: pd.DataFrame) -> Tuple[np.ndarray, np.ndarray, list]:
        """Transform without fitting (use after fit_transform)."""
        return self.fit_transform(df)
