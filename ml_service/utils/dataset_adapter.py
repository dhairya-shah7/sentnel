"""
Dataset adapter — maps raw CSV columns from each dataset format
to the canonical SentinelOps schema:
  src_ip, dst_ip, protocol, packet_size, duration,
  tcp_flags, byte_rate, connection_state, label
"""
import pandas as pd
import numpy as np


class DatasetAdapter:
    """Adapts any supported dataset format to canonical schema."""

    SUPPORTED = ["UNSW-NB15", "NSL-KDD", "CICIDS"]

    def __init__(self, source: str):
        source = str(source or "").upper().strip()
        if source in [s.upper() for s in self.SUPPORTED]:
            self.source = source
            return

        # fuzzy match common dataset families
        if "UNSW" in source:
            self.source = "UNSW-NB15"
        elif "NSL" in source or "KDD" in source:
            self.source = "NSL-KDD"
        elif "CIC" in source or "IDS" in source:
            self.source = "CICIDS"
        else:
            # Generic/custom CSVs are supported through best-effort inference.
            self.source = "CUSTOM"

    def adapt(self, df: pd.DataFrame) -> pd.DataFrame:
        """Convert raw dataset columns to canonical schema."""
        # Strip whitespace from all column names (CICIDS bug)
        df = df.copy()
        df.columns = [str(c).strip() for c in df.columns]

        if "UNSW" in self.source.upper():
            return self._adapt_unsw_nb15(df)
        elif "NSL" in self.source.upper() or "KDD" in self.source.upper():
            return self._adapt_nsl_kdd(df)
        elif "CIC" in self.source.upper():
            return self._adapt_cicids(df)
        return self._adapt_generic(df)

    def _adapt_unsw_nb15(self, df: pd.DataFrame) -> pd.DataFrame:
        """UNSW-NB15: 49 features."""
        mapping = {
            # source col → canonical col
            "srcip": "src_ip",
            "dstip": "dst_ip",
            "proto": "protocol",
            "sbytes": "packet_size",   # source bytes as proxy
            "dur": "duration",
            "stcpb": "tcp_flags",      # TCP base sequence number proxy
            "Sload": "byte_rate",      # bits per second (source load)
            "state": "connection_state",
            "label": "label",
            "attack_cat": "_attack_cat",
        }
        # Some files use 'Label' with capital L
        if "Label" in df.columns and "label" not in df.columns:
            df = df.rename(columns={"Label": "label"})

        df = self._remap(df, mapping)
        df["label"] = df["label"].apply(lambda x: "normal" if str(x).strip() in ["0", "Normal", "normal", ""] else "anomaly")
        return df

    def _adapt_nsl_kdd(self, df: pd.DataFrame) -> pd.DataFrame:
        """NSL-KDD: 43 columns, often no header."""
        NSL_KDD_COLS = [
            "duration", "protocol_type", "service", "flag", "src_bytes",
            "dst_bytes", "land", "wrong_fragment", "urgent", "hot",
            "num_failed_logins", "logged_in", "num_compromised", "root_shell",
            "su_attempted", "num_root", "num_file_creations", "num_shells",
            "num_access_files", "num_outbound_cmds", "is_host_login",
            "is_guest_login", "count", "srv_count", "serror_rate",
            "srv_serror_rate", "rerror_rate", "srv_rerror_rate", "same_srv_rate",
            "diff_srv_rate", "srv_diff_host_rate", "dst_host_count",
            "dst_host_srv_count", "dst_host_same_srv_rate", "dst_host_diff_srv_rate",
            "dst_host_same_src_port_rate", "dst_host_srv_diff_host_rate",
            "dst_host_serror_rate", "dst_host_srv_serror_rate",
            "dst_host_rerror_rate", "dst_host_srv_rerror_rate",
            "label", "difficulty_level",
        ]
        if len(df.columns) == 43 and not any(c in df.columns for c in ["protocol_type", "flag"]):
            df.columns = NSL_KDD_COLS

        mapping = {
            "protocol_type": "protocol",
            "src_bytes": "packet_size",
            "flag": "tcp_flags",
            "dst_host_srv_count": "connection_state",
        }
        df = self._remap(df, mapping)

        # Fill missing canonical cols
        df["src_ip"] = "0.0.0.0"
        df["dst_ip"] = "0.0.0.0"
        df["byte_rate"] = df.get("packet_size", pd.Series(0)) / (df.get("duration", pd.Series(1)).replace(0, 1))
        df["label"] = df["label"].apply(lambda x: "normal" if str(x).strip().lower() == "normal" else "anomaly")
        return df

    def _adapt_cicids(self, df: pd.DataFrame) -> pd.DataFrame:
        """CICIDS 2017: 79 features, CICFlowMeter output."""
        mapping = {
            "Source IP": "src_ip",
            " Source IP": "src_ip",
            "Destination IP": "dst_ip",
            " Destination IP": "dst_ip",
            "Protocol": "protocol",
            " Protocol": "protocol",
            "Total Length of Fwd Packets": "packet_size",
            " Total Length of Fwd Packets": "packet_size",
            "Flow Duration": "duration",
            " Flow Duration": "duration",
            "FIN Flag Count": "tcp_flags",
            " FIN Flag Count": "tcp_flags",
            "Flow Bytes/s": "byte_rate",
            " Flow Bytes/s": "byte_rate",
            "Flow ID": "connection_state",
            " Flow ID": "connection_state",
            "Label": "label",
            " Label": "label",
        }
        df = self._remap(df, mapping)
        df["label"] = df["label"].apply(
            lambda x: "normal" if str(x).strip().upper() in ["BENIGN", "NORMAL", "0"] else "anomaly"
        )
        return df

    def _adapt_generic(self, df: pd.DataFrame) -> pd.DataFrame:
        """Best-effort adapter for custom CSV files."""
        mapping = {}
        for col in df.columns:
            key = col.lower().strip()
            if key in {"src_ip", "srcip", "source_ip", "sourceip", "src", "source"}:
                mapping[col] = "src_ip"
            elif key in {"dst_ip", "dstip", "destination_ip", "destinationip", "dst", "destination"}:
                mapping[col] = "dst_ip"
            elif key in {"protocol", "proto"}:
                mapping[col] = "protocol"
            elif key in {"packet_size", "packet", "size", "src_bytes", "sbytes"}:
                mapping[col] = "packet_size"
            elif key in {"duration", "dur", "flow_duration"}:
                mapping[col] = "duration"
            elif key in {"tcp_flags", "flags", "flag"}:
                mapping[col] = "tcp_flags"
            elif key in {"byte_rate", "flow_bytes_s", "bytes_s", "sload", "rate"}:
                mapping[col] = "byte_rate"
            elif key in {"connection_state", "state", "conn_state"}:
                mapping[col] = "connection_state"
            elif key in {"label", "class", "target", "anomaly"}:
                mapping[col] = "label"

        df = df.rename(columns=mapping)
        df = self._remap(df, {})

        # Add best-effort defaults if the file doesn't contain network context.
        if "src_ip" not in df.columns:
            df["src_ip"] = "0.0.0.0"
        if "dst_ip" not in df.columns:
            df["dst_ip"] = "0.0.0.0"

        df["protocol"] = df["protocol"].fillna("unknown")
        df["connection_state"] = df["connection_state"].fillna("unknown")

        if "label" in df.columns:
            df["label"] = df["label"].apply(
                lambda x: "normal" if str(x).strip().lower() in {"0", "normal", "benign", ""} else "anomaly"
            )
        else:
            df["label"] = "unknown"

        if "packet_size" not in df.columns:
            df["packet_size"] = 0
        if "duration" not in df.columns:
            df["duration"] = 0
        if "tcp_flags" not in df.columns:
            df["tcp_flags"] = ""
        if "byte_rate" not in df.columns:
            df["byte_rate"] = 0

        return df

    def _remap(self, df: pd.DataFrame, mapping: dict) -> pd.DataFrame:
        """Apply column renaming and ensure canonical cols exist."""
        rename_map = {k: v for k, v in mapping.items() if k in df.columns}
        df = df.rename(columns=rename_map)

        canonical = ["src_ip", "dst_ip", "protocol", "packet_size", "duration", "tcp_flags", "byte_rate", "connection_state", "label"]
        for col in canonical:
            if col not in df.columns:
                df[col] = np.nan if col not in ["src_ip", "dst_ip", "protocol", "connection_state", "label"] else "unknown"

        return df[canonical + [c for c in df.columns if c not in canonical and not c.startswith("_")]]
