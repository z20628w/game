"""校验引擎。

把 config/report_rules.yaml 里的 validation 段编译成 SQL，逐条跑，产出 Finding。

支持 8 类规则（type 字段）：
    not_null        字段不得为空
    completeness    到数数量不得低于应有数量
    date_freshness  数据日期必须新鲜（专治「静默失败」：跑到了旧数据却没人发现）
    reconcile       勾稽关系必须平（支持 = / <= / >= / < / >）
    non_negative    数值不得越界为负（可按科目开白名单）
    deviation       环比不得突变
    duplicate       主键不得重复
    cross_check     两张表之间口径必须一致（人工导出 vs 系统）

两条设计约定：
  1) 每条规则都可以带一个 where 作用域。没有它，「渠道到数是否齐」这类规则
     会被历史日期里的正常缺失长期污染，最后没人看。
  2) 规则执行失败（表不存在、SQL 报错）按「未通过」处理而不是抛异常。
     因为「规则跑不起来」本身就是必须被发现的问题，不能静默跳过。
"""

from __future__ import annotations

import math
from dataclasses import asdict, dataclass, field
from datetime import date, datetime
from typing import Any

from ..audit import TZ
from ..config import Config
from ..db import Warehouse


# ============================ 结果结构 ============================

@dataclass
class Finding:
    """一条规则的判定结果。"""
    rule_id: str
    name: str
    type: str
    severity: str            # block | warn
    table: str
    passed: bool
    reason: str = ""
    detail: dict = field(default_factory=dict)
    message: str = ""
    rows: int = 0            # 命中的问题行数（不是全表行数）

    @property
    def is_blocker(self) -> bool:
        return (not self.passed) and self.severity == "block"

    @property
    def is_warning(self) -> bool:
        return (not self.passed) and self.severity != "block"

    def to_dict(self) -> dict:
        d = asdict(self)
        d["is_blocker"] = self.is_blocker
        d["is_warning"] = self.is_warning
        return d


def summarize(findings: list[Finding]) -> dict:
    """汇总：总数 / 通过 / 阻断 / 提示。"""
    return {
        "total": len(findings),
        "passed": sum(1 for f in findings if f.passed),
        "block": sum(1 for f in findings if f.is_blocker),
        "warn": sum(1 for f in findings if f.is_warning),
        "failed": sum(1 for f in findings if not f.passed),
    }


# ============================ 取值助手 ============================

def _where(rule: dict) -> str:
    w = rule.get("where")
    return f"WHERE {w}" if w else ""


def _and_where(rule: dict, extra: str) -> str:
    """把规则的 where 和本类型自己的判定条件用 AND 合起来。"""
    w = rule.get("where")
    return f"WHERE ({w}) AND ({extra})" if w else f"WHERE {extra}"


def _tolerance(cfg: Config, rule: dict) -> float:
    if rule.get("tolerance_from"):
        return float(cfg.ref(rule["tolerance_from"]))
    if "tolerance" in rule:
        return float(rule["tolerance"])
    return cfg.tolerance


def _pct(cfg: Config, rule: dict) -> float:
    if rule.get("pct_from"):
        return float(cfg.ref(rule["pct_from"]))
    if "pct" in rule:
        return float(rule["pct"])
    return cfg.deviation_pct


def _today() -> date:
    return datetime.now(TZ).date()


# ============================ 各类检查 ============================
# 约定：返回 (是否通过, 命中问题行数, detail 字典)
# detail 的键要能填满 report_rules.yaml → anomaly_explain 里的占位符。

def _check_not_null(wh: Warehouse, cfg: Config, rule: dict):
    cols = rule["columns"]
    cond = " OR ".join(f'"{c}" IS NULL' for c in cols)
    rows = int(wh.scalar(f'SELECT count(*) FROM "{rule["table"]}" {_and_where(rule, cond)}') or 0)
    detail = {"columns": "、".join(cols), "rows": rows}
    return rows == 0, rows, detail


def _check_completeness(wh: Warehouse, cfg: Config, rule: dict):
    col = rule["column"]
    if rule.get("expected_from"):
        expected = float(cfg.ref(rule["expected_from"]))
    else:
        expected = float(rule.get("expected", 0))
    ratio = float(rule.get("min_ratio", 1.0))
    need = math.ceil(expected * ratio)

    table = rule["table"]
    actual = int(wh.scalar(f'SELECT count(DISTINCT "{col}") FROM "{table}" {_where(rule)}') or 0)
    names = [str(r[0]) for r in wh.query(
        f'SELECT DISTINCT "{col}" FROM "{table}" {_where(rule)}') if r[0] is not None]
    detail = {
        "expected": need,
        "actual": actual,
        "channels": "、".join(names) if names else "（无）",
    }
    return actual >= need, max(0, need - actual), detail


def _check_date_freshness(wh: Warehouse, cfg: Config, rule: dict):
    col = rule["column"]
    max_lag = int(rule.get("max_lag_days", 1))
    latest = wh.scalar(f'SELECT max("{col}") FROM "{rule["table"]}" {_where(rule)}')
    if latest is None:
        return False, max_lag + 1, {"latest": "（无数据）", "lag": "∞", "max_lag_days": max_lag}
    if isinstance(latest, str):
        latest = datetime.strptime(latest[:10], "%Y-%m-%d").date()
    elif isinstance(latest, datetime):
        latest = latest.date()
    lag = (_today() - latest).days
    detail = {"latest": latest.isoformat(), "lag": lag, "max_lag_days": max_lag}
    return lag <= max_lag, max(0, lag - max_lag), detail


# 各比较运算符的「不平」判定式
_BAD_OP = {
    "=":  "ABS(({a}) - ({b})) > {tol}",
    "==": "ABS(({a}) - ({b})) > {tol}",
    "<=": "({a}) > ({b}) + {tol}",
    ">=": "({a}) < ({b}) - {tol}",
    "<":  "({a}) >= ({b})",
    ">":  "({a}) <= ({b})",
}


def _check_reconcile(wh: Warehouse, cfg: Config, rule: dict):
    a, b = rule["expression"], rule["equals"]
    op = rule.get("op", "=")
    tol = _tolerance(cfg, rule)
    bad = _BAD_OP.get(op, _BAD_OP["="]).format(a=a, b=b, tol=tol)
    rows, diff = wh.query(
        f'SELECT count(*), COALESCE(SUM(ABS(({a}) - ({b}))), 0) '
        f'FROM "{rule["table"]}" {_and_where(rule, bad)}')[0]
    rows, diff = int(rows or 0), float(diff or 0)
    detail = {
        "expression": a, "equals": b, "op": op,
        "tolerance": tol, "rows": rows, "diff": round(diff, 2),
    }
    return rows == 0, rows, detail


def _check_non_negative(wh: Warehouse, cfg: Config, rule: dict):
    cols = rule["columns"]
    table = rule["table"]
    cond = " OR ".join(f'"{c}" < 0' for c in cols)

    allow = [str(x) for x in (rule.get("allow_negative_items") or [])]
    if allow and "item" in wh.columns_of(table):
        items = ", ".join("'" + x.replace("'", "''") + "'" for x in allow)
        cond = f"({cond}) AND COALESCE(item, '') NOT IN ({items})"

    least = ", ".join(f'"{c}"' for c in cols)
    rows, min_v = wh.query(
        f"SELECT count(*), COALESCE(MIN(LEAST({least})), 0) "
        f'FROM "{table}" {_and_where(rule, cond)}')[0]
    rows, min_v = int(rows or 0), float(min_v or 0)
    detail = {"columns": "、".join(cols), "rows": rows, "min_value": round(min_v, 2)}
    return rows == 0, rows, detail


def _check_deviation(wh: Warehouse, cfg: Config, rule: dict):
    """环比偏离。

    两种粒度，靠 required_columns 区分：
      * 不带 required_columns → 按 key_column 分组求和后，相邻 key 比（如按天比收入）
      * 带   required_columns → 用 (key + required) 定位同一实体的上一期
                                （如「同一渠道的上一周」），跨实体不会互相比
    """
    table = rule["table"]
    val = rule["value_column"]
    key = rule["key_column"]
    req = list(rule.get("required_columns") or [])
    threshold = _pct(cfg, rule)

    if req:
        dims = [key] + req
        col_sql = ", ".join(f'"{c}"' for c in dims)
        rows_raw = wh.query_dicts(
            f'SELECT {col_sql}, SUM("{val}") AS v FROM "{table}" {_where(rule)} '
            f"GROUP BY ALL ORDER BY {col_sql}")
        series: dict[tuple, float] = {}
        for d in rows_raw:
            series[tuple(str(d[c]) for c in dims)] = float(d["v"] or 0)
    else:
        series = {}
        for d in wh.query_dicts(
                f'SELECT "{key}" AS k, SUM("{val}") AS v FROM "{table}" {_where(rule)} '
                f'GROUP BY "{key}" ORDER BY "{key}"'):
            series[(str(d["k"]),)] = float(d["v"] or 0)

    bad: list[dict] = []
    # 不管过不过，都把「实际观察到的最大偏离」记下来。
    # 只记 bad 的话，规则通过时就没东西可说，只能编一句「由 - 变为 -」——
    # 那种话对复核的人毫无价值，纯属噪音。
    max_pct = 0.0

    if req:
        # 带 required_columns：key_column 是「实体」，required_columns 是「期次」。
        # 同一实体跨期比 —— 例如同一渠道的上一周 vs 这一周。
        last: dict[str, float] = {}
        for k in sorted(series):
            cur = series[k]
            base = k[0]
            if base in last and last[base] != 0:
                pct = (cur - last[base]) / abs(last[base]) * 100
                max_pct = max(max_pct, abs(pct))
                if abs(pct) > threshold:
                    bad.append({"key": base, "prev": round(last[base], 2),
                                "curr": round(cur, 2), "pct": round(pct, 2)})
            last[base] = cur
    else:
        # 不带 required_columns：key_column 本身就是期次（如 biz_date）。
        # 每个 key 只出现一次，所以「上一期」= 排序后的上一条，而不是同一个 key。
        ordered = sorted(series)
        for prev_k, cur_k in zip(ordered, ordered[1:]):
            prev, cur = series[prev_k], series[cur_k]
            if prev == 0:
                continue
            pct = (cur - prev) / abs(prev) * 100
            max_pct = max(max_pct, abs(pct))
            if abs(pct) > threshold:
                bad.append({"key": cur_k[0], "prev": round(prev, 2),
                            "curr": round(cur, 2), "pct": round(pct, 2)})

    detail: dict[str, Any] = {
        "key": key, "threshold": threshold, "rows": len(bad), "items": bad[:10],
        "series_size": len(series), "max_pct": round(max_pct, 2),
    }
    if bad:
        detail.update(bad[0])
    return len(bad) == 0, len(bad), detail


def _check_duplicate(wh: Warehouse, cfg: Config, rule: dict):
    table = rule["table"]
    keys = rule["keys"]
    ksql = ", ".join(f'"{k}"' for k in keys)
    groups = int(wh.scalar(
        f'SELECT count(*) FROM (SELECT {ksql} FROM "{table}" '
        f"GROUP BY ALL HAVING count(*) > 1)") or 0)
    extra = int(wh.scalar(
        "SELECT COALESCE(SUM(c - 1), 0) FROM ("
        f"SELECT count(*) AS c FROM \"{table}\" GROUP BY ALL HAVING count(*) > 1)") or 0)
    detail = {"keys": "、".join(keys), "rows": groups, "extra_rows": extra}
    return groups == 0, groups, detail


def _check_cross_check(wh: Warehouse, cfg: Config, rule: dict):
    """两张表之间的口径一致性：左表按左键汇总 vs 右表按右键汇总。"""
    lt, rt = rule["left_table"], rule["right_table"]
    lk, rk = rule["left_keys"], rule["right_keys"]
    lv, rv = rule["left_value"], rule["right_value"]
    tol = _tolerance(cfg, rule)

    on = " AND ".join(f"l.{a} = r.{b}" for a, b in zip(lk, rk))
    rows, diff = wh.query(f"""
        WITH l AS (SELECT {", ".join(lk)}, SUM({lv}) AS v FROM "{lt}" GROUP BY ALL),
             r AS (SELECT {", ".join(rk)}, SUM({rv}) AS v FROM "{rt}" GROUP BY ALL)
        SELECT count(*), COALESCE(SUM(ABS(COALESCE(l.v, 0) - COALESCE(r.v, 0))), 0)
        FROM l FULL OUTER JOIN r ON {on}
        WHERE ABS(COALESCE(l.v, 0) - COALESCE(r.v, 0)) > {tol}
    """)[0]
    rows, diff = int(rows or 0), float(diff or 0)
    detail = {"left": lt, "right": rt, "keys": "、".join(lk),
              "tolerance": tol, "rows": rows, "diff": round(diff, 2)}
    return rows == 0, rows, detail


CHECKS = {
    "not_null": _check_not_null,
    "completeness": _check_completeness,
    "date_freshness": _check_date_freshness,
    "reconcile": _check_reconcile,
    "non_negative": _check_non_negative,
    "deviation": _check_deviation,
    "duplicate": _check_duplicate,
    "cross_check": _check_cross_check,
}


# ============================ 文案 ============================

def _message(cfg: Config, finding: Finding) -> str:
    """按异常类型套用配置里的解释文案，缺模板时退回通用句式。

    这里刻意把「通过」和「异常」分成两套文案。异常模板里写的是
    「…超过阈值 {threshold}%」这种结论性措辞，套到一条通过的规则上，
    审计日志里就会出现「状态 ok、详情：超过阈值 30.0%」这种自己打自己的记录 ——
    复核的人看到这种日志，第一反应是不再信任日志。
    所以通过的规则走 passed_<类型> → passed → 兜底句，只说观察到什么。
    """
    templates = cfg.rules.get("anomaly_explain", {}) or {}
    params = dict(finding.detail)
    params.update(name=finding.name, rule_id=finding.rule_id, rows=finding.rows)

    if finding.passed:
        for key in (f"passed_{finding.type}", "passed"):
            tpl = templates.get(key)
            if not tpl:
                continue
            try:
                return tpl.format(**params)
            except (KeyError, IndexError):
                continue
        return f"{finding.name}：通过（触发 0 行）"

    tpl = templates.get(finding.type)
    if tpl:
        try:
            return tpl.format(**params)
        except (KeyError, IndexError):
            pass
    fallback = templates.get("default", "触发规则 {rule_id}：{reason}")
    return fallback.format(rule_id=finding.rule_id, reason=finding.reason)


# ============================ 主入口 ============================

def run_validation(wh: Warehouse, cfg: Config, auditor=None) -> list[Finding]:
    """跑完 config/report_rules.yaml 里全部校验规则。"""
    findings: list[Finding] = []

    for rule in cfg.rules.get("validation", []) or []:
        rid = rule.get("id", "?")
        rtype = rule.get("type", "?")
        severity = rule.get("severity", "warn")
        table = rule.get("table") or rule.get("left_table") or ""
        name = rule.get("name", rid)
        reason = rule.get("reason", "")

        fn = CHECKS.get(rtype)
        if fn is None:
            f = Finding(rid, name, rtype, severity, table, False, reason,
                        {"error": f"未知规则类型 {rtype}"}, "", 0)
            f.message = _message(cfg, f)
            findings.append(f)
            if auditor:
                auditor.write("check", rid, status="error", detail=f.message)
            continue

        if table and not wh.has_table(table):
            f = Finding(rid, name, rtype, severity, table, False, reason,
                        {"error": f"表 {table} 不存在，规则未能执行"}, "", 0)
            f.message = _message(cfg, f)
            findings.append(f)
            if auditor:
                auditor.write("check", rid, status="error", detail=f.message)
            continue

        try:
            passed, rows, detail = fn(wh, cfg, rule)
        except Exception as exc:                      # noqa: BLE001 — 规则失败必须被看见
            passed, rows, detail = False, -1, {"error": f"{type(exc).__name__}: {exc}"}

        f = Finding(rid, name, rtype, severity, table, passed, reason, detail, "", rows)
        f.message = _message(cfg, f)
        findings.append(f)

        if auditor:
            auditor.write(
                "check", rid,
                status="ok" if passed else ("block" if f.is_blocker else "warn"),
                detail=f.message,
                extra={"rows": rows, "type": rtype, "severity": severity},
            )

    return findings


def rule_coverage(cfg: Config) -> dict:
    """规则覆盖率自检：每种 type 是否都有实现、severity 是否合规。"""
    problems: list[str] = []
    counter: dict[str, int] = {}
    for rule in cfg.rules.get("validation", []) or []:
        t = rule.get("type", "?")
        counter[t] = counter.get(t, 0) + 1
        if t not in CHECKS:
            problems.append(f"{rule.get('id')}: 未实现的规则类型 {t}")
        if rule.get("severity") not in ("block", "warn"):
            problems.append(f"{rule.get('id')}: severity 必须是 block 或 warn")
    return {"rules": len(cfg.rules.get("validation", []) or []),
            "by_type": counter, "problems": problems}
