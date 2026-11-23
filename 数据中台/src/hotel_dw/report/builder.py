"""成表层实现。

分工：
    build_marts       —— 执行 sql/marts/*.sql，在 DuckDB 里建出 mart_* 表
    export_marts      —— 把交付表导成 data/marts/*.csv（带 BOM）与 Parquet 快照
    current_biz_date  —— 从数据里推导「本期业务日期」，作为整个交付的批次号

为什么要写 artifacts_<日期>.json？
    approve 和 deliver 是两次独立的命令行调用，中间隔着人工复核（可能是几小时后）。
    把产物清单（路径 + 大小 + sha256）落盘，交付时就能核对
    「待发出去的报表 == 财务当时批准的那份」，审批凭证才真正绑得住制品。
"""

from __future__ import annotations

import json
from datetime import date, datetime
from pathlib import Path

from ..audit import Auditor
from ..config import Config
from ..db import Warehouse, run_sql_file


def mart_defs(cfg: Config) -> dict:
    return cfg.rules.get("marts") or {}


def current_biz_date(wh: Warehouse) -> str:
    """本期业务日期 = 收入明细里的最大业务日期。取不到就退回今天。"""
    latest = wh.scalar("SELECT max(biz_date) FROM stg_pms_revenue") if wh.has_table("stg_pms_revenue") else None
    if latest is None:
        return date.today().isoformat()
    if isinstance(latest, str):
        return latest[:10]
    if isinstance(latest, datetime):
        return latest.date().isoformat()
    return latest.isoformat()


def build_marts(cfg: Config, wh: Warehouse, auditor=None) -> list[dict]:
    """执行全部 marts SQL。文件可能产出多张表（财务日报 4 张、周报 4 张）。"""
    results: list[dict] = []
    for key, mart in mart_defs(cfg).items():
        rel = mart.get("sql")
        if not rel:
            continue
        path = cfg.root / rel
        n_stmt = run_sql_file(wh, path)
        info = {"mart": key, "title": mart.get("title", key), "sql": rel, "statements": n_stmt}
        results.append(info)
        if auditor:
            auditor.write("build", key, detail=f"{rel} → 执行 {n_stmt} 条语句",
                          extra={"cadence": mart.get("cadence"), "sheets": mart.get("sheets")})
    return results


def export_marts(cfg: Config, wh: Warehouse, auditor=None) -> list[dict]:
    """导出交付物：CSV（给财务看）+ Parquet 快照（给湖仓用）。"""
    out_dir = cfg.path("marts")
    pq_dir = out_dir / "parquet"
    exported: list[dict] = []

    for key, mart in mart_defs(cfg).items():
        # 校验基表也留一份 Parquet，便于事后追溯规则判定依据
        vt = mart.get("validation_table")
        if vt and wh.has_table(vt):
            wh.to_parquet(f'SELECT * FROM "{vt}"', pq_dir / f"{vt}.parquet")

        for out in mart.get("outputs", []) or []:
            table = out.get("table")
            if not table or not wh.has_table(table):
                continue
            order = out.get("order_by")
            sql = f'SELECT * FROM "{table}"' + (f" ORDER BY {order}" if order else "")

            csv_path = out_dir / out["file"]
            wh.to_csv(sql, csv_path)
            wh.to_parquet(sql, pq_dir / f"{table}.parquet")

            item = {
                "mart": key,
                "title": mart.get("title", key),
                "sheet": out.get("name", table),
                "table": table,
                "file": str(csv_path),
                "filename": out["file"],
                "rows": wh.row_count(table),
                "bytes": csv_path.stat().st_size,
                "sha256": Auditor.fingerprint(csv_path),
                "cadence": mart.get("cadence"),
            }
            exported.append(item)
            if auditor:
                auditor.write("build", out["file"],
                              detail=f"{out.get('name', table)} → {item['rows']} 行 / {item['bytes']} 字节",
                              extra={"table": table, "sha256": item["sha256"]})

    return exported


# ---------------- 产物清单落盘 ----------------

def artifacts_path(cfg: Config, biz_date: str) -> Path:
    return cfg.path("review") / f"artifacts_{biz_date}.json"


def save_artifacts(cfg: Config, biz_date: str, artifacts: list[dict]) -> Path:
    p = artifacts_path(cfg, biz_date)
    p.write_text(json.dumps(
        {"biz_date": biz_date, "count": len(artifacts), "artifacts": artifacts},
        ensure_ascii=False, indent=2), encoding="utf-8")
    return p


def load_artifacts(cfg: Config, biz_date: str) -> list[dict]:
    p = artifacts_path(cfg, biz_date)
    if not p.is_file():
        return []
    return json.loads(p.read_text(encoding="utf-8")).get("artifacts", [])
