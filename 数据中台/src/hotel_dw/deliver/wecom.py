"""交付层实现：归档 + 通知。

默认 dry-run（webhook 留空）：只把要发的内容落盘成 JSON，不真发。
这样整个交付流程可回放、可排查，也不会在测试时误发消息给财务。
填上 config/delivery.local.yaml 里的 webhook_url（或设环境变量 WECOM_WEBHOOK）
就会真的推送到企业微信群机器人。
"""

from __future__ import annotations

import json
import shutil
from datetime import datetime
from pathlib import Path

from ..audit import TZ, Auditor
from ..config import Config
from ..review.gate import require_approval

# ---------------- 文案 ----------------

def _templates(cfg: Config) -> dict:
    return (cfg.delivery.get("message_templates") or {})


def _render(cfg: Config, key: str, **kw) -> str:
    tpl = _templates(cfg).get(key, "")
    try:
        return tpl.format(**kw).strip()
    except KeyError:
        return tpl.strip()


def _recipients(cfg: Config, cadence: str) -> list[str]:
    got: list[str] = []
    for item in (cfg.sources.get("cadence", {}) or {}).get(cadence, []) or []:
        got.extend(item.get("recipients", []) or [])
    return got


def build_messages(cfg: Config, biz_date: str, artifacts: list[dict],
                   findings: list, reviewer: str = "") -> list[dict]:
    """按「只推例外 + 附原因」的原则组装消息载荷。"""
    msgs: list[dict] = []
    by_cadence: dict[str, list[dict]] = {}
    for a in artifacts:
        by_cadence.setdefault(a.get("cadence", "daily"), []).append(a)

    for cadence, items in by_cadence.items():
        title = items[0]["title"] if len(items) == 1 else f"{items[0]['title']}等 {len(items)} 张报表"
        content = _render(
            cfg, "report_ready", title=title, biz_date=biz_date, reviewer=reviewer or "（未记录）",
            files="、".join(i["filename"] for i in items), )
        msgs.append({
            "kind": "report_ready", "cadence": cadence,
            "recipients": _recipients(cfg, cadence),
            "content": content, "files": [i["filename"] for i in items],
        })

    warns = [f for f in findings if f.is_warning]
    blocks = [f for f in findings if f.is_blocker]
    if warns or blocks:
        top = (blocks + warns)[:5]
        content = _render(
            cfg, "review_needed",
            title="数据异常", biz_date=biz_date,
            block_count=len(blocks), warn_count=len(warns),
            top_issues="\n".join(f"{i}. {f.rule_id} {f.message}" for i, f in enumerate(top, 1)),
        )
        msgs.append({
            "kind": "review_needed", "cadence": "all",
            "recipients": _recipients(cfg, "daily") + _recipients(cfg, "weekly"),
            "content": content, "files": [],
        })
    return msgs


# ---------------- 发送 ----------------

def _chunks(text: str, limit: int) -> list[str]:
    if len(text.encode("utf-8")) <= limit:
        return [text]
    out, buf = [], ""
    for line in text.splitlines(keepends=True):
        if len((buf + line).encode("utf-8")) > limit:
            if buf:
                out.append(buf)
            buf = line
        else:
            buf += line
    if buf:
        out.append(buf)
    return out


def push_wecom(cfg: Config, content: str, *, dry_run: bool | None = None) -> dict:
    """推送到企业微信群机器人。未配置 webhook 或 dry_run 时只落盘。"""
    wecom = cfg.delivery.get("wecom", {}) or {}
    url = (wecom.get("webhook_url") or "").strip()
    limit = int(wecom.get("max_message_bytes", 4000))
    parts = _chunks(content, limit)

    if dry_run is None:
        dry_run = not url

    if dry_run:
        return {"dry_run": True, "parts": len(parts), "reason": "未配置 webhook_url，仅落盘"}

    import requests  # 延迟导入：dry-run 场景不需要这个依赖

    results = []
    for part in parts:
        try:
            resp = requests.post(url, json={"msgtype": "text", "text": {"content": part}}, timeout=15)
            results.append({"status": resp.status_code, "ok": resp.ok})
        except Exception as exc:                       # noqa: BLE001
            results.append({"status": "error", "ok": False, "error": f"{type(exc).__name__}: {exc}"})
    return {"dry_run": False, "parts": len(parts), "results": results}


# ---------------- 主流程 ----------------

def deliver(
    cfg: Config,
    biz_date: str,
    findings: list,
    artifacts: list[dict],
    auditor: Auditor | None = None,
    *,
    dry_run: bool | None = None,
) -> dict:
    """归档 + 通知。会先校验人工复核凭证和产物指纹。"""
    approval = require_approval(cfg, biz_date)

    # ① 指纹核对：批准的报表和现在要发的，必须是同一份
    #
    # 关键：这里的哈希必须「现场重算磁盘上的文件」，不能拿 artifacts 清单里记录的旧哈希。
    # 清单是 build 那一刻的快照；如果审批之后有人改了 CSV（手工订正、脚本回写、
    # 甚至只是 Excel 打开另存），拿旧哈希比对等于自己和自己对答案，永远发现不了。
    # 审批凭证绑定制品的意义就在这里。
    approved = {a["filename"]: a["sha256"] for a in approval.get("artifacts", [])}
    mismatched: list[str] = []
    missing: list[str] = []
    for a in artifacts:
        fn = a["filename"]
        want = approved.get(fn)
        if want is None:
            missing.append(fn)
            continue
        path = Path(a["file"])
        if not path.is_file():
            mismatched.append(f"{fn}（文件已不存在）")
            continue
        actual = Auditor.fingerprint(path)
        if actual != want:
            mismatched.append(f"{fn}（审批时 {want}，现在 {actual}）")

    if mismatched:
        raise RuntimeError(
            "报表内容在审批之后发生了变化，交付已中止（审批凭证失效）：\n  "
            + "\n  ".join(mismatched)
            + "\n请重新执行 check → review → approve 后再交付。"
        )

    # ② 归档到微盘同步目录
    archive = (cfg.root / (cfg.delivery.get("delivery", {}) or {}).get(
        "archive_dir", "data/outbox/wecom_drive")).resolve()
    target = archive / biz_date
    target.mkdir(parents=True, exist_ok=True)
    archived: list[str] = []
    for a in artifacts:
        src = Path(a["file"])
        if src.is_file():
            dst = target / a["filename"]
            shutil.copy2(src, dst)
            archived.append(str(dst))

    # ③ 组装并推送消息
    messages = build_messages(cfg, biz_date, artifacts, findings,
                              reviewer=approval.get("reviewer", ""))
    notify_dir = (cfg.root / (cfg.delivery.get("delivery", {}) or {}).get(
        "notify_dir", "data/outbox/notifications")).resolve()
    notify_dir.mkdir(parents=True, exist_ok=True)

    pushed: list[dict] = []
    for m in messages:
        result = push_wecom(cfg, m["content"], dry_run=dry_run)
        payload = {**m, "sent_at": datetime.now(TZ).isoformat(timespec="seconds"),
                   "push": result, "archived": archived}
        # 文件名带上 cadence：日报和周报是两条独立的 report_ready，
        # 只用 <日期>_<kind> 会互相覆盖，事后回放时就只剩最后一条了。
        out = notify_dir / f"{biz_date}_{m['cadence']}_{m['kind']}.json"
        out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        pushed.append({"kind": m["kind"], "recipients": m["recipients"],
                       "payload": str(out), "push": result})
        if auditor:
            auditor.write("deliver", out.name,
                          status="ok" if result.get("dry_run") or all(
                              r.get("ok") for r in result.get("results", [])) else "failed",
                          detail=(f"{m['kind']} → {', '.join(m['recipients']) or '（未配置接收人）'}"
                                  + ("（dry-run 落盘）" if result.get("dry_run") else "（已推送）")),
                          extra={"files": m["files"], "push": result})

    return {
        "biz_date": biz_date,
        "reviewer": approval.get("reviewer"),
        "archived": archived,
        "archive_dir": str(target),
        "messages": pushed,
        "unapproved_files": missing,
        "dry_run": bool(pushed[0]["push"].get("dry_run")) if pushed else None,
    }
