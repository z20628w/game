"""落地层：把内存里的表固化成湖仓格式。

对应简报 P3 的「03 中台计算管道 · 湖仓（Iceberg + DuckDB）」。
本项目先用 Parquet 落地：DuckDB 原生读写、零外部依赖、单机足够；
换成真正的 Apache Iceberg 时，只需要改 settings.lakehouse.backend，
接口位置（persist 系列函数的产出约定）保持不变。
"""

from __future__ import annotations

from .writer import (
    manifest_path,
    persist_staging,
    snapshot_table,
    write_manifest,
)

__all__ = ["persist_staging", "snapshot_table", "write_manifest", "manifest_path"]
