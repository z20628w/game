"""命令行入口：python -m hotel_dw <命令>（或项目根目录的 python run.py <命令>）。

命令与 delivery.yaml 里的角色权限一一对应：
    init / mock / extract / transform / load / build / check / review / approve / deliver
    pipeline  串起来跑（每步仍按角色校验权限）
    status    看当前进展
    selftest  开工前体检
    roles     打印权限矩阵
    ui        起本地可视化控制台（标准库 HTTP + 原生 JS，零新依赖）
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import date, datetime

from . import pipeline as P
from .audit import Auditor, PermissionDenied
from .config import Config, find_project_root
from .db import Warehouse
from .report import load_artifacts, current_biz_date
from .review import (
    NotApproved,
    approval_path,
    load_approval,
    review_list_path,
    validation_path,
)


def _fix_console() -> None:
    """Windows 控制台默认可能是 GBK，中文与符号会炸。强制 UTF-8 输出。"""
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except Exception:                                   # noqa: BLE001
            pass


def _parse_date(s: str | None) -> date | None:
    if not s:
        return None
    return datetime.strptime(s, "%Y-%m-%d").date()


def _banner(title: str) -> None:
    print("")
    print("=" * 64)
    print(f"  {title}")
    print("=" * 64)


# ============================ 各命令 ============================

def cmd_init(cfg: Config, auditor: Auditor, args) -> dict:
    res = P.stage_init(cfg, auditor)
    for d in res["dirs"]:
        print(f"  ✓ {d['key']:<10} {d['path']}")
    return {"dirs": res["dirs"]}


def cmd_mock(cfg: Config, auditor: Auditor, args) -> dict:
    res = P.stage_mock(cfg, auditor, as_of=_parse_date(args.as_of),
                       days=args.days, anomalies=args.anomalies)
    print(f"  模拟上游：{res['files']} 个文件，{res['from']} ~ {res['as_of']}（{res['days']} 天）")
    print(f"  清理旧文件 {res['cleared']} 个" + ("；已故意种入异常" if res["anomalies"] else ""))
    for t, n in res["rows"].items():
        print(f"    {t:<16} {n:>6,} 行")
    print(f"  输出目录：{res['raw_dir']}")
    return res


def cmd_extract(cfg: Config, auditor: Auditor, args) -> dict:
    with Warehouse(cfg) as wh:
        res = P.stage_extract(cfg, auditor, wh)
    for t, v in res.items():
        flag = "✓" if v["registered"] else "×"
        print(f"  {flag} raw_{t:<16} {v['rows']:>7,} 行   {v['mode']:<6} {v['glob']}")
    return {t: {k: v[k] for k in ("source", "mode", "glob", "rows", "registered")}
            for t, v in res.items()}


def cmd_transform(cfg: Config, auditor: Auditor, args) -> dict:
    with Warehouse(cfg) as wh:
        res = P.stage_transform(cfg, auditor, wh)
    for s in res:
        print(f"  ✓ {s['table']:<22} {s['rows']:>7,} 行   ← {s['file']}")
    return {"tables": res}


def cmd_load(cfg: Config, auditor: Auditor, args) -> dict:
    with Warehouse(cfg) as wh:
        res = P.stage_load(cfg, auditor, wh)
    for s in res:
        print(f"  ✓ {s['table']:<22} {s['rows']:>7,} 行  {s['bytes']:>9,} B  {s['sha256']}")
    return {"snapshots": res}


def cmd_build(cfg: Config, auditor: Auditor, args) -> dict:
    with Warehouse(cfg) as wh:
        res = P.stage_build(cfg, auditor, wh)
    print(f"  业务日期：{res['biz_date']}")
    for b in res["built"]:
        print(f"  ✓ {b['mart']:<20} {b['sql']}（{b['statements']} 条语句）")
    print("")
    for a in res["artifacts"]:
        print(f"  📄 {a['title']:<12} {a['sheet']:<10} {a['rows']:>5,} 行  {a['filename']}")
    return res


def cmd_check(cfg: Config, auditor: Auditor, args) -> dict:
    with Warehouse(cfg) as wh:
        res = P.stage_check(cfg, auditor, wh, _parse_date(args.date).isoformat()
                            if args.date else None)
    s = res["summary"]
    print(f"  业务日期：{res['biz_date']}")
    print(f"  规则 {s['total']} 条：通过 {s['passed']} / 阻断 {s['block']} / 提示 {s['warn']}")
    print("")
    for f in res["findings"]:
        if f.passed:
            print(f"  ✅ {f.rule_id:<9} {f.name}")
        else:
            flag = "⛔" if f.is_blocker else "⚠️ "
            print(f"  {flag} {f.rule_id:<9} {f.name}")
            print(f"       └─ {f.message}")
    print("")
    print(f"  校验结果：{res['paths']['validation']}")
    print(f"  待复核清单：{res['paths']['review_list']}")
    return {"biz_date": res["biz_date"], "summary": s, "paths": res["paths"],
            "findings": [f.to_dict() for f in res["findings"]]}


def cmd_review(cfg: Config, auditor: Auditor, args) -> dict:
    auditor.check("review")
    biz = _parse_date(args.date).isoformat() if args.date else None
    if not biz:
        with Warehouse(cfg) as wh:
            biz = current_biz_date(wh)

    vp, rp = validation_path(cfg, biz), review_list_path(cfg, biz)
    if not vp.is_file():
        raise SystemExit(f"找不到 {vp.name}，请先执行 check。")

    data = json.loads(vp.read_text(encoding="utf-8"))
    s = data["summary"]
    print(f"  业务日期：{biz}")
    print(f"  规则 {s['total']} 条：通过 {s['passed']} / 阻断 {s['block']} / 提示 {s['warn']}")

    for f in data["findings"]:
        if f.get("is_blocker"):
            print(f"  ⛔ {f['rule_id']:<9} {f['message']}")
    for f in data["findings"]:
        if f.get("is_warning"):
            print(f"  ⚠️  {f['rule_id']:<9} {f['message']}")

    print("")
    print(f"  清单文件：{rp}")
    approved = load_approval(cfg, biz)
    if approved:
        print(f"  审批状态：已批准（{approved.get('reviewer')} @ {approved.get('approved_at')}）")
    else:
        print("  审批状态：未批准")
        print(f"  下一步：python run.py approve --reviewer <你的名字> --date {biz}")
    return {"biz_date": biz, "summary": s, "review_list": str(rp),
            "approved": bool(approved)}


def cmd_approve(cfg: Config, auditor: Auditor, args) -> dict:
    biz = _parse_date(args.date).isoformat() if args.date else None
    if not biz:
        with Warehouse(cfg) as wh:
            biz = current_biz_date(wh)
    res = P.stage_approve(cfg, auditor, biz, args.reviewer, args.note or "")
    print(f"  ✓ 复核人 {res['reviewer']} 已批准 {biz} 的 {res['artifacts']} 个报表")
    print(f"    凭证：{res['path']}")
    print("    凭证已绑定报表 sha256；报表若在审批后被重新生成，交付会被拒绝。")
    return res


def cmd_deliver(cfg: Config, auditor: Auditor, args) -> dict:
    biz = _parse_date(args.date).isoformat() if args.date else None
    if not biz:
        with Warehouse(cfg) as wh:
            biz = current_biz_date(wh)
    res = P.stage_deliver(cfg, auditor, biz, None, dry_run=not args.send)
    print(f"  ✓ 复核人：{res['reviewer']}")
    print(f"    归档目录：{res['archive_dir']}")
    for f in res["archived"]:
        print(f"      · {f}")
    print("")
    for m in res["messages"]:
        mode = "dry-run" if m["push"].get("dry_run") else f"已推送({m['push'].get('parts')}条)"
        print(f"    [{mode}] {m['kind']:<14} → {', '.join(m['recipients']) or '（未配置接收人）'}")
        print(f"      载荷：{m['payload']}")
    if res.get("unapproved_files"):
        print("")
        print(f"    ⚠️ 以下文件不在审批凭证里：{res['unapproved_files']}")
    return res


def cmd_pipeline(cfg: Config, auditor: Auditor, args) -> dict:
    res = P.run_all(
        cfg, actor=auditor.actor, role=auditor.role,
        regenerate=args.regenerate, anomalies=args.anomalies, days=args.days,
        as_of=_parse_date(args.as_of), approve=args.approve, reviewer=args.reviewer or "",
        deliver_report=args.deliver, push=args.send,
    )
    return {k: v for k, v in res.items() if k not in ("extract", "transform", "load", "build")}


def cmd_status(cfg: Config, auditor: Auditor, args) -> dict:
    info = P.status(cfg)
    print(f"  项目根：{info['root']}")
    print(f"  酒店：{info['hotel']}")
    print(f"  业务日期：{info.get('biz_date') or '（还没有数据）'}")
    print(f"  审批状态：{info.get('approval') or '未批准'}"
          + (f"（{info.get('reviewer')}）" if info.get("reviewer") else ""))
    print("")
    tables = info.get("tables") or {}
    if tables:
        print("  DuckDB 表：")
        for t, n in tables.items():
            print(f"    {t:<26} {n:>7,} 行")
    else:
        print("  DuckDB 里还没有表，先跑 pipeline。")
    cov = info["coverage"]
    print("")
    print(f"  规则覆盖：{cov['rules']} 条，类型 {cov['by_type']}")
    if cov["problems"]:
        print(f"  ⛔ {cov['problems']}")
    for k in ("review_list", "manifest"):
        if info.get(k):
            print(f"  {k}: {info[k]}")
    return info


def cmd_selftest(cfg: Config, auditor: Auditor, args) -> dict:
    res = P.selftest(cfg)
    for c in res["checks"]:
        mark = "✓" if c["ok"] else "✗"
        line = f"  {mark} {c['name']}"
        if c["detail"]:
            line += f"  —— {c['detail']}"
        print(line)
    print("")
    print("  体检结果：" + ("全部通过 ✅" if res["ok"] else f"{len(res['failed'])} 项未通过 ⛔"))
    return res


def cmd_roles(cfg: Config, auditor: Auditor, args) -> dict:
    roles = cfg.delivery.get("roles", {}) or {}
    print(f"  默认身份：{cfg.default_role}")
    print("")
    print(f"  {'角色':<18} {'允许的命令'}")
    print("  " + "-" * 58)
    for name, cmds in roles.items():
        print(f"  {name:<18} {', '.join(cmds)}")
    return {"roles": roles, "default_role": cfg.default_role}


def cmd_ui(cfg: Config, auditor: Auditor, args) -> dict:
    """起本地可视化控制台。阻塞式，Ctrl+C 退出。"""
    from .ui import serve
    serve(cfg, host=args.host, port=args.port, open_browser=not args.no_browser)
    return {"url": f"http://{args.host}:{args.port}/"}


# ============================ 参数 ============================

def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="hotel-dw",
        description="酒店经营数据自动化 · 轻量数据中台（DuckDB 单引擎）",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="示例：\n"
               "  python run.py pipeline --regenerate            # 造数据 + 全流程跑到复核闸门\n"
               "  python run.py pipeline --regenerate --anomalies # 造一批脏数据，看规则怎么拦\n"
               "  python run.py approve --reviewer 张三           # 财务复核岗签字\n"
               "  python run.py deliver                           # 交付（默认 dry-run）\n",
    )
    p.add_argument("--root", help="项目根目录（默认自动向上查找 config/settings.yaml）")
    p.add_argument("--actor", help="执行人（默认取系统登录名）")
    p.add_argument("--role", help="执行角色（extractor / analyst / finance_reviewer / admin）")
    p.add_argument("--json", action="store_true", help="以 JSON 输出结果")

    sub = p.add_subparsers(dest="command")

    sub.add_parser("init", help="创建所有目录").set_defaults(func=cmd_init)
    sub.add_parser("selftest", help="开工前体检").set_defaults(func=cmd_selftest)
    sub.add_parser("status", help="查看当前进展").set_defaults(func=cmd_status)
    sub.add_parser("roles", help="打印权限矩阵").set_defaults(func=cmd_roles)

    sp = sub.add_parser("ui", help="起本地可视化控制台（浏览器操作全流程）")
    sp.add_argument("--port", type=int, default=8777, help="监听端口（被占用会自动顺延）")
    sp.add_argument("--host", default="127.0.0.1", help="监听地址（默认只绑本机）")
    sp.add_argument("--no-browser", action="store_true", help="不自动打开浏览器")
    sp.set_defaults(func=cmd_ui)

    sp = sub.add_parser("mock", help="生成模拟上游数据")
    sp.add_argument("--days", type=int, default=None,
                    help="生成多少天（默认取 settings.run.mock_days）")
    sp.add_argument("--as-of", help="最后一天（默认今天，格式 YYYY-MM-DD）")
    sp.add_argument("--anomalies", action="store_true", help="故意种入异常用于演示")
    sp.set_defaults(func=cmd_mock)

    sub.add_parser("extract", help="登记原始 CSV 为只读视图").set_defaults(func=cmd_extract)
    sub.add_parser("transform", help="清洗：raw → stg").set_defaults(func=cmd_transform)
    sub.add_parser("load", help="落地：stg → Parquet 快照").set_defaults(func=cmd_load)
    sub.add_parser("build", help="成表：生成报表并导出").set_defaults(func=cmd_build)

    sp = sub.add_parser("check", help="跑全部校验规则")
    sp.add_argument("--date", help="业务日期 YYYY-MM-DD")
    sp.set_defaults(func=cmd_check)

    sp = sub.add_parser("review", help="查看待复核清单")
    sp.add_argument("--date", help="业务日期 YYYY-MM-DD")
    sp.set_defaults(func=cmd_review)

    sp = sub.add_parser("approve", help="复核签字（阻断项未清零会被拒绝）")
    sp.add_argument("--reviewer", required=True, help="复核人姓名")
    sp.add_argument("--date", help="业务日期 YYYY-MM-DD")
    sp.add_argument("--note", help="备注")
    sp.set_defaults(func=cmd_approve)

    sp = sub.add_parser("deliver", help="交付：归档 + 企微通知")
    sp.add_argument("--date", help="业务日期 YYYY-MM-DD")
    sp.add_argument("--send", action="store_true", help="真的推送（默认 dry-run 只落盘）")
    sp.set_defaults(func=cmd_deliver)

    sp = sub.add_parser("pipeline", help="串起全流程")
    sp.add_argument("--regenerate", action="store_true", help="先重新生成模拟上游数据")
    sp.add_argument("--anomalies", action="store_true", help="种入异常（配合 --regenerate）")
    sp.add_argument("--days", type=int, default=None)
    sp.add_argument("--as-of")
    sp.add_argument("--approve", action="store_true", help="复核通过后自动签字")
    sp.add_argument("--reviewer", help="复核人（配合 --approve）")
    sp.add_argument("--deliver", action="store_true", help="签字后继续交付")
    sp.add_argument("--send", action="store_true", help="真的推送企微")
    sp.set_defaults(func=cmd_pipeline)

    return p


def main(argv: list[str] | None = None) -> int:
    _fix_console()
    args = build_parser().parse_args(argv)

    if not args.command:
        build_parser().print_help()
        return 0

    if args.root:
        os.environ["HOTEL_DW_ROOT"] = str(find_project_root(__import__("pathlib").Path(args.root)))

    cfg = Config()
    auditor = Auditor(cfg, actor=args.actor, role=args.role)

    _banner(f"{args.command} · 角色 {auditor.role} · run_id {auditor.run_id}")

    # pipeline / status / selftest / roles / ui 自己管理流程，其余命令先做权限检查
    if args.command not in ("pipeline", "status", "selftest", "roles", "init", "mock", "ui"):
        try:
            auditor.check(args.command)
        except PermissionDenied as exc:
            print(f"\n  ⛔ 权限不足：{exc}")
            return 3

    try:
        payload = args.func(cfg, auditor, args)
    except PermissionDenied as exc:
        print(f"\n  ⛔ 权限不足：{exc}")
        return 3
    except NotApproved as exc:
        print(f"\n  ⛔ 复核闸门：{exc}")
        return 4
    except Exception as exc:                                # noqa: BLE001
        import traceback
        print(f"\n  ⛔ 执行失败：{type(exc).__name__}: {exc}")
        if os.environ.get("HOTEL_DW_DEBUG"):
            traceback.print_exc()
        else:
            print("    （要看完整堆栈，设环境变量 HOTEL_DW_DEBUG=1）")
        return 1

    if args.json:
        print("")
        print(json.dumps(payload, ensure_ascii=False, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
