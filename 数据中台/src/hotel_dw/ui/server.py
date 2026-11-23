"""本地可视化控制台 · 后端。

设计约束（都是刻意的）：

1. **零额外依赖**。整个项目只依赖 duckdb / PyYAML / requests 三个包，
   不该为了一个控制台再引入 Flask 或 FastAPI。所以直接用标准库 http.server。
   代价是要自己写路由和 JSON 解析，收益是 `pip install` 之后立刻能用。

2. **只绑 127.0.0.1**。这是个能改数据、能签字、能发企微的界面，
   不绑 0.0.0.0，不给局域网留后门。

3. **不放任意命令执行**。前端只能从 STAGES 白名单里挑命令，
   参数也走白名单校验。这个控制台是"跑管道"，不是"远程 shell"。

4. **每个任务落一份日志文件**。流式输出同时写 data/logs/ui/<job_id>.log，
   页面刷新、甚至服务重启后，历史任务的输出还在。
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import threading
import time
import uuid
from collections import OrderedDict
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from ..audit import TZ
from ..config import Config
from ..db import Warehouse
from ..load.writer import LAKE_DIR
from ..report import current_biz_date, load_artifacts
from ..review import approval_path, load_approval, review_list_path, validation_path
from .graph import build_graph

# 任务输出最多保留多少行（防止一个刷屏任务把内存吃光）
MAX_LINES = 5000
# 内存里保留最近多少个任务
MAX_JOBS = 30

# ============================================================
# 命令白名单：前端能触发的就是这些，别的一概拒绝
# options 里声明该命令可以带哪些参数，前端据此渲染表单。
# ============================================================

STAGES: list[dict] = [
    {
        "key": "selftest", "label": "体检", "group": "auto", "hint": "配置 / 规则 / 目录自检",
        "options": [],
    },
    {
        "key": "mock", "label": "生成上游数据", "group": "auto", "hint": "造模拟原始 CSV 到 data/raw",
        "options": [
            {"flag": "--days", "label": "天数", "type": "int", "default": 28},
            {"flag": "--as-of", "label": "截止日", "type": "date", "default": ""},
            {"flag": "--anomalies", "label": "种入异常", "type": "bool", "default": False},
        ],
    },
    {
        "key": "extract", "label": "抽取", "group": "auto", "hint": "原始文件登记成只读视图 raw_*",
        "options": [],
    },
    {
        "key": "transform", "label": "清洗", "group": "auto", "hint": "统一列名 + 类型纠正 → stg_*",
        "options": [],
    },
    {
        "key": "load", "label": "落湖", "group": "auto", "hint": "stg_* 固化成 Parquet 快照",
        "options": [],
    },
    {
        "key": "build", "label": "成表", "group": "auto", "hint": "按口径生成 mart_* 并导出交付 CSV",
        "options": [],
    },
    {
        "key": "check", "label": "校验", "group": "auto", "hint": "跑 13 条规则，出待复核清单",
        "options": [{"flag": "--date", "label": "业务日期", "type": "date", "default": ""}],
    },
    {
        "key": "pipeline", "label": "一键全流程", "group": "auto", "hint": "抽取→清洗→落湖→成表→校验，停在复核闸门",
        "options": [
            {"flag": "--regenerate", "label": "重建模拟数据", "type": "bool", "default": False},
            {"flag": "--anomalies", "label": "种入异常", "type": "bool", "default": False},
            {"flag": "--days", "label": "天数", "type": "int", "default": 28},
        ],
    },
    {
        "key": "review", "label": "查看待复核清单", "group": "human", "hint": "有阻断项就必须先处理",
        "options": [{"flag": "--date", "label": "业务日期", "type": "date", "default": ""}],
    },
    {
        "key": "approve", "label": "复核签字", "group": "human", "hint": "凭证绑定报表指纹，阻断项未清零会被拒",
        "options": [
            {"flag": "--reviewer", "label": "复核人", "type": "text", "default": "", "required": True},
            {"flag": "--date", "label": "业务日期", "type": "date", "default": ""},
            {"flag": "--note", "label": "备注", "type": "text", "default": ""},
        ],
    },
    {
        "key": "deliver", "label": "交付", "group": "human", "hint": "归档到微盘目录 + 企微通知",
        "options": [
            {"flag": "--date", "label": "业务日期", "type": "date", "default": ""},
            {"flag": "--send", "label": "真实推送企微", "type": "bool", "default": False},
        ],
    },
]

STAGE_BY_KEY = {s["key"]: s for s in STAGES}

# 退出码含义：跟 __main__.py 保持一致
EXIT_MEANING = {
    0: ("ok", "成功"),
    1: ("failed", "执行失败"),
    3: ("denied", "权限不足"),
    4: ("blocked", "复核闸门拦截"),
}


# ============================================================
# 任务管理
# ============================================================

class Job:
    def __init__(self, stage: str, argv: list[str]):
        self.id = uuid.uuid4().hex[:8]
        self.stage = stage
        self.argv = argv
        self.status = "running"
        self.exit_code: int | None = None
        self.started = time.time()
        self.ended: float | None = None
        self.lines: list[str] = []
        self.log_file: Path | None = None
        self._lock = threading.Lock()

    def emit(self, line: str) -> None:
        with self._lock:
            self.lines.append(line)
            if len(self.lines) > MAX_LINES:
                del self.lines[: len(self.lines) - MAX_LINES]
            if self.log_file:
                try:
                    with self.log_file.open("a", encoding="utf-8") as fh:
                        fh.write(line + "\n")
                except OSError:
                    pass

    def finish(self, code: int) -> None:
        self.exit_code = code
        self.ended = time.time()
        self.status = EXIT_MEANING.get(code, ("failed", "异常退出"))[0]

    @property
    def duration(self) -> float:
        return round((self.ended or time.time()) - self.started, 2)

    def snapshot(self, since: int = 0) -> dict:
        with self._lock:
            total = len(self.lines)
            chunk = self.lines[since:] if since < total else []
        return {
            "id": self.id,
            "stage": self.stage,
            "label": STAGE_BY_KEY.get(self.stage, {}).get("label", self.stage),
            "argv": self.argv,
            "status": self.status,
            "exit_code": self.exit_code,
            "status_text": EXIT_MEANING.get(self.exit_code or 0, ("", "运行中"))[1]
            if self.exit_code is not None else "运行中",
            "duration": self.duration,
            "total_lines": total,
            "lines": chunk,
            "next": total,
            "log_file": str(self.log_file) if self.log_file else None,
        }


class JobRegistry:
    """内存里的任务表 + 落盘日志。用 OrderedDict 做 LRU 淘汰。"""

    def __init__(self, cfg: Config):
        self.cfg = cfg
        self._jobs: OrderedDict[str, Job] = OrderedDict()
        self._lock = threading.Lock()
        self.log_dir = cfg.path("logs") / "ui"
        self.log_dir.mkdir(parents=True, exist_ok=True)

    def start(self, stage: str, argv: list[str]) -> Job:
        job = Job(stage, argv)
        job.log_file = self.log_dir / f"{datetime.now(TZ).strftime('%Y%m%d-%H%M%S')}-{job.id}-{stage}.log"
        job.emit(f"$ {' '.join(argv)}")
        job.emit(f"# 任务 {job.id} 于 {datetime.now(TZ).strftime('%H:%M:%S')} 启动")

        with self._lock:
            self._jobs[job.id] = job
            while len(self._jobs) > MAX_JOBS:
                self._jobs.popitem(last=False)

        threading.Thread(target=self._run, args=(job,), daemon=True).start()
        return job

    def _run(self, job: Job) -> None:
        env = dict(os.environ)
        env["PYTHONIOENCODING"] = "utf-8"
        env["PYTHONUTF8"] = "1"
        try:
            proc = subprocess.Popen(
                job.argv,
                cwd=str(self.cfg.root),
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
                env=env,
                bufsize=1,
            )
        except OSError as exc:
            job.emit(f"# 无法启动进程：{exc}")
            job.finish(1)
            return

        assert proc.stdout is not None
        for raw in proc.stdout:
            job.emit(raw.rstrip("\n"))
        code = proc.wait()
        job.finish(code)
        job.emit(f"# 任务结束，退出码 {code}"
                 f"（{EXIT_MEANING.get(code, ('', '未知'))[1]}），耗时 {job.duration}s")

    def get(self, job_id: str) -> Job | None:
        with self._lock:
            return self._jobs.get(job_id)

    def recent(self, limit: int = 12) -> list[dict]:
        with self._lock:
            items = list(self._jobs.values())[-limit:]
        return [{
            "id": j.id, "stage": j.stage,
            "label": STAGE_BY_KEY.get(j.stage, {}).get("label", j.stage),
            "status": j.status, "exit_code": j.exit_code,
            "duration": j.duration,
            "started_at": datetime.fromtimestamp(j.started, TZ).strftime("%H:%M:%S"),
        } for j in reversed(items)]

    def running(self) -> list[str]:
        with self._lock:
            return [j.id for j in self._jobs.values() if j.status == "running"]


# ============================================================
# 只读数据快照（供前端各面板使用）
# ============================================================

def _read_tables(cfg: Config) -> tuple[list[dict], str | None]:
    """读 DuckDB 的表清单。用只读连接，避免和正在跑的任务抢写锁。"""
    if not cfg.file("db").is_file():
        return [], "数据库文件还不存在，先跑一次 pipeline"
    try:
        with Warehouse(cfg, read_only=True) as wh:
            tables = []
            for name in wh.tables():
                try:
                    rows = wh.row_count(name)
                except Exception:                       # noqa: BLE001
                    rows = None
                prefix = ("原始层" if name.startswith("raw_") else
                          "清洗层" if name.startswith("stg_") else
                          "报表层" if name.startswith("mart_") else "其他")
                tables.append({"name": name, "rows": rows, "layer": prefix})
            return tables, None
    except Exception as exc:                            # noqa: BLE001
        return [], f"读取数据库失败（可能正有任务在写入）：{type(exc).__name__}: {exc}"


def build_snapshot(cfg: Config) -> dict:
    """前端顶部状态栏 + 阶段状态需要的全部信息。"""
    tables, db_error = _read_tables(cfg)
    by_name = {t["name"]: t for t in tables}

    biz_date = None
    if "stg_pms_revenue" in by_name:
        try:
            with Warehouse(cfg, read_only=True) as wh:
                biz_date = current_biz_date(wh)
        except Exception:                               # noqa: BLE001
            biz_date = None

    approval = load_approval(cfg, biz_date) if biz_date else None
    findings_summary = None
    if biz_date:
        vp = validation_path(cfg, biz_date)
        if vp.is_file():
            try:
                findings_summary = json.loads(vp.read_text(encoding="utf-8")).get("summary")
            except (OSError, json.JSONDecodeError):
                findings_summary = None

    marts = cfg.path("marts", make=False)
    deliverables = []
    for mart_key, mart in (cfg.rules.get("marts") or {}).items():
        for out in mart.get("outputs", []) or []:
            f = marts / out["file"]
            if f.is_file():
                deliverables.append({
                    "filename": out["file"],
                    "sheet": out.get("name", ""),
                    "title": mart.get("title", mart_key),
                    "cadence": mart.get("cadence", ""),
                    "bytes": f.stat().st_size,
                    "table": out.get("table", ""),
                })

    raw_dir = cfg.path("raw", make=False)
    raw_files = sum(1 for _ in raw_dir.rglob("*.csv")) if raw_dir.is_dir() else 0

    # 湖仓快照：data/lakehouse/**/*.parquet（load 阶段的产出）
    lake_dir = cfg.root / LAKE_DIR
    lakehouse_files = sum(1 for _ in lake_dir.rglob("*.parquet")) if lake_dir.is_dir() else 0

    # 交付批次：data/outbox/wecom_drive/<业务日期>/*（deliver 阶段的产出）
    # 目录名就是业务日期，按倒序排，最新的批次排最前。
    archive_dir = (cfg.root / (cfg.delivery.get("delivery", {}) or {}).get(
        "archive_dir", "data/outbox/wecom_drive")).resolve()
    outbox_runs = []
    if archive_dir.is_dir():
        for day in sorted((d for d in archive_dir.iterdir() if d.is_dir()),
                          key=lambda d: d.name, reverse=True):
            files = [f for f in day.rglob("*") if f.is_file()]
            outbox_runs.append({
                "date": day.name,
                "files": len(files),
                "bytes": sum(f.stat().st_size for f in files),
                "dir": str(day),
            })

    return {
        "root": str(cfg.root),
        "hotel": cfg.hotel,
        "project": cfg.settings.get("project", {}).get("name"),
        "biz_date": biz_date,
        "approval": (approval or {}).get("status"),
        "reviewer": (approval or {}).get("reviewer"),
        "approved_at": (approval or {}).get("approved_at"),
        "findings": findings_summary,
        "tables": tables,
        "db_error": db_error,
        "raw_files": raw_files,
        "lakehouse_files": lakehouse_files,
        "outbox_runs": outbox_runs,
        "deliverables": deliverables,
        "default_role": cfg.default_role,
        "roles": list((cfg.delivery.get("roles") or {}).keys()),
        "stages": STAGES,
        "running": [],
    }


def read_table(cfg: Config, name: str, limit: int = 200) -> dict:
    """预览一张表。表名只允许来自实际存在的表，避免拼 SQL 注入。"""
    tables, db_error = _read_tables(cfg)
    if db_error:
        return {"error": db_error}
    if name not in {t["name"] for t in tables}:
        return {"error": f"表 {name} 不存在"}
    try:
        with Warehouse(cfg, read_only=True) as wh:
            cols, rows = wh.query_with_cols(f'SELECT * FROM "{name}" LIMIT {int(limit)}')
            total = wh.row_count(name)
        return {"name": name, "columns": cols,
                "rows": [[("" if v is None else str(v)) for v in r] for r in rows],
                "total": total, "shown": len(rows)}
    except Exception as exc:                            # noqa: BLE001
        return {"error": f"{type(exc).__name__}: {exc}"}


def read_deliverable(cfg: Config, filename: str, limit: int = 500) -> dict:
    """读一份交付 CSV（带 BOM）。文件名必须在配置声明的产物里。"""
    allowed = set()
    for mart in (cfg.rules.get("marts") or {}).values():
        for out in mart.get("outputs", []) or []:
            allowed.add(out["file"])
    if filename not in allowed:
        return {"error": f"{filename} 不是已声明的交付产物"}
    path = cfg.path("marts", make=False) / filename
    if not path.is_file():
        return {"error": f"{filename} 还没生成，先跑 build"}
    import csv
    with path.open("r", encoding="utf-8-sig", newline="") as fh:
        reader = csv.reader(fh)
        try:
            cols = next(reader)
        except StopIteration:
            return {"error": "文件是空的"}
        rows = []
        for i, r in enumerate(reader):
            if i >= limit:
                break
            rows.append(r)
    return {"name": filename, "columns": cols, "rows": rows,
            "total": None, "shown": len(rows)}


def read_findings(cfg: Config, biz_date: str) -> dict:
    vp = validation_path(cfg, biz_date)
    if not vp.is_file():
        return {"error": f"还没有 {biz_date} 的校验结果，先跑 check"}
    try:
        return json.loads(vp.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        return {"error": f"{type(exc).__name__}: {exc}"}


def read_review_markdown(cfg: Config, biz_date: str) -> dict:
    rp = review_list_path(cfg, biz_date)
    if not rp.is_file():
        return {"error": f"还没有 {biz_date} 的待复核清单，先跑 check"}
    return {"biz_date": biz_date, "path": str(rp), "markdown": rp.read_text(encoding="utf-8")}


def read_audit(cfg: Config, limit: int = 120) -> dict:
    log_dir = cfg.path("logs", make=False)
    files = sorted(log_dir.glob("audit-*.jsonl"))
    if not files:
        return {"error": "还没有审计日志"}
    latest = files[-1]
    lines = latest.read_text(encoding="utf-8").strip().splitlines()
    records = []
    for line in lines[-limit:]:
        try:
            records.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    records.reverse()
    return {"file": latest.name, "total": len(lines), "records": records}


# ============================================================
# HTTP 服务
# ============================================================

class Handler(BaseHTTPRequestHandler):
    cfg: Config
    jobs: JobRegistry
    static_dir: Path
    server_version = "hotel-dw-console"

    # ---------- 基础工具 ----------

    def log_message(self, fmt, *args):                 # noqa: A003
        """默认日志会打到 stderr，太吵；只留错误。"""
        if str(args[0] if args else "").startswith(("4", "5")):
            sys.stderr.write("console: %s\n" % (fmt % args))

    def _send(self, code: int, body: bytes, ctype: str) -> None:
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _json(self, payload, code: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False, default=str).encode("utf-8")
        self._send(code, body, "application/json; charset=utf-8")

    def _error(self, code: int, message: str) -> None:
        self._json({"error": message}, code)

    def _body(self) -> dict:
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0:
            return {}
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return {}

    @staticmethod
    def _int(q: dict, key: str, default: int, lo: int = 0, hi: int = 200000) -> int:
        """查询串里的数字参数。脏输入不该把服务搞崩，一律退回默认值并夹到区间内。"""
        try:
            value = int(q.get(key) or default)
        except (TypeError, ValueError):
            value = default
        return max(lo, min(value, hi))

    # ---------- 路由 ----------

    def do_GET(self):                                   # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path
        q = {k: v[0] for k, v in parse_qs(parsed.query).items()}

        if path.startswith("/api/"):
            return self._api_get(path[5:], q)
        return self._static(path)

    def do_HEAD(self):                                  # noqa: N802
        return self.do_GET()

    def do_POST(self):                                  # noqa: N802
        parsed = urlparse(self.path)
        if not parsed.path.startswith("/api/"):
            return self._error(404, "not found")
        return self._api_post(parsed.path[5:], self._body())

    # ---------- 静态资源 ----------

    def _static(self, path: str) -> None:
        rel = "index.html" if path in ("/", "") else path.lstrip("/")
        target = (self.static_dir / rel).resolve()
        try:
            target.relative_to(self.static_dir.resolve())
        except ValueError:
            return self._error(403, "forbidden")
        if not target.is_file():
            return self._error(404, f"{rel} not found")
        ctype = {
            ".html": "text/html; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".js": "application/javascript; charset=utf-8",
            ".svg": "image/svg+xml",
            ".png": "image/png",
            ".ico": "image/x-icon",
        }.get(target.suffix, "application/octet-stream")
        self._send(200, target.read_bytes(), ctype)

    # ---------- GET API ----------

    def _api_get(self, route: str, q: dict) -> None:
        cfg, jobs = self.cfg, self.jobs

        if route == "snapshot":
            snap = build_snapshot(cfg)
            snap["running"] = jobs.running()
            snap["recent_jobs"] = jobs.recent()
            return self._json(snap)

        if route == "job":
            job = jobs.get(q.get("id", ""))
            if not job:
                return self._error(404, "任务不存在（可能已被淘汰，日志文件仍在 data/logs/ui/）")
            return self._json(job.snapshot(self._int(q, "since", 0)))

        if route == "jobs":
            return self._json({"jobs": jobs.recent(self._int(q, "limit", 12, 1, 60))})

        if route == "table":
            return self._json(read_table(cfg, q.get("name", ""),
                                         self._int(q, "limit", 200, 1, 5000)))

        if route == "graph":
            # 工位「走到哪一步」的口径必须跟左侧阶段卡片完全一致。那份推导只在
            # build_snapshot 里有一份，所以直接把快照交给 graph 去翻译，
            # 不在 graph 里再写第二套判断 —— 两处一旦打架，用户就再也不信这张图了。
            # 顺带还省掉一次「为了拿业务日期」的连库。
            snap = build_snapshot(cfg)
            biz = q.get("date") or snap.get("biz_date") or ""
            return self._json(build_graph(cfg, biz or None,
                                          snapshot=snap, stages=STAGES))

        if route == "deliverable":
            return self._json(read_deliverable(cfg, q.get("file", ""),
                                               self._int(q, "limit", 500, 1, 20000)))

        biz = q.get("date") or ""
        if route == "findings":
            return self._json(read_findings(cfg, biz) if biz else {"error": "缺少 date 参数"})

        if route == "review":
            return self._json(read_review_markdown(cfg, biz) if biz else {"error": "缺少 date 参数"})

        if route == "audit":
            return self._json(read_audit(cfg, self._int(q, "limit", 120, 1, 1000)))

        if route == "meta":
            cov = {}
            try:
                from ..rules import rule_coverage
                cov = rule_coverage(cfg)
            except Exception as exc:                    # noqa: BLE001
                cov = {"problems": [str(exc)]}
            return self._json({
                "rules": cfg.rules.get("validation") or [],
                "coverage": cov,
                "marts": {
                    k: {"title": v.get("title"), "cadence": v.get("cadence"),
                        "owner": v.get("owner"), "sheets": v.get("sheets"),
                        "outputs": v.get("outputs", [])}
                    for k, v in (cfg.rules.get("marts") or {}).items()
                },
                "sources": cfg.sources.get("sources") or [],
                "lakehouse": cfg.settings.get("lakehouse", {}),
                "run": cfg.settings.get("run", {}),
            })

        return self._error(404, f"未知接口 {route}")

    # ---------- POST API ----------

    def _api_post(self, route: str, body: dict) -> None:
        cfg, jobs = self.cfg, self.jobs

        if route == "run":
            stage = str(body.get("stage") or "")
            spec = STAGE_BY_KEY.get(stage)
            if not spec:
                return self._error(400, f"不允许执行 {stage}")

            role = str(body.get("role") or "").strip()
            argv = [sys.executable, str(cfg.root / "run.py")]
            if role:
                if role not in (cfg.delivery.get("roles") or {}):
                    return self._error(400, f"未知角色 {role}")
                argv += ["--role", role]
            argv.append(stage)
            # 同一时刻只允许一个任务：两个管道同时写同一个 DuckDB 文件必然出错，
            # 而且错起来是「偶尔表少一张」这种最难查的形态，不如直接拦住。
            running = jobs.running()
            if running:
                return self._error(409, f"已有任务在运行（{running[0]}），等它跑完再启动下一个")
            try:
                argv += self._build_args(spec, body.get("args") or {})
            except ValueError as exc:
                # 参数校验失败属于「调用方错误」，回 400 说清楚，不要掐断连接
                return self._error(400, str(exc))
            job = jobs.start(stage, argv)
            return self._json(job.snapshot())

        return self._error(404, f"未知接口 {route}")

    def _build_args(self, spec: dict, given: dict) -> list[str]:
        """把前端传来的参数按白名单拼成 argv。

        逐个 flag 校验：只认 STAGES 里声明过的参数名，
        值也按声明的类型清洗（int / date / bool / text），杜绝自由拼串。
        """
        argv: list[str] = []
        for opt in spec.get("options", []):
            flag = opt["flag"]
            if flag not in given:
                continue
            raw = given[flag]
            kind = opt["type"]

            if kind == "bool":
                if raw in (True, "true", "1", 1):
                    argv.append(flag)
                continue

            if raw is None or raw == "":
                continue

            if kind == "int":
                try:
                    value = int(raw)
                except (TypeError, ValueError):
                    raise ValueError(f"{flag} 需要整数") from None
                value = max(1, min(value, 3650))
                argv += [flag, str(value)]
            elif kind == "date":
                text = str(raw)
                try:
                    datetime.strptime(text, "%Y-%m-%d")
                except ValueError:
                    raise ValueError(f"{flag} 需要 YYYY-MM-DD 格式") from None
                argv += [flag, text]
            else:
                text = str(raw).replace("\n", " ").strip()[:80]
                if text:
                    argv += [flag, text]

        missing = [o["label"] for o in spec.get("options", [])
                   if o.get("required") and o["flag"] not in given]
        if missing:
            raise ValueError("缺少必填参数：" + "、".join(missing))
        return argv


def make_server(cfg: Config, host: str = "127.0.0.1", port: int = 8777,
                tries: int = 12) -> ThreadingHTTPServer:
    """建服务。端口被占就往后顺延，避免每次都手动改端口。"""
    static_dir = Path(__file__).resolve().parent / "static"
    Handler.cfg = cfg
    Handler.jobs = JobRegistry(cfg)
    Handler.static_dir = static_dir

    last_err: Exception | None = None
    for offset in range(tries):
        try:
            srv = ThreadingHTTPServer((host, port + offset), Handler)
            srv.daemon_threads = True
            if offset:
                print(f"  端口 {port} 被占用，改用 {port + offset}")
            return srv
        except OSError as exc:
            last_err = exc
            continue
    raise SystemExit(f"端口 {port}~{port + tries - 1} 都不可用：{last_err}")


def serve(cfg: Config, host: str = "127.0.0.1", port: int = 8777,
          open_browser: bool = True) -> None:
    srv = make_server(cfg, host, port)
    actual = srv.server_address[1]
    url = f"http://{host}:{actual}/"

    print("")
    print("=" * 64)
    print("  酒店经营数据自动化 · 可视化控制台")
    print("=" * 64)
    print(f"  项目根：{cfg.root}")
    print(f"  酒店：{cfg.hotel}")
    print(f"  地址：{url}")
    print(f"  日志：{cfg.path('logs') / 'ui'}")
    print("")
    print("  按 Ctrl+C 停止")
    print("=" * 64)

    if open_browser:
        import webbrowser
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()

    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\n  已停止。")
    finally:
        srv.server_close()
