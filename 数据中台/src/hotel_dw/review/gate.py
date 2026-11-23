"""复核层实现：校验结果落盘、待复核清单、审批凭证。"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

from ..audit import TZ, Auditor
from ..config import Config


class NotApproved(Exception):
    """尚未通过人工复核。"""


# ---------------- 路径 ----------------

def validation_path(cfg: Config, biz_date: str) -> Path:
    return cfg.path("review") / f"validation_{biz_date}.json"


def review_list_path(cfg: Config, biz_date: str) -> Path:
    return cfg.path("review") / f"待复核清单_{biz_date}.md"


def approval_path(cfg: Config, biz_date: str) -> Path:
    return cfg.path("review") / f"approval_{biz_date}.json"


# ---------------- 生成复核包 ----------------

def write_review_package(
    cfg: Config,
    biz_date: str,
    findings: list,
    summary: dict,
    artifacts: list[dict],
    run_id: str = "",
    actor: str = "",
) -> dict:
    """落盘 JSON（给机器）+ Markdown（给人），返回两个路径。"""
    payload = {
        "biz_date": biz_date,
        "run_id": run_id,
        "actor": actor,
        "generated_at": datetime.now(TZ).isoformat(timespec="seconds"),
        "summary": summary,
        "artifacts": artifacts,
        "findings": [f.to_dict() for f in findings],
    }
    vp = validation_path(cfg, biz_date)
    vp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    rp = review_list_path(cfg, biz_date)
    rp.write_text(_render_markdown(biz_date, findings, summary, artifacts), encoding="utf-8")

    return {"validation": str(vp), "review_list": str(rp)}


def _render_markdown(biz_date, findings, summary, artifacts) -> str:
    blocks = [f for f in findings if f.is_blocker]
    warns = [f for f in findings if f.is_warning]
    passed = [f for f in findings if f.passed]

    L: list[str] = []
    L.append(f"# 待复核清单 · {biz_date}")
    L.append("")
    L.append(f"- 校验规则：{summary['total']} 条（通过 {summary['passed']} / "
             f"阻断 {summary['block']} / 提示 {summary['warn']}）")
    L.append(f"- 待交付报表：{len(artifacts)} 个")
    L.append("")

    if blocks:
        L.append("## ⛔ 阻断项（必须处理完才能交付）")
        L.append("")
        L.append("| 规则 | 名称 | 位置 | 说明 |")
        L.append("| --- | --- | --- | --- |")
        for f in blocks:
            L.append(f"| {f.rule_id} | {f.name} | `{f.table}` | {f.message} |")
        L.append("")
        L.append("> 阻断项未清零时，`approve` 会被拒绝。请先修正数据或口径，重跑管道。")
        L.append("")
    else:
        L.append("## ✅ 无阻断项")
        L.append("")

    if warns:
        L.append("## ⚠️ 提示项（可带例外放行，但需逐条确认）")
        L.append("")
        L.append("| 规则 | 名称 | 位置 | 说明 |")
        L.append("| --- | --- | --- | --- |")
        for f in warns:
            L.append(f"| {f.rule_id} | {f.name} | `{f.table}` | {f.message} |")
        L.append("")

    if artifacts:
        L.append("## 📦 待交付报表（指纹用于绑定审批）")
        L.append("")
        L.append("| 报表 | 工作表 | 行数 | 大小 | sha256 |")
        L.append("| --- | --- | --- | --- | --- |")
        for a in artifacts:
            L.append(f"| {a['title']} | {a['sheet']} | {a['rows']} | {a['bytes']} B | `{a['sha256']}` |")
        L.append("")

    if passed:
        L.append("<details><summary>✅ 已通过规则（{} 条）</summary>".format(len(passed)))
        L.append("")
        for f in passed:
            L.append(f"- {f.rule_id} {f.name}")
        L.append("")
        L.append("</details>")
        L.append("")

    L.append("---")
    L.append("")
    L.append("复核通过后执行：`python -m hotel_dw approve --date " + biz_date +
             " --reviewer <你的名字>`")
    L.append("")
    return "\n".join(L)


# ---------------- 审批 ----------------

def approve(
    cfg: Config,
    biz_date: str,
    artifacts: list[dict],
    reviewer: str,
    actor: str = "",
    role: str = "",
    run_id: str = "",
    note: str = "",
    require_clean: bool = True,
) -> Path:
    """记录审批凭证。

    require_clean=True 时，只要有未处理的阻断项就拒绝签字
    —— 对应落地原则「异常必须复核」，不让复核变成走过场。
    """
    if require_clean:
        vp = validation_path(cfg, biz_date)
        if not vp.is_file():
            raise NotApproved(f"找不到 {vp.name}，请先跑 check。")
        data = json.loads(vp.read_text(encoding="utf-8"))
        if data.get("summary", {}).get("block", 0) > 0:
            blockers = [f for f in data.get("findings", [])
                        if f.get("is_blocker")]
            lines = "\n".join(f"  - {f['rule_id']} {f['name']}：{f['message']}" for f in blockers)
            raise NotApproved(
                f"仍有 {len(blockers)} 条阻断项未处理，不能批准交付：\n{lines}\n"
                "处理办法：修正数据或调整口径后重跑管道；"
                "确属规则本身需要调整的，请改 config/report_rules.yaml 并留下变更记录。"
            )

    payload = {
        "biz_date": biz_date,
        "status": "approved",
        "reviewer": reviewer,
        "actor": actor,
        "role": role,
        "run_id": run_id,
        "approved_at": datetime.now(TZ).isoformat(timespec="seconds"),
        "note": note,
        "artifacts": [{"filename": a["filename"], "sha256": a["sha256"],
                       "bytes": a["bytes"], "rows": a["rows"]} for a in artifacts],
    }
    p = approval_path(cfg, biz_date)
    p.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return p


def load_approval(cfg: Config, biz_date: str) -> dict | None:
    p = approval_path(cfg, biz_date)
    if not p.is_file():
        return None
    return json.loads(p.read_text(encoding="utf-8"))


def require_approval(cfg: Config, biz_date: str) -> dict:
    """交付前的守门员：没批准就不许发。"""
    a = load_approval(cfg, biz_date)
    if not a or a.get("status") != "approved":
        raise NotApproved(
            f"{biz_date} 还没有通过人工复核，拒绝交付。\n"
            f"请先执行：python -m hotel_dw review --date {biz_date}\n"
            f"            python -m hotel_dw approve --date {biz_date} --reviewer <名字>"
        )
    return a
