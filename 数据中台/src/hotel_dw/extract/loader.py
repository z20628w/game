"""抽取层 · 把原始文件登记成 DuckDB 只读视图。

设计要点：
  * 全部按 VARCHAR 读进来（all_varchar=true）。
    原因：原始层的职责是「原样保留」，不是「猜类型」。让 DuckDB 自动推类型，
    一旦某天导出的 CSV 里混进一个 "N/A"，整张表就报错或悄悄变成 VARCHAR，
    行为随数据漂移。统一当字符串收，由清洗层（staging）显式 TRY_CAST ——
    类型转换必须发生在能被测试、能被规则检查的地方。
  * 附带 filename=true，于是每个视图多一列 filename。
    这一列会一路带到 staging 的 src_file，任何数字都能反查到来源文件。
"""

from __future__ import annotations

from ..config import Config
from ..db import Warehouse


def source_file_specs(cfg: Config) -> list[dict]:
    """把 config/data_sources.yaml 的 sources[].files[] 摊平成一张对接清单。"""
    specs: list[dict] = []
    for src in cfg.sources.get("sources", []) or []:
        for f in src.get("files", []) or []:
            specs.append({
                "source": src.get("key", "?"),
                "source_name": src.get("name", src.get("key", "?")),
                "mode": src.get("mode", "manual"),
                "business": src.get("business", []),
                "table": f["table"],
                "glob": f["glob"],
                "desc": f.get("desc", ""),
            })
    return specs


def load_raw_views(wh: Warehouse, cfg: Config, auditor=None) -> dict[str, dict]:
    """登记全部原始视图，返回 {table: 信息}。

    同一个 table 可能被多个来源声明（渠道表同时来自 OTA 和新媒体），
    这里按原样重复登记也不会出错 —— 后登记者只是重建了同一个视图，
    因为 config 里两边指的 glob 本来就是同一个（manual/channel_*.csv）。
    """
    raw_dir = cfg.path("raw", make=False)
    result: dict[str, dict] = {}

    for spec in source_file_specs(cfg):
        pattern = (raw_dir / spec["glob"]).as_posix()
        registered = wh.register_raw_csv(
            spec["table"], pattern, all_varchar=True, filename=True)
        rows = wh.row_count(f"raw_{spec['table']}") if registered else 0

        result[spec["table"]] = {
            **spec,
            "pattern": pattern,
            "registered": registered,
            "rows": rows,
        }
        if auditor:
            auditor.write(
                "extract", f"raw_{spec['table']}",
                status="ok" if registered else "empty",
                detail=(f"{spec['source_name']} / {spec['glob']} → {rows} 行"
                        if registered else f"{spec['source_name']} / {spec['glob']} → 无文件，跳过"),
                extra={"mode": spec["mode"], "pattern": pattern, "rows": rows},
            )
    return result
