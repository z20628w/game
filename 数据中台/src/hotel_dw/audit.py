"""审计留痕。

对应简报 P4 落地原则里的两条硬约束：
  * 凭证与日志留痕  —— 每次动作都写一行 JSONL，谁在什么时候干了什么
  * 权限按角色隔离  —— 执行前先检查角色有没有这个命令的权限

日志是 append-only 的 JSONL（一行一条），方便直接用 DuckDB / pandas 读出来做追溯。
"""

from __future__ import annotations

import getpass
import hashlib
import json
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any

from .config import Config

TZ = timezone(timedelta(hours=8))  # 业务在 Asia/Shanghai


class PermissionDenied(Exception):
    """角色权限不足。"""


class Auditor:
    """一次运行对应一个 run_id，所有动作共用它，便于事后串联。"""

    def __init__(self, cfg: Config, actor: str | None = None, role: str | None = None):
        self.cfg = cfg
        self.actor = actor or getpass.getuser()
        self.role = role or cfg.default_role
        self.run_id = uuid.uuid4().hex[:12]
        self._log_path = self._resolve_log_path()

    def _resolve_log_path(self) -> Path:
        d = self.cfg.path("logs")
        return d / f"audit-{datetime.now(TZ).strftime('%Y-%m-%d')}.jsonl"

    # ---------- 权限 ----------
    def check(self, command: str) -> None:
        allowed = self.cfg.role_commands(self.role)
        if "*" in allowed or command in allowed:
            return
        self.write("command", command, status="denied",
                   detail=f"角色 {self.role} 无权执行 {command}")
        raise PermissionDenied(
            f"角色「{self.role}」没有执行「{command}」的权限。"
            f"允许的命令：{', '.join(allowed)}（见 config/delivery.yaml → roles）"
        )

    # ---------- 写日志 ----------
    def write(self, action: str, target: str, status: str = "ok",
              detail: Any = "", extra: dict | None = None) -> dict:
        record = {
            "ts": datetime.now(TZ).isoformat(timespec="seconds"),
            "run_id": self.run_id,
            "actor": self.actor,
            "role": self.role,
            "action": action,
            "target": target,
            "status": status,
            "detail": detail,
        }
        if extra:
            record["extra"] = extra
        with self._log_path.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(record, ensure_ascii=False) + "\n")
        return record

    @staticmethod
    def fingerprint(path: Path) -> str:
        """文件指纹，用于审批凭证绑定制品内容（防止审批后报表被偷换）。"""
        h = hashlib.sha256()
        with path.open("rb") as fh:
            for chunk in iter(lambda: fh.read(65536), b""):
                h.update(chunk)
        return h.hexdigest()[:16]

    def recent(self, limit: int = 20) -> list[dict]:
        if not self._log_path.is_file():
            return []
        lines = self._log_path.read_text(encoding="utf-8").strip().splitlines()
        return [json.loads(x) for x in lines[-limit:]]
