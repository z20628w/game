"""成表层：把清洗结果按口径做成报表，并导出交付物。

对应简报 P3 的「04 企业微信交付」之前的最后一步 ——
报表结构和口径全部来自 config/report_rules.yaml 的 marts 段，
这里只负责执行 SQL、导出 CSV（带 BOM 给 Excel）、记录产物指纹。
"""

from __future__ import annotations

from .builder import (
    artifacts_path,
    build_marts,
    current_biz_date,
    export_marts,
    load_artifacts,
    mart_defs,
    save_artifacts,
)

__all__ = [
    "build_marts", "export_marts", "current_biz_date",
    "mart_defs", "artifacts_path", "load_artifacts", "save_artifacts",
]
