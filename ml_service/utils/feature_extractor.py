"""Feature extractor - select and validate canonical features."""
import numpy as np
import pandas as pd


CANONICAL_FEATURES = [
    "src_ip",
    "dst_ip",
    "protocol",
    "packet_size",
    "duration",
    "tcp_flags",
    "byte_rate",
    "connection_state",
]


def extract_features(df: pd.DataFrame) -> pd.DataFrame:
    """Ensure all canonical features exist; fill missing with defaults."""
    for col in CANONICAL_FEATURES:
        if col not in df.columns:
            if col in ["src_ip", "dst_ip"]:
                df[col] = "0.0.0.0"
            elif col in ["protocol", "connection_state"]:
                df[col] = "unknown"
            else:
                df[col] = 0.0
    return df[CANONICAL_FEATURES]


def validate_schema(df: pd.DataFrame, min_rows: int = 1) -> dict:
    """Validate that a DataFrame has at least the minimum required columns."""
    present = set(df.columns)
    required = set()
    numeric_required = {"packet_size", "duration", "byte_rate"}

    missing_required = required - present
    missing_numeric = numeric_required - present

    issues = []
    if missing_required:
        issues.append(f"Missing required columns: {missing_required}")
    if len(df) < min_rows:
        issues.append(f"Dataset has only {len(df)} rows (minimum: {min_rows})")

    warnings = []
    if missing_numeric:
        warnings.append(f"Missing numeric columns (will default to 0): {missing_numeric}")

    return {
        "valid": len(issues) == 0,
        "issues": issues,
        "warnings": warnings,
        "row_count": len(df),
        "columns_found": list(present),
    }
