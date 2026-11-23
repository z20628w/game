"""清洗层驱动：按文件名顺序执行 sql/staging/*.sql。"""

from __future__ import annotations

import re
from pathlib import Path

from ..config import Config
from ..db import Warehouse, run_sql_file

# 清洗 SQL 里引用的原始视图，例如 FROM raw_pms_revenue
_RAW_REF = re.compile(r"\braw_([A-Za-z_][A-Za-z0-9_]*)")


def staging_files(cfg: Config) -> list[Path]:
    """清洗层 SQL 清单（文件名排序）。"""
    return sorted((cfg.root / "sql" / "staging").glob("*.sql"))


def _missing_raw_views(wh: Warehouse, text: str) -> list[str]:
    refs = {m for m in _RAW_REF.findall(text)}
    return sorted(r for r in refs if not wh.has_table(f"raw_{r}"))


def run_clean(cfg: Config, wh: Warehouse, auditor=None) -> list[dict]:
    """执行全部清洗 SQL，返回每张表的落地情况。

    清洗层是可重跑的：所有语句都是 CREATE OR REPLACE TABLE，
    重跑不会追加、不会重复，天然幂等。

    动 SQL 之前先检查它依赖的原始视图在不在 —— 不然 DuckDB 只会甩一句
    「Table with name raw_xxx does not exist」，让人摸不着头脑。
    """
    results: list[dict] = []
    for path in staging_files(cfg):
        text = path.read_text(encoding="utf-8")

        missing = _missing_raw_views(wh, text)
        if missing:
            views = "、".join(f"raw_{m}" for m in missing)
            raise RuntimeError(
                f"{path.name} 依赖的原始视图不存在：{views}\n"
                "原因：data/raw 下没有对应的导出文件，抽取阶段跳过了这些数据源。\n"
                "处理办法二选一：\n"
                "  · 有真实数据：按 config/columns_map.yaml 改成中台统一列名，"
                "按 <业务>_<YYYYMMDD>.csv 命名，放进 data/raw/ 后重跑 extract\n"
                "  · 只想把链路跑通：python run.py pipeline --regenerate"
            )

        table = path.stem
        n_stmt = run_sql_file(wh, path)
        rows = wh.row_count(table) if wh.has_table(table) else 0
        item = {"file": path.name, "table": table, "statements": n_stmt, "rows": rows}
        results.append(item)
        if auditor:
            auditor.write("transform", table,
                          detail=f"{path.name} → {rows} 行",
                          extra={"statements": n_stmt})
    return results
