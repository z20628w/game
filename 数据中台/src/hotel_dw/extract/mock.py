"""抽取层 · 模拟上游数据生成器。

为什么需要这个模块？
    简报里的数据源（WedaSys PMS / 会员、OTA 后台、新媒体后台）全部在内网或第三方平台，
    本项目不可能直连。如果只写「连接 PMS」的代码，这份工程就是不能跑的骨架。
    所以这里造一层可重复生成的模拟原始数据，让整条链路真实跑起来：

        模拟上游 → data/raw → 抽取 → 清洗 → 落湖 → 成表 → 校验 → 复核 → 交付

它扮演的是「上游系统」而不是「中台加工」，所以它写 data/raw 是合法的：
中台自己不许回写原始层（db.guard_raw 守着），但上游本来就在生产原始数据。

数据不是随便造的，必须自己先满足报表口径里的勾稽关系，否则一跑就被规则拦住：
    含税 = 不含税 + 税额            （CON-001）
    结算金额 + 佣金 = 房费           （CON-003）
    人工导出部门口径 = PMS 系统口径   （CON-004）
做法是全程用「分」为单位的整数累加，最后才转成两位小数的字符串，从根上避免浮点误差。

--anomalies 开关会故意种几处典型问题（缺失 / 不平 / 负数 / 偏离），
用来演示「异常必须复核」这条落地原则是怎么被触发的。

文件清理策略（很重要）：
    按日期命名的导出文件如果不清理，换一个时间窗重跑时，旧日期文件仍会被 raw_* 视图的
    glob 读进来 —— 那正是简报里最怕的「旧数据静默混入」。
    但也不能「先全删再重写」：那样每次要动上百个文件，一旦中途出错原始层就被清空了。
    所以做法是：先按窗口全部覆盖重写，写完之后只删「本次窗口之外」的旧文件。
    稳态重跑删除量为 0；窗口整体平移一天时删除量才是 5。
"""

from __future__ import annotations

import csv
import random
from datetime import date, datetime, timedelta
from pathlib import Path

from ..config import Config

# ---------------- 业务画像（江门酒店量级，商务型） ----------------

# 部门 → [(科目, 税率, 日均基数/元)]
DEPT_ITEMS: dict[str, list[tuple[str, float, float]]] = {
    "客房": [("房费收入", 0.06, 12600.0), ("加床收入", 0.06, 420.0)],
    "餐饮": [("中餐收入", 0.06, 6100.0), ("西餐收入", 0.06, 3900.0), ("酒水收入", 0.06, 1500.0)],
    "会议": [("会议场地", 0.06, 4600.0), ("会议餐饮", 0.06, 2600.0)],
    "其他": [("洗衣服务", 0.13, 620.0), ("商品销售", 0.13, 940.0)],
}

# (房型, 可供房, 平均出租率, 均价/元)
ROOM_TYPES = [
    ("大床房", 60, 0.72, 418.0),
    ("双床房", 50, 0.68, 452.0),
    ("套房", 12, 0.55, 886.0),
]

# (会员等级, 占比, 人均消费/元)
MEMBER_LEVELS = [
    ("黑金", 0.06, 1860.0),
    ("金卡", 0.18, 760.0),
    ("银卡", 0.31, 420.0),
    ("普通", 0.45, 180.0),
]

# (渠道, 份额, 佣金率)
OTA_CHANNELS = [("携程", 0.62, 0.14), ("booking", 0.26, 0.16), ("trip", 0.12, 0.18)]

# (渠道, 份额, 日均投放/元, 每单线索数)
NM_CHANNELS = [("抖音", 0.45, 900.0, 1.65), ("小红书", 0.22, 620.0, 1.05), ("美团", 0.33, 760.0, 1.45)]

# 各来源每日导出文件名：<业务>_<YYYYMMDD>.csv（见 data_sources.yaml import_conventions.naming）
FILE_PREFIX = {
    "pms_revenue": ("pms", "revenue"),
    "pms_room": ("pms", "room"),
    "member_daily": ("member", "member"),
    "channel_daily": ("manual", "channel"),
    "manual_finance": ("manual", "finance"),
}

RAW_HEADERS = {
    "pms_revenue": ["biz_date", "dept", "item", "amount_with_tax", "amount_net", "tax_amount"],
    "pms_room": ["biz_date", "room_type", "total_rooms", "sold_rooms", "room_revenue"],
    "member_daily": ["biz_date", "level", "member_count", "consume_amount"],
    "channel_daily": ["biz_date", "source_key", "channel", "orders", "room_nights",
                      "room_revenue", "commission", "settle_amount", "media_spend", "leads"],
    "manual_finance": ["biz_date", "dept", "amount_net", "tax_amount", "amount_with_tax"],
}


# ---------------- 工具 ----------------

def _yuan(cents: int) -> str:
    """分 → 两位小数字符串。全程用整数累加，避免浮点误差污染勾稽关系。"""
    sign = "-" if cents < 0 else ""
    c = abs(cents)
    return f"{sign}{c // 100}.{c % 100:02d}"


def _split_cents(net_yuan: float, rate: float) -> tuple[int, int, int]:
    """把一个不含税金额拆成分、税、含税三种整数（分）。保证 含税 = 不含税 + 税额。"""
    net_c = int(round(net_yuan * 100))
    tax_c = int(round(net_c * rate))
    return net_c, tax_c, net_c + tax_c


def _daterange(start: date, end: date):
    d = start
    while d <= end:
        yield d
        d += timedelta(days=1)


def _day_factor(d: date, rng: random.Random) -> float:
    """当天生意系数。商务酒店周末略低，波动控制在 ±4%，
    保证环比远小于 settings.run.deviation_pct(30%)，默认数据不会误报偏离。"""
    weekend = 0.90 if d.weekday() >= 5 else 1.0
    return weekend * rng.uniform(0.96, 1.04)


def _write_csv(path: Path, header: list[str], rows: list[list]) -> None:
    """原始层导出文件：UTF-8 无 BOM（给机器读）。
    BOM 只加在交付给 Excel 的报表上（见 db.Warehouse.to_csv）。"""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(header)
        w.writerows(rows)


def _remove_stale(raw_dir: Path, start: date, end: date) -> int:
    """删掉「本次窗口之外」的旧导出文件。

    只认本模块自己的命名模式（<业务>_<YYYYMMDD>.csv）；日期解析不出来的文件一律不碰，
    避免误删别人手工放进来的原始数据。
    """
    removed = 0
    for sub, prefix in FILE_PREFIX.values():
        for f in (raw_dir / sub).glob(f"{prefix}_*.csv"):
            try:
                d = datetime.strptime(f.stem.rsplit("_", 1)[-1], "%Y%m%d").date()
            except (ValueError, IndexError):
                continue
            if not (start <= d <= end):
                f.unlink()
                removed += 1
    return removed


# ---------------- 主入口 ----------------

def generate_mock(
    cfg: Config,
    *,
    as_of: date | None = None,
    days: int | None = None,
    anomalies: bool = False,
    seed: int = 20260921,
) -> dict:
    """生成模拟原始数据，返回一份清单（写在哪、写了多少行）。

    as_of 默认取今天 —— 因为 CMP-004「数据日期需与出报日期一致」会检查时效性，
    数据必须是新鲜的，否则会被当作「静默失败」直接拦下。

    days 默认取 settings.run.mock_days（28 天）：周报只出「完整周」，
    至少跨 3 个自然周才凑得出 2 个完整周，环比规则才有得比。
    """
    rng = random.Random(seed)
    as_of = as_of or date.today()
    if days is None:
        days = int((cfg.settings.get("run") or {}).get("mock_days", 28))
    start = as_of - timedelta(days=days - 1)
    raw_dir = cfg.path("raw")

    all_days = list(_daterange(start, as_of))
    factors = {d: _day_factor(d, rng) for d in all_days}
    last_day = all_days[-1]

    if anomalies:
        # DEV-001：最后一天生意暴涨 90%，超过 30% 偏离阈值 → warn
        factors[last_day] *= 1.90

    counts: dict[str, int] = {k: 0 for k in RAW_HEADERS}
    files: list[str] = []

    for d in all_days:
        f = factors[d]
        stamp = d.strftime("%Y%m%d")
        is_anomaly_day = anomalies and d == last_day

        # ---------- ① PMS 收入明细 + 人工导出财务套表（两者同源，便于 CON-004 交叉核对） ----------
        rev_rows: list[list] = []
        dept_totals: dict[str, list[int]] = {}
        for dept, items in DEPT_ITEMS.items():
            for item, rate, base in items:
                net_c, tax_c, with_c = _split_cents(base * f * rng.uniform(0.92, 1.08), rate)
                out_item = item

                if is_anomaly_day:
                    if dept == "会议" and item == "会议餐饮":
                        with_c += 50000                      # CON-001：含税收入凭空多 500 元
                    elif dept == "其他" and item == "洗衣服务":
                        net_c = -60000
                        tax_c = int(round(net_c * rate))
                        with_c = net_c + tax_c               # RNG-001：科目出现负数
                    elif dept == "其他" and item == "商品销售":
                        out_item = ""                        # CMP-001：科目缺失

                rev_rows.append([d.isoformat(), dept, out_item,
                                 _yuan(with_c), _yuan(net_c), _yuan(tax_c)])
                agg = dept_totals.setdefault(dept, [0, 0, 0])
                agg[0] += net_c
                agg[1] += tax_c
                agg[2] += with_c

        p = raw_dir / "pms" / f"revenue_{stamp}.csv"
        _write_csv(p, RAW_HEADERS["pms_revenue"], rev_rows)
        counts["pms_revenue"] += len(rev_rows)
        files.append(str(p))

        fin_rows = [[d.isoformat(), dept, _yuan(v[0]), _yuan(v[1]), _yuan(v[2])]
                    for dept, v in dept_totals.items()]
        p = raw_dir / "manual" / f"finance_{stamp}.csv"
        _write_csv(p, RAW_HEADERS["manual_finance"], fin_rows)
        counts["manual_finance"] += len(fin_rows)
        files.append(str(p))

        # ---------- ② PMS 房态 ----------
        room_rows = []
        for rt, total, occ, price in ROOM_TYPES:
            sold = int(round(total * occ * f * rng.uniform(0.95, 1.05)))
            sold = max(0, min(sold, total))
            room_rows.append([d.isoformat(), rt, total, sold, _yuan(round(sold * price * 100))])
        p = raw_dir / "pms" / f"room_{stamp}.csv"
        _write_csv(p, RAW_HEADERS["pms_room"], room_rows)
        counts["pms_room"] += len(room_rows)
        files.append(str(p))

        # ---------- ③ 会员消费 ----------
        mem_rows = []
        for level, share, avg in MEMBER_LEVELS:
            cnt = int(round(4200 * share * f * rng.uniform(0.97, 1.03)))
            amount_c = int(round(cnt * avg * 100 * rng.uniform(0.85, 1.15)))
            mem_rows.append([d.isoformat(), level, cnt, _yuan(amount_c)])
        p = raw_dir / "member" / f"member_{stamp}.csv"
        _write_csv(p, RAW_HEADERS["member_daily"], mem_rows)
        counts["member_daily"] += len(mem_rows)
        files.append(str(p))

        # ---------- ④ 渠道（OTA + 新媒体同表，用 source_key 区分） ----------
        ch_rows = []
        ota_orders = int(round(120 * f))
        for ch, share, rate in OTA_CHANNELS:
            orders = max(1, int(round(ota_orders * share * rng.uniform(0.95, 1.05))))
            nights = int(round(orders * rng.uniform(1.5, 1.9)))
            rev_c = int(round(orders * 430 * 100 * rng.uniform(0.90, 1.10)))
            comm_c = int(round(rev_c * rate))
            settle_c = rev_c - comm_c                      # 保证 结算 + 佣金 = 房费
            ch_rows.append([d.isoformat(), "ota", ch, orders, nights,
                            _yuan(rev_c), _yuan(comm_c), _yuan(settle_c), "0.00", 0])

        nm_orders = int(round(70 * f))
        for ch, share, spend, leads_per_order in NM_CHANNELS:
            orders = max(1, int(round(nm_orders * share * rng.uniform(0.90, 1.10))))
            nights = int(round(orders * rng.uniform(1.3, 1.7)))
            rev_c = int(round(orders * 400 * 100 * rng.uniform(0.90, 1.10)))
            spend_c = int(round(spend * f * 100 * rng.uniform(0.85, 1.15)))
            leads = int(round(orders * leads_per_order))
            ch_rows.append([d.isoformat(), "new_media", ch, orders, nights,
                            _yuan(rev_c), "0.00", "0.00", _yuan(spend_c), leads])

        p = raw_dir / "manual" / f"channel_{stamp}.csv"
        _write_csv(p, RAW_HEADERS["channel_daily"], ch_rows)
        counts["channel_daily"] += len(ch_rows)
        files.append(str(p))

    # 全部写完之后才清理旧窗口外的文件 —— 万一半路失败，原始层也不会被清空
    cleared = _remove_stale(raw_dir, start, as_of)

    return {
        "as_of": as_of.isoformat(),
        "from": start.isoformat(),
        "days": days,
        "anomalies": anomalies,
        "cleared": cleared,
        "files": len(files),
        "rows": counts,
        "raw_dir": str(raw_dir),
    }
