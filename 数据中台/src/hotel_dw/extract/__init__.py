"""抽取层：把原始数据「接进来」。

对应简报 P3 的「01 内网数据源」→「02 自建专网」→ 中台 这段：

    * mode=auto   的数据源（WedaSys PMS / 会员），将来由自建专网的 Connector 直连；
                  本项目在 config/data_sources.yaml 里声明了对接点，实现留给专网侧。
    * mode=manual 的数据源（OTA 后台 / 新媒体后台 / 人工财务套表），
                  保留人工导出、统一导入，落到 data/raw/ 下。

本层只做两件事，且都不改变数据内容：
    1) loader —— 把命中的原始文件登记成 DuckDB 只读视图 raw_<table>，
                 并附上 filename 血缘列（哪一行来自哪个导出文件）。
    2) mock   —— 生成可复跑的模拟数据，保证没有内网也能把全链路跑通。

一条纪律：本层不碰 data/raw 里的既有内容（除了 mock 这个「模拟上游」的角色）。
"""

from __future__ import annotations

from .loader import load_raw_views, source_file_specs
from .mock import generate_mock

__all__ = ["load_raw_views", "source_file_specs", "generate_mock"]
