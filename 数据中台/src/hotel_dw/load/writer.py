"""落地层实现：Parquet 快照 + 运行清单。

三件事：
  * persist_staging —— 把 stg_* 固化成 Parquet（可重跑的中间结果）
  * snapshot_table  —— 通用单表快照，marts 也走它
  * write_manifest  —— 写一份运行清单，记录本次跑了什么、产物多大、指纹多少
"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any

from ..audit import TZ, Auditor
from ..config import Config
from ..db import Warehouse

# 湖仓根目录（相对 settings.paths.staging 的兄弟目录，统一放 data/lakehouse）
LAKE_DIR = "data/lakehouse"


def lake_root(cfg: Config) -> Path:
    p = cfg.root / LAKE_DIR
    p.mkdir(parents=True, exist_ok=True)
    return p


def snapshot_table(
    wh: Warehouse,
    cfg: Config,
    table: str,
    layer: str,
    compression: str | None = None,
) -> dict | None:
    """把一张表写成 Parquet 快照，返回产物信息（表不存在则返回 None）。"""
    if not wh.has_table(table):
        return None
    comp = compression or cfg.settings.get("lakehouse", {}).get("parquet", {}).get("compression", "zstd")
    out = lake_root(cfg) / layer / f"{table}.parquet"
    wh.to_parquet(f'SELECT * FROM "{table}"', out, compression=comp)
    rows = wh.row_count(table)
    return {
        "table": table,
        "layer": layer,
        "file": str(out),
        "rows": rows,
        "bytes": out.stat().st_size,
        "sha256": Auditor.fingerprint(out),
    }


def persist_staging(cfg: Config, wh: Warehouse, auditor=None) -> list[dict]:
    """把清洗层的每张 stg_* 表固化成 Parquet。"""
    tables = [t for t in wh.tables() if t.startswith("stg_")]
    out: list[dict] = []
    for t in sorted(tables):
        info = snapshot_table(wh, cfg, t, layer="staging")
        if info:
            out.append(info)
            if auditor:
                auditor.write("load", t, detail=f"→ {info['rows']} 行 / {info['bytes']} 字节",
                              extra={"sha256": info["sha256"]})
    return out


def manifest_path(cfg: Config, biz_date: str) -> Path:
    return cfg.path("logs") / f"manifest_{biz_date}.json"


def write_manifest(cfg: Config, biz_date: str, payload: dict[str, Any]) -> Path:
    """写运行清单。这是「凭证与日志留痕」的第二道痕迹：
    除了逐动作的 JSONL 审计，还有一份「本次成品长什么样」的快照清单。"""
    p = manifest_path(cfg, biz_date)
    payload = {
        "biz_date": biz_date,
        "generated_at": datetime.now(TZ).isoformat(timespec="seconds"),
        **payload,
    }
    p.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return p
