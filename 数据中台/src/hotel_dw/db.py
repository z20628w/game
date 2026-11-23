"""DuckDB 计算引擎封装。

对应简报 P3「03 中台计算管道」里的「计算 · DuckDB 引擎」。
整个中台只有这一个计算引擎：清洗、计算、校验、成表全部用 SQL 跑在 DuckDB 上，
不引入 Spark、不引入集群 —— 这就是简报里「轻量中台」的意思。

同时在这里守住一条硬约束：原始层只读。
任何试图往 data/raw 写文件的调用都会被直接拦下（见 guard_raw）。
"""

from __future__ import annotations

import contextlib
import csv
import glob
from pathlib import Path
from typing import Any, Iterable, Sequence

import duckdb

from .config import Config


class RawLayerWriteBlocked(Exception):
    """试图写原始层。"""


def guard_raw(cfg: Config, path: Path) -> None:
    """原始层只读的守门员。"""
    if not cfg.read_only_raw:
        return
    raw = cfg.path("raw", make=False).resolve()
    try:
        path.resolve().relative_to(raw)
    except ValueError:
        return  # 不在 raw 目录下，放行
    raise RawLayerWriteBlocked(
        f"禁止写入原始层：{path}\n"
        "落地原则「原始数据只读」：原始数据只能被读取，所有加工结果必须落到 staging / marts。"
        "如确需放行，改 config/settings.yaml → run.read_only_raw = false。"
    )


class Warehouse:
    """DuckDB 连接 + 常用读写助手。用法：

        with Warehouse(cfg) as wh:
            wh.execute("CREATE TABLE t AS SELECT 1")
            rows = wh.query("SELECT * FROM t")
             cols, rows = wh.query_with_cols("SELECT * FROM t")
    """

    def __init__(self, cfg: Config, read_only: bool = False):
        self.cfg = cfg
        self.db_path = cfg.file("db")
        self.con = duckdb.connect(str(self.db_path), read_only=read_only)
        self.con.execute("PRAGMA threads=4")

    # ---------- 生命周期 ----------
    def __enter__(self) -> "Warehouse":
        return self

    def __exit__(self, *exc) -> None:
        self.close()

    def close(self) -> None:
        with contextlib.suppress(Exception):
            self.con.close()

    # ---------- 查询 ----------
    def execute(self, sql: str, params: Sequence[Any] | None = None) -> None:
        self.con.execute(sql, params or [])

    def executescript(self, sql: str) -> None:
        """执行多语句脚本（DDL 文件用）。"""
        self.con.execute(sql)

    def query(self, sql: str, params: Sequence[Any] | None = None) -> list[tuple]:
        return self.con.execute(sql, params or []).fetchall()

    def query_with_cols(self, sql: str, params: Sequence[Any] | None = None):
        cur = self.con.execute(sql, params or [])
        cols = [d[0] for d in cur.description]
        return cols, cur.fetchall()

    def query_dicts(self, sql: str, params: Sequence[Any] | None = None) -> list[dict]:
        cols, rows = self.query_with_cols(sql, params)
        return [dict(zip(cols, r)) for r in rows]

    def scalar(self, sql: str, params: Sequence[Any] | None = None):
        row = self.con.execute(sql, params or []).fetchone()
        return row[0] if row else None

    # ---------- 元数据 ----------
    def tables(self) -> list[str]:
        return [r[0] for r in self.query(
            "SELECT table_name FROM information_schema.tables ORDER BY table_name")]

    def has_table(self, name: str) -> bool:
        return self.scalar(
            "SELECT count(*) FROM information_schema.tables WHERE table_name = ?", [name]) > 0

    def columns_of(self, name: str) -> list[str]:
        return [r[0] for r in self.query(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = ? ORDER BY ordinal_position", [name])]

    def row_count(self, name: str) -> int:
        return int(self.scalar(f'SELECT count(*) FROM "{name}"') or 0)

    # ---------- 写盘 ----------
    def to_parquet(self, sql: str, out_file: Path, compression: str = "zstd") -> Path:
        """把查询结果写成 Parquet（湖仓层的落地格式）。"""
        guard_raw(self.cfg, out_file)
        out_file.parent.mkdir(parents=True, exist_ok=True)
        self.execute(
            f"COPY ({sql}) TO '{out_file.as_posix()}' (FORMAT PARQUET, COMPRESSION {compression})")
        return out_file

    def to_csv(self, sql: str, out_file: Path) -> Path:
        """把查询结果写成 CSV（交付给财务的成品）。

        这里刻意**不走** DuckDB 的 COPY。COPY 在 Windows 上是「先写临时文件、
        再重命名到目标」的两步走，只要杀软 / 索引 / 文件监控在那一瞬间压住了目标
        文件，就会抛：
            IOException: IO Error: Could not move file: 拒绝访问。
        而这个点往往正好落在导最后一张报表的时候 —— 排查起来非常难受，
        因为它跟你写的 SQL 一点关系都没有。

        报表量级是几千行、几 KB，用标准库 csv 顺序直写最稳：
        没有临时文件、没有重命名，BOM 一次写对（Excel 打开中文不乱码）。
        真出现几十万行的导出需求时，再退回 COPY 更合适。
        """
        guard_raw(self.cfg, out_file)
        out_file.parent.mkdir(parents=True, exist_ok=True)
        cols, rows = self.query_with_cols(sql)
        with out_file.open("w", encoding="utf-8-sig", newline="") as fh:
            writer = csv.writer(fh)
            writer.writerow(cols)
            writer.writerows(
                ["" if v is None else v for v in row] for row in rows)
        return out_file

    def read_csv(self, pattern: str, **opts) -> str:
        """拼出 read_csv_auto 的表函数片段，供 SQL 里引用。"""
        opt_str = ", ".join(f"{k}={v}" for k, v in opts.items())
        inner = f"'{pattern}'" + (", " + opt_str if opt_str else "")
        return f"read_csv_auto({inner})"

    def register_raw_csv(self, table: str, pattern: str, **opts) -> bool:
        """把原始 CSV 注册成只读视图 raw_<table>。没有文件就返回 False。

        注意：没有文件时必须把旧视图删掉。视图是持久化在 DuckDB 文件里的，
        文件被移走后旧视图还指向一个不存在的 glob —— 留着它，后面查询会报
        「No files found that match the pattern」，而真正的原因是「这个数据源这次没到数」。
        两句话差得很远，能让人排查半小时。
        """
        if not _glob_has_match(pattern):
            self.execute(f"DROP VIEW IF EXISTS raw_{table}")
            return False
        self.execute(
            f"CREATE OR REPLACE VIEW raw_{table} AS "
            f"SELECT * FROM {self.read_csv(pattern, **opts)}"
        )
        return True


def _glob_has_match(pattern: str) -> bool:
    """通配符是否命中至少一个文件。

    注意：别用 pattern.split("*")[0] 去当目录 —— 通配符的前缀不等于目录名
    （'.../revenue_*.csv' 的前缀是 '.../revenue_'，那不是一个目录）。
    交给 glob 判断才可靠。
    """
    return any(Path(m).is_file() for m in glob.glob(pattern, recursive=True))


def _add_bom(path: Path) -> None:
    """给 CSV 加 UTF-8 BOM，避免 Excel 打开中文乱码。"""
    data = path.read_bytes()
    if not data.startswith(b"\xef\xbb\xbf"):
        path.write_bytes(b"\xef\xbb\xbf" + data)


def split_statements(sql_text: str) -> Iterable[str]:
    """把 .sql 文件按分号拆成单条语句（忽略注释行）。"""
    buf = []
    for line in sql_text.splitlines():
        stripped = line.strip()
        if stripped.startswith("--") or not stripped:
            continue
        buf.append(line)
    return [s.strip() for s in "\n".join(buf).split(";") if s.strip()]


def run_sql_file(wh: Warehouse, path: Path, params: dict | None = None) -> int:
    """执行一个 .sql 文件，返回执行的语句条数。

    支持 ${变量} 占位符，用 params 替换 —— 让 SQL 也能吃配置。
    """
    text = path.read_text(encoding="utf-8")
    if params:
        for k, v in params.items():
            text = text.replace("${" + k + "}", str(v))
    n = 0
    for stmt in split_statements(text):
        wh.execute(stmt)
        n += 1
    return n
