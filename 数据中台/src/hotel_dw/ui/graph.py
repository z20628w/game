"""控制台 3D 全景图 · 数据装配。

把五份彼此独立的事实合成一张图：
    主流程（一共几步、走到哪了）      ← 磁盘产物推导（与左侧阶段卡片同一口径）
    库里的表（有哪些、多少行）        ← DuckDB information_schema
    血缘（谁喂谁）                    ← 解析 sql/**/*.sql
    治理状态（有没有规律看着它）      ← config/report_rules.yaml + 校验结果
    交付归属（哪张表出了哪个文件）    ← config/report_rules.yaml → marts.outputs

**为什么真的要解析 SQL，而不是按表名猜血缘。**
`raw_*` 和 `stg_*` 的名字并不总是一一对应：`raw_channel_daily` 喂的是
`stg_channel`，`raw_member_daily` 喂的是 `stg_member`。按名字前缀硬凑，
画出来的边一半是假的 —— 一张图只要有一条假边，整张图就不可信了。
真正可信的来源只有一个：**产出这张表的 SQL 读了谁**。
所以这里按语句切开 SQL 文件、逐条收集引用，血缘跟着代码一起演进。

注意 mart 之间也存在真实依赖（mart_finance_revenue ← mart_finance_daily），
所以血缘是 raw → stg → mart → mart 的有向图，不是简单的三层。

**主流程状态为什么不在这里重新推导一遍。**
阶段状态（完成/未运行/运行中/被拦截）在左侧阶段卡片上已经有一份推导逻辑，
如果这里再写一份，两处迟早会不一致 —— 卡片说「完成」而全景图说「未运行」，
用户就再也不信这张图了。所以状态一律由 `build_snapshot()` 算好、由 server
传进来（`snapshot` 参数），这里只负责**摆放**：谁在第几工位、这一步产出了什么。

工位的顺序是业务事实，不是排版偏好：抽取一定在清洗之前，没签字一定不能交付。
所以它是这份文件里的常量 `STATION_FLOW`，而不是按数据现算。
"""

from __future__ import annotations

import glob
import json
import re

from ..config import Config
from ..db import Warehouse
from ..review import validation_path

# 层的展示顺序与配色键（配色在 CSS 里，这里只给语义）
LAYERS: list[dict] = [
    {"key": "raw",  "label": "原始层", "hint": "只读，任何加工都不许回写", "column": 0},
    {"key": "stg",  "label": "清洗层", "hint": "统一列名 + 类型纠正", "column": 1},
    {"key": "mart", "label": "报表层", "hint": "财务口径成品 + 交付导出", "column": 2},
]

# 主流程的 8 个工位，按业务先后排死。
# key 必须与 server.STAGES 里的 key 一致（标签/提示从那边取，这里只定顺序）。
# `gate: True` 的工位是人工闸门：它是**拦**在流程上的，不是流程的一部分，
# 场景里要画成实体拦杆 —— 数据库里有没有数据，不能替人把这个门放行。
STATION_FLOW: list[dict] = [
    {"key": "mock",      "label": "生成上游数据", "produce": "raw_files"},
    {"key": "extract",   "label": "抽取",         "produce": "raw"},
    {"key": "transform", "label": "清洗",         "produce": "stg"},
    {"key": "load",      "label": "落湖",         "produce": "lakehouse"},
    {"key": "build",     "label": "成表",         "produce": "mart"},
    {"key": "check",     "label": "校验",         "produce": "findings"},
    {"key": "approve",   "label": "复核签字",     "produce": "approval", "gate": True},
    {"key": "deliver",   "label": "交付",         "produce": "outbox"},
]

# 表按「哪一步把它做出来的」归位。
# 注意 load 不产出表（它产出 Parquet 快照），所以落湖工位上没有方块 ——
# 这不是缺数据，这就是这条流水线真实的样子。
_STATION_OF_LAYER = {"raw": "extract", "stg": "transform", "mart": "build"}


# 业务域：按顺序匹配，先命中先算数（顺序有意义，
# 比如 mart_ota_weekly 同时含 'ota'，要被 OTA 规则先接住）
DOMAIN_RULES: list[tuple[str, tuple[str, ...]]] = [
    ("pms",     ("pms",)),
    ("member",  ("member",)),
    ("channel", ("channel",)),
    ("ota",     ("ota",)),
    ("media",   ("media",)),
    ("guest",   ("guest",)),
    ("sales",   ("sales",)),
    ("finance", ("finance", "manual", "tax", "dept")),
]

DOMAIN_LABELS = {
    "pms": "PMS 经营",
    "member": "会员",
    "channel": "渠道",
    "ota": "OTA",
    "media": "新媒体",
    "guest": "客源",
    "sales": "销售",
    "finance": "财务",
    "other": "其他",
}

# 3D 场景里的行分组。
# 为什么不直接用 9 个业务域当行：9 行 × 每行 1~2 个方块的细长布局，
# 会把包围盒拉成 1231×270×1626 这种扁平长条，透视适配时被迫退到很远的距离，
# 方块小到看不清。合并成 5 行之后长宽比接近正常，画面尺度直接翻倍。
# 精确的域仍然留在节点的 `domain` 上（悬浮卡片里显示），这里只管摆放。
DOMAIN_GROUPS: list[dict] = [
    {"key": "operate", "label": "经营", "domains": ["pms", "member"]},
    {"key": "channel", "label": "渠道", "domains": ["channel", "ota", "media"]},
    {"key": "finance", "label": "财务", "domains": ["finance"]},
    {"key": "guest", "label": "客源与销售", "domains": ["guest", "sales"]},
    {"key": "other", "label": "其他", "domains": ["other"]},
]

# 建表/建视图语句的开头
_DDL = re.compile(
    r"(?i)CREATE\s+(?:OR\s+REPLACE\s+)?(TABLE|VIEW)\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z0-9_]+)")
_IDENT = re.compile(r"\b((?:raw|stg|mart)_[a-z0-9_]+)")


def _split_statements(text: str) -> list[tuple[str, str, str]]:
    """把 .sql 按 DDL 切成块，返回 [(对象名, 类型, 该块的原文)]。

    不按分号切 —— 分号会出现在字符串和子查询里。按 `CREATE ...` 的出现位置切，
    每一块自然就是「一次建对象」的全部输入，正是血缘需要的粒度。
    """
    blocks: list[tuple[str, str, str]] = []
    marks = list(_DDL.finditer(text))
    for i, m in enumerate(marks):
        end = marks[i + 1].start() if i + 1 < len(marks) else len(text)
        blocks.append((m.group(2), m.group(1).upper(), text[m.start():end]))
    return blocks


def _sql_lineage(cfg: Config) -> tuple[list[dict], dict[str, str]]:
    """扫 sql/ 下的文件，产出 (边列表, {对象名: 产出它的 sql 文件})。"""
    edges: list[dict] = []
    origin: dict[str, str] = {}
    seen: set[tuple[str, str]] = set()

    for sub, kind in (("staging", "view"), ("marts", "build")):
        sql_dir = cfg.root / "sql" / sub
        if not sql_dir.is_dir():
            continue
        for path in sorted(sql_dir.glob("*.sql")):
            text = path.read_text(encoding="utf-8")
            for name, _obj, block in _split_statements(text):
                origin[name] = f"sql/{sub}/{path.name}"
                refs = {r for r in _IDENT.findall(block) if r != name}
                for ref in sorted(refs):
                    key = (ref, name)
                    if key in seen:
                        continue
                    seen.add(key)
                    edges.append({"from": ref, "to": name, "kind": kind})
    return edges, origin


_GROUP_OF = {d: g["key"] for g in DOMAIN_GROUPS for d in g["domains"]}


def _group_of(domain: str) -> str:
    return _GROUP_OF.get(domain, "other")


def _layer_of(table: str) -> str:
    if table.startswith("raw_"):
        return "raw"
    if table.startswith("stg_"):
        return "stg"
    if table.startswith("mart_"):
        return "mart"
    return "other"


def _station_of(layer: str) -> str | None:
    """这张表是哪一步做出来的。返回 None 表示不属于主流程的任何工位。"""
    return _STATION_OF_LAYER.get(layer)


def _domain_of(table: str) -> str:
    lowered = table.lower()
    for key, needles in DOMAIN_RULES:
        if any(n in lowered for n in needles):
            return key
    return "other"


def _deliverables(cfg: Config) -> dict[str, dict]:
    """{表名: 交付文件信息} —— 有些 mart 只做中间层，不出文件，所以要按表查。"""
    out: dict[str, dict] = {}
    for mart_key, mart in (cfg.rules.get("marts") or {}).items():
        for spec in mart.get("outputs", []) or []:
            if spec.get("table"):
                out[spec["table"]] = {
                    "file": spec["file"],
                    "sheet": spec.get("name", ""),
                    "title": mart.get("title", mart_key),
                    "cadence": mart.get("cadence", ""),
                }
    return out


def _rule_coverage(cfg: Config) -> tuple[dict[str, list[str]], set[str]]:
    """{表名: [看着它的规则号]} 以及所有被规则点名的表。"""
    by_table: dict[str, list[str]] = {}
    covered: set[str] = set()
    for rule in cfg.rules.get("validation", []) or []:
        rid = rule.get("id", "?")
        targets = [rule.get("table")]
        targets += [rule.get("left_table"), rule.get("right_table")]
        for t in targets:
            if not t:
                continue
            covered.add(t)
            by_table.setdefault(t, []).append(rid)
    return by_table, covered


def _findings(cfg: Config, biz_date: str | None) -> list[dict]:
    if not biz_date:
        return []
    path = validation_path(cfg, biz_date)
    if not path.is_file():
        return []
    try:
        return json.loads(path.read_text(encoding="utf-8")).get("findings") or []
    except (OSError, json.JSONDecodeError):
        return []


def _stations(cfg: Config, snapshot: dict | None,
              stages: list[dict] | None, nodes: list[dict]) -> tuple[list[dict], dict]:
    """把 snapshot 里的磁盘事实翻译成「8 个工位各自走到哪一步」。

    这里是**翻译**，不是判断。判断（这个阶段算不算完成）已经由 build_snapshot
    做过了，口径必须与左侧阶段卡片完全一致，否则两处会打架。
    """
    snap = snapshot or {}
    meta = {s["key"]: s for s in (stages or [])}

    names = [t["name"] if isinstance(t, dict) else t for t in (snap.get("tables") or [])]
    n_raw = sum(1 for t in names if t.startswith("raw_"))
    n_stg = sum(1 for t in names if t.startswith("stg_"))
    n_mart = sum(1 for t in names if t.startswith("mart_"))
    raw_files = int(snap.get("raw_files") or 0)
    lake = int(snap.get("lakehouse_files") or 0)
    deliver = len(snap.get("deliverables") or [])
    outbox = snap.get("outbox_runs") or []
    outbox_files = int((outbox[0] or {}).get("files") or 0) if outbox else 0
    found = snap.get("findings") or {}
    block = int(found.get("block") or 0)
    warn = int(found.get("warn") or 0)
    approved = snap.get("approval") == "approved"
    reviewer = snap.get("reviewer") or ""
    rule_total = len(cfg.rules.get("validation", []) or [])

    seen: dict[str, dict] = {}
    if raw_files:
        seen["mock"] = {"status": "ok", "note": f"{raw_files} 个原始文件",
                        "count": raw_files, "unit": "个文件"}
    if n_raw:
        seen["extract"] = {"status": "ok", "note": f"{n_raw} 张只读视图",
                           "count": n_raw, "unit": "张表"}
    if n_stg:
        seen["transform"] = {"status": "ok", "note": f"{n_stg} 张清洗表",
                             "count": n_stg, "unit": "张表"}
    if lake:
        seen["load"] = {"status": "ok", "note": f"{lake} 个 Parquet 快照",
                        "count": lake, "unit": "个快照"}
    if n_mart or deliver:
        seen["build"] = {"status": "ok",
                         "note": f"{n_mart} 张报表 · {deliver} 个交付文件",
                         "count": n_mart, "unit": "张表"}
    if found:
        seen["check"] = {
            "status": "blocked" if block else ("warn" if warn else "ok"),
            "note": f"阻断 {block} / 提示 {warn}",
            "count": rule_total, "unit": "条规则",
        }
    if approved:
        seen["approve"] = {"status": "ok", "note": reviewer or "已签字",
                           "count": 1, "unit": "次签字"}
    if outbox_files:
        seen["deliver"] = {"status": "ok", "note": f"{outbox_files} 个文件已归档",
                           "count": outbox_files, "unit": "个文件"}

    stations: list[dict] = []
    for i, spec in enumerate(STATION_FLOW):
        key = spec["key"]
        info = seen.get(key)
        m = meta.get(key) or {}
        if info is None:
            # 没跑过。人工闸门单独给一句提示：它不是「待执行」，是「等一个人」。
            info = {"status": "pending", "count": 0, "unit": "",
                    "note": ("等待签字" if spec.get("gate") else "未运行")}
        stations.append({
            "key": key,
            "order": i,
            "label": m.get("label") or spec["label"],
            "hint": m.get("hint") or "",
            "group": m.get("group") or "auto",
            "gate": bool(spec.get("gate")),
            "status": info["status"],
            "note": info["note"],
            "count": info["count"],
            "unit": info.get("unit", ""),
            "tables": [n["id"] for n in nodes if n.get("station") == key],
        })

    # 前沿 = 第一个还没走完的工位。这就是「跑到哪了」——它比「完成 5/8」这种
    # 比例更有用：比例只告诉你还剩多少，前沿告诉你**卡在哪**。
    frontier = next((s["order"] for s in stations if s["status"] != "ok"),
                    len(stations))
    flow = {
        "total": len(stations),
        "done": sum(1 for s in stations if s["status"] == "ok"),
        "frontier": frontier,
        "frontier_key": stations[frontier]["key"] if frontier < len(stations) else None,
        "gate_locked": not approved,
        "approval": snap.get("approval"),
        "reviewer": reviewer,
        "blocked": block,
    }
    return stations, flow


def build_graph(cfg: Config, biz_date: str | None,
                snapshot: dict | None = None,
                stages: list[dict] | None = None) -> dict:
    """装配 3D 全景图。表清单读不到时返回空图 + 原因，让前端能说清为什么是空的。

    注意：库读不出来时**仍然把工位列表返回**。主流程走到哪一步是从磁盘产物
    推出来的（有没有原始文件、有没有快照、签没签字），跟数据库表在不在没有关系。
    把这部分一起丢掉，用户看到的会是「一片空白 + 一个报错」，
    而实际上他可能只是还没跑 transform —— 流水线本身仍然值得看见。
    """
    if not cfg.file("db").is_file():
        stations, flow = _stations(cfg, snapshot, stages, [])
        return {"ok": False, "error": "数据库文件还不存在，先跑一次 pipeline",
                "nodes": [], "edges": [], "layers": LAYERS, "groups": [],
                "stations": stations, "flow": flow}

    try:
        with Warehouse(cfg, read_only=True) as wh:
            rows = wh.query(
                "SELECT table_name, table_type FROM information_schema.tables "
                "ORDER BY table_name")
            inventory = []
            for name, ttype in rows:
                try:
                    count = wh.row_count(name)
                except Exception:                       # noqa: BLE001
                    count = None
                inventory.append((name, ttype, count))
    except Exception as exc:                            # noqa: BLE001
        stations, flow = _stations(cfg, snapshot, stages, [])
        return {"ok": False, "error": f"读取数据库失败（可能正有任务在写入）：{exc}",
                "nodes": [], "edges": [], "layers": LAYERS, "groups": [],
                "stations": stations, "flow": flow}

    edges, origin = _sql_lineage(cfg)
    deliverables = _deliverables(cfg)
    rules_by_table, covered = _rule_coverage(cfg)
    findings = _findings(cfg, biz_date)

    # 每个表的校验结论：阻断优先于提示；没被任何规则点名的标成「无人看管」
    problem: dict[str, str] = {}
    detail: dict[str, list[dict]] = {}
    for f in findings:
        t = f.get("table")
        if not t or f.get("passed"):
            continue
        sev = "block" if f.get("severity") == "block" or f.get("is_blocker") else "warn"
        if problem.get(t) != "block":
            problem[t] = sev
        detail.setdefault(t, []).append({
            "rule_id": f.get("rule_id"), "name": f.get("name"),
            "severity": sev, "message": f.get("message"),
        })

    raw_files: dict[str, int] = {}
    try:
        from ..extract import source_file_specs
        raw_dir = cfg.path("raw", make=False)
        for spec in source_file_specs(cfg):
            pattern = (raw_dir / spec["glob"]).as_posix()
            raw_files["raw_" + spec["table"]] = sum(
                1 for p in glob.glob(pattern, recursive=True) if p)
    except Exception:                                   # noqa: BLE001
        raw_files = {}

    used_edges = set()
    nodes: list[dict] = []
    for name, ttype, count in inventory:
        layer = _layer_of(name)
        domain = _domain_of(name)
        status = problem.get(name) or ("ok" if name in covered else "uncovered")
        nodes.append({
            "id": name,
            "label": name,
            "layer": layer,
            # 这张表是哪一步做出来的 —— 3D 场景靠它把方块摆到对应工位上
            "station": _station_of(layer),
            "domain": domain,
            "domain_label": DOMAIN_LABELS.get(domain, domain),
            "group": _group_of(domain),
            "rows": count,
            "kind": "view" if ttype == "VIEW" else "table",
            "status": status,
            "rules": rules_by_table.get(name, []),
            "problems": detail.get(name, []),
            "deliverable": deliverables.get(name),
            "files": raw_files.get(name),
            "origin": origin.get(name),
        })

    known = {n["id"] for n in nodes}
    kept: list[dict] = []
    for e in edges:
        if e["from"] in known and e["to"] in known:
            kept.append(e)
            used_edges.add(e["from"])
            used_edges.add(e["to"])

    # 行分组的固定顺序：只输出真正有节点的组，但保持 DOMAIN_GROUPS 的顺序，
    # 这样刷数据时行不会跳位。
    present = {n["group"] for n in nodes}
    groups = [{"key": g["key"], "label": g["label"],
               "count": sum(1 for n in nodes if n["group"] == g["key"])}
              for g in DOMAIN_GROUPS if g["key"] in present]

    mart_total = sum(1 for n in nodes if n["layer"] == "mart")
    stations, flow = _stations(cfg, snapshot, stages, nodes)
    return {
        "ok": True,
        "error": None,
        "biz_date": biz_date,
        "nodes": nodes,
        "edges": kept,
        "layers": [dict(l, count=sum(1 for n in nodes if n["layer"] == l["key"]))
                   for l in LAYERS],
        "groups": groups,
        "stations": stations,
        "flow": flow,
        "summary": {
            "nodes": len(nodes),
            "edges": len(kept),
            "rows": sum(n["rows"] or 0 for n in nodes),
            "marts": mart_total,
            "deliverables": sum(1 for n in nodes if n["deliverable"]),
            "uncovered": sum(1 for n in nodes if n["status"] == "uncovered"),
            "block": sum(1 for n in nodes if n["status"] == "block"),
            "warn": sum(1 for n in nodes if n["status"] == "warn"),
            "isolated": sum(1 for n in nodes if n["id"] not in used_edges),
        },
    }
