"""清洗层：raw → stg。

这一层的实现全部在 SQL 文件里（sql/staging/*.sql），Python 只负责驱动。
为什么把逻辑放 SQL 而不是 Python？因为口径是财务和运营的资产，
放在 .sql 里可读、可评审、可 diff；换个口径就是改几行 SQL，不需要改程序。

清洗层只做「统一列名 + 类型纠正」，不做过滤 —— 过滤会让校验规则失去意义。
"""

from __future__ import annotations

from .cleaner import run_clean, staging_files

__all__ = ["run_clean", "staging_files"]
