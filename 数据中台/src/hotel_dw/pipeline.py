"""管道编排。

把各层串成一条可复跑、可审计的流程：

    extract  原始文件 → DuckDB 只读视图 raw_*
    transform raw_*   → 清洗表 stg_*（统一列名 + 类型纠正）
    load      stg_*   → Parquet 快照（湖仓层）
    build     stg_*   → 报表表 mart_*，导出 CSV + Parquet，记录产物指纹
    check     跑校验规则 → 落盘校验结果 + 待复核清单
    ────────── 以上可由脚本无人值守跑完 ──────────
    review    人工看清单
    approve   财务复核岗签字（凭证绑定产物指纹）
    deliver   归档到微盘目录 + 会话提醒

每个阶段在动工前都会调 auditor.check(命令名)，所以「权限按角色隔离」
不是写在文档里的承诺，而是每次执行都要过的闸门。
"""

from __future__ import annotations

from datetime import date, datetime

from .audit import Auditor
from .config import Config, get_config
from .db import Warehouse
from .deliver import deliver as deliver_stage
from .extract import generate_mock, load_raw_views
from .load import manifest_path, persist_staging, snapshot_table, write_manifest
from .report import (
    build_marts,
    current_biz_date,
    export_marts,
    load_artifacts,
    mart_defs,
    save_artifacts,
)
from .review import (
    approve as approve_stage,
    load_approval,
    review_list_path,
    write_review_package,
)
from .rules import rule_coverage, run_validation, summarize
from .transform import run_clean


# ============================ 各阶段 ============================

def stage_init(cfg: Config, auditor: Auditor) -> dict:
    """建好所有目录。"""
    auditor.check("init")
    made = []
    for key in (cfg.settings.get("paths") or {}):
        p = cfg.path(key) if not key == "db" else cfg.file(key)
        made.append({"key": key, "path": str(p)})
    return {"dirs": made}


def stage_mock(cfg: Config, auditor: Auditor, *, as_of=None, days=None,
               anomalies=False) -> dict:
    """生成模拟上游数据（演示 / 离线开发用）。"""
    auditor.check("mock")
    info = generate_mock(cfg, as_of=as_of, days=days, anomalies=anomalies)
    auditor.write("mock", "data/raw", detail=f"{info['files']} 个文件 / {info['days']} 天"
                  + ("（含故意种入的异常）" if anomalies else ""),
                  extra={"rows": info["rows"], "as_of": info["as_of"]})
    return info


def stage_extract(cfg: Config, auditor: Auditor, wh: Warehouse) -> dict:
    auditor.check("extract")
    return load_raw_views(wh, cfg, auditor)


def stage_transform(cfg: Config, auditor: Auditor, wh: Warehouse) -> list[dict]:
    auditor.check("transform")
    return run_clean(cfg, wh, auditor)


def stage_load(cfg: Config, auditor: Auditor, wh: Warehouse) -> list[dict]:
    auditor.check("load")
    return persist_staging(cfg, wh, auditor)


def stage_build(cfg: Config, auditor: Auditor, wh: Warehouse) -> dict:
    auditor.check("build")
    built = build_marts(cfg, wh, auditor)
    artifacts = export_marts(cfg, wh, auditor)

    # 报表也进湖仓（marts 层快照）
    snapshots = []
    for key, mart in mart_defs(cfg).items():
        for out in mart.get("outputs", []) or []:
            info = snapshot_table(wh, cfg, out["table"], layer="marts")
            if info:
                snapshots.append(info)

    biz_date = current_biz_date(wh)
    path = save_artifacts(cfg, biz_date, artifacts)
    auditor.write("build", path.name,
                  detail=f"产物清单：{len(artifacts)} 个文件，已落盘待复核",
                  extra={"biz_date": biz_date})
    return {"biz_date": biz_date, "built": built, "artifacts": artifacts,
            "snapshots": snapshots, "artifacts_file": str(path)}


def stage_check(cfg: Config, auditor: Auditor, wh: Warehouse,
                biz_date: str | None = None) -> dict:
    auditor.check("check")
    findings = run_validation(wh, cfg, auditor)
    summary = summarize(findings)
    biz_date = biz_date or current_biz_date(wh)
    artifacts = load_artifacts(cfg, biz_date)
    paths = write_review_package(cfg, biz_date, findings, summary, artifacts,
                                 run_id=auditor.run_id, actor=auditor.actor)
    auditor.write("check", f"validation_{biz_date}.json",
                  status="ok" if summary["block"] == 0 else "block",
                  detail=f"通过 {summary['passed']} / 阻断 {summary['block']} / 提示 {summary['warn']}",
                  extra=paths)
    return {"biz_date": biz_date, "findings": findings, "summary": summary,
            "paths": paths, "artifacts": artifacts}


def stage_approve(cfg: Config, auditor: Auditor, biz_date: str, reviewer: str,
                  note: str = "") -> dict:
    auditor.check("approve")
    artifacts = load_artifacts(cfg, biz_date)
    p = approve_stage(cfg, biz_date, artifacts, reviewer=reviewer,
                      actor=auditor.actor, role=auditor.role,
                      run_id=auditor.run_id, note=note)
    auditor.write("approve", p.name, detail=f"复核人 {reviewer} 批准 {len(artifacts)} 个报表",
                  extra={"note": note})
    return {"path": str(p), "reviewer": reviewer, "artifacts": len(artifacts)}


def stage_deliver(cfg: Config, auditor: Auditor, biz_date: str,
                  findings: list | None = None, dry_run: bool | None = None) -> dict:
    auditor.check("deliver")
    if findings is None:
        import json
        from .review import validation_path
        vp = validation_path(cfg, biz_date)
        findings = []
        if vp.is_file():
            data = json.loads(vp.read_text(encoding="utf-8"))
            findings = [_FindingProxy(f) for f in data.get("findings", [])]

    artifacts = load_artifacts(cfg, biz_date)
    result = deliver_stage(cfg, biz_date, findings, artifacts, auditor, dry_run=dry_run)
    return result


class _FindingProxy:
    """从 JSON 还原出交付层需要的两个属性（is_warning / is_blocker / message）。"""

    def __init__(self, d: dict):
        self.__dict__.update(d)

    @property
    def is_blocker(self) -> bool:
        return bool(self.__dict__.get("is_blocker"))

    @property
    def is_warning(self) -> bool:
        return bool(self.__dict__.get("is_warning"))


# ============================ 全流程 ============================

def run_all(
    cfg: Config | None = None,
    *,
    actor: str | None = None,
    role: str | None = None,
    regenerate: bool = False,
    anomalies: bool = False,
    days: int | None = None,
    as_of: date | None = None,
    approve: bool = False,
    reviewer: str = "",
    deliver_report: bool = False,
    push: bool | None = None,
    console=print,
) -> dict:
    """从上游数据一路跑到交付（审批前停住，除非显式要求继续）。"""
    cfg = cfg or get_config()
    auditor = Auditor(cfg, actor=actor, role=role)
    summary: dict = {"run_id": auditor.run_id, "actor": auditor.actor, "role": auditor.role}

    if regenerate:
        console("① 生成模拟上游数据 ...")
        summary["mock"] = stage_mock(cfg, auditor, as_of=as_of, days=days, anomalies=anomalies)
        console(f"   写入 {summary['mock']['files']} 个文件，覆盖 {summary['mock']['from']} ~ "
                f"{summary['mock']['as_of']}")

    with Warehouse(cfg) as wh:
        console("② 抽取：登记原始视图 ...")
        raw = stage_extract(cfg, auditor, wh)
        ok = sum(1 for v in raw.values() if v["registered"])
        console(f"   {ok}/{len(raw)} 个数据源就绪，"
                f"共 {sum(v['rows'] for v in raw.values()):,} 行原始数据")
        summary["extract"] = raw

        console("③ 清洗：统一列名与类型 ...")
        stg = stage_transform(cfg, auditor, wh)
        for s in stg:
            console(f"   {s['table']:<20} {s['rows']:>7,} 行")
        summary["transform"] = stg

        console("④ 落地：湖仓 Parquet 快照 ...")
        snaps = stage_load(cfg, auditor, wh)
        console(f"   {len(snaps)} 张表已固化，共 {sum(s['bytes'] for s in snaps):,} 字节")
        summary["load"] = snaps

        console("⑤ 成表：按口径生成报表 ...")
        built = stage_build(cfg, auditor, wh)
        console(f"   业务日期 {built['biz_date']}，产出 {len(built['artifacts'])} 个交付文件")
        summary["build"] = built

        console("⑥ 校验：跑全部规则 ...")
        checked = stage_check(cfg, auditor, wh, built["biz_date"])
        s = checked["summary"]
        console(f"   规则 {s['total']} 条：通过 {s['passed']} / 阻断 {s['block']} / 提示 {s['warn']}")
        for f in checked["findings"]:
            if not f.passed:
                flag = "⛔" if f.is_blocker else "⚠️ "
                console(f"   {flag} {f.rule_id} {f.message}")
        summary["check"] = {"biz_date": checked["biz_date"], "summary": s,
                            "paths": checked["paths"]}

        # 运行清单
        mpath = write_manifest(cfg, built["biz_date"], {
            "run_id": auditor.run_id, "actor": auditor.actor, "role": auditor.role,
            "validation": s,
            "artifacts": [{"filename": a["filename"], "rows": a["rows"],
                           "sha256": a["sha256"]} for a in built["artifacts"]],
        })
        console(f"   运行清单：{mpath}")

        if s["block"] > 0 and (approve or deliver_report):
            console("")
            console("⛔ 存在阻断项，流程停在复核闸门前。请先处理阻断项再继续。")
            summary["stopped"] = "blocked"
            return summary

        if approve:
            console("⑦ 复核签字 ...")
            if not reviewer:
                raise ValueError("approve=True 必须提供 reviewer（复核人姓名）")
            ap = stage_approve(cfg, auditor, built["biz_date"], reviewer)
            console(f"   已批准：{ap['path']}")
            summary["approve"] = ap

            if deliver_report:
                console("⑧ 交付：归档 + 企微通知 ...")
                res = stage_deliver(cfg, auditor, built["biz_date"],
                                    checked["findings"], dry_run=not push)
                console(f"   归档目录 {res['archive_dir']}")
                for m in res["messages"]:
                    mode = "dry-run 落盘" if m["push"].get("dry_run") else "已推送"
                    console(f"   [{mode}] {m['kind']} → {', '.join(m['recipients']) or '（未配置接收人）'}")
                summary["deliver"] = {k: v for k, v in res.items() if k != "messages"}
        else:
            console("")
            console(f"⏸  流程已停在复核闸门（这是设计如此：不替财务拍板）。")
            console(f"   待复核清单：{checked['paths']['review_list']}")
            console(f"   下一步：python run.py approve --reviewer <你的名字>"
                    + (f" --date {built['biz_date']}" if built["biz_date"] else ""))

    return summary


# ============================ 状态与自检 ============================

def status(cfg: Config) -> dict:
    """看当前项目状态：数据到哪一步、有没有待审批。"""
    info: dict = {"root": str(cfg.root), "hotel": cfg.hotel}
    with Warehouse(cfg, read_only=False) as wh:
        info["tables"] = {t: wh.row_count(t) for t in wh.tables()}
        try:
            biz = current_biz_date(wh)
        except Exception:                                  # noqa: BLE001
            biz = None
    info["biz_date"] = biz

    if biz:
        ap = load_approval(cfg, biz)
        info["approval"] = ap.get("status") if ap else None
        info["reviewer"] = ap.get("reviewer") if ap else None
        rl = review_list_path(cfg, biz)
        info["review_list"] = str(rl) if rl.is_file() else None
        mp = manifest_path(cfg, biz)
        info["manifest"] = str(mp) if mp.is_file() else None
    info["coverage"] = rule_coverage(cfg)
    return info


def selftest(cfg: Config) -> dict:
    """开工前的体检：配置读得对不对、规则有没有漏实现、目录全不全。"""
    checks: list[dict] = []

    def add(name, ok, detail=""):
        checks.append({"name": name, "ok": bool(ok), "detail": detail})

    add("配置文件 4 份齐全", all([
        (cfg.config_dir / f).is_file()
        for f in ("settings.yaml", "data_sources.yaml", "report_rules.yaml", "delivery.yaml")
    ]))

    cov = rule_coverage(cfg)
    add("校验规则类型全部有实现", not cov["problems"],
        f"{cov['rules']} 条规则 / 类型 {cov['by_type']}" + (
            "；问题：" + "；".join(cov["problems"]) if cov["problems"] else ""))

    try:
        tol = cfg.tolerance
        dev = cfg.deviation_pct
        add("跨文件引用解析正常", True, f"amount_tolerance={tol} deviation_pct={dev}")
    except Exception as exc:                               # noqa: BLE001
        add("跨文件引用解析正常", False, f"{type(exc).__name__}: {exc}")

    try:
        exp = cfg.ref("config/data_sources.yaml#sources[ota].expected_accounts")
        add("sources[ota] 按键引用正常", True, f"expected_accounts={exp}")
    except Exception as exc:                               # noqa: BLE001
        add("sources[ota] 按键引用正常", False, f"{type(exc).__name__}: {exc}")

    sqls = sorted((cfg.root / "sql").rglob("*.sql"))
    add("SQL 文件存在", len(sqls) >= 2, "、".join(p.name for p in sqls))

    for key in ("raw", "staging", "marts", "review", "outbox", "logs"):
        try:
            cfg.path(key)
            add(f"目录 paths.{key}", True)
        except Exception as exc:                           # noqa: BLE001
            add(f"目录 paths.{key}", False, str(exc))

    msgs = cfg.delivery.get("message_templates", {}) or {}
    add("企微消息模板齐备", all(k in msgs for k in ("report_ready", "review_needed", "delivered")),
        "、".join(msgs.keys()))

    return {"checks": checks, "ok": all(c["ok"] for c in checks),
            "failed": [c for c in checks if not c["ok"]]}
