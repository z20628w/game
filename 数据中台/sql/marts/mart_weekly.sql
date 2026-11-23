-- ============================================================
-- 报表层 · 四张周报
--
-- 四个业务（客源 / 销售 / 新媒体 / 传统OTA）的周报放在同一个文件里，
-- 因为它们共用同一套时间口径：week_start = 该周周一（date_trunc('week')）。
-- 放在一起，改口径时不会漏掉其中一张。
--
-- ⚠️ 这里有一个关键决定：周报只出「完整周」。
--
-- 为什么？数据从月中开始、或者本周才跑了几天，都会形成残周。
-- 用 6 天的残周去和 7 天的完整周比环比，会算出 -85% 这种纯属噪音的"偏离"，
-- 真正的问题会被这种假报警淹掉，最后没人再信预警。
-- （本项目第一次跑通时就被这个坑咬了一口，见 docs/04-规则与口径.md）
--
-- 所以先把数据覆盖区间取出来，只有完整落在区间内的周才进周报：
--   周一 >= 最早业务日  AND  周日 <= 最晚业务日
-- 这样也天然处理了「回补历史数据」的场景 —— 不依赖 current_date，
-- 只依赖数据本身，任何时间重跑同一批数据结果都一致。
-- ============================================================

-- 数据覆盖区间（跨来源取并集，因为四张周报分别来自 stg_member 与 stg_channel）
CREATE OR REPLACE VIEW mart_week_bounds AS
SELECT min(d) AS min_date, max(d) AS max_date
FROM (
    SELECT biz_date AS d FROM stg_channel
    UNION
    SELECT biz_date AS d FROM stg_member
) t;

-- ① 客源周报：会员按等级看结构与人均消费（ARPU）
CREATE OR REPLACE TABLE mart_guest_source_weekly AS
WITH src AS (
    SELECT CAST(date_trunc('week', biz_date) AS DATE) AS week_start,
           level, member_count, consume_amount
    FROM stg_member
)
SELECT
    week_start,
    level,
    SUM(member_count)                                             AS member_count,
    ROUND(SUM(consume_amount), 2)                                 AS consume_amount,
    ROUND(SUM(consume_amount) / NULLIF(SUM(member_count), 0), 2)   AS arpu
FROM src
WHERE week_start >= (SELECT min_date FROM mart_week_bounds)
  AND week_start + 6 <= (SELECT max_date FROM mart_week_bounds)
GROUP BY ALL
ORDER BY week_start DESC, consume_amount DESC;

-- ② 销售周报：按来源（OTA / 新媒体）看销量与单均
CREATE OR REPLACE TABLE mart_sales_weekly AS
WITH src AS (
    SELECT CAST(date_trunc('week', biz_date) AS DATE) AS week_start,
           source_key, orders, room_nights, room_revenue, media_spend
    FROM stg_channel
)
SELECT
    week_start,
    source_key,
    SUM(orders)                                                    AS orders,
    SUM(room_nights)                                               AS room_nights,
    ROUND(SUM(room_revenue), 2)                                    AS room_revenue,
    ROUND(SUM(media_spend), 2)                                     AS media_spend,
    ROUND(SUM(room_revenue) / NULLIF(SUM(orders), 0), 2)           AS avg_order_value
FROM src
WHERE week_start >= (SELECT min_date FROM mart_week_bounds)
  AND week_start + 6 <= (SELECT max_date FROM mart_week_bounds)
GROUP BY ALL
ORDER BY week_start DESC, room_revenue DESC;

-- ③ 新媒体周报：分平台看投放效率（单均获客成本 = 投放费用 / 订单数）
CREATE OR REPLACE TABLE mart_media_weekly AS
WITH src AS (
    SELECT CAST(date_trunc('week', biz_date) AS DATE) AS week_start,
           channel, orders, room_nights, room_revenue, media_spend, leads
    FROM stg_channel
    WHERE source_key = 'new_media'
)
SELECT
    week_start,
    channel,
    SUM(orders)                                                    AS orders,
    SUM(room_nights)                                               AS room_nights,
    ROUND(SUM(room_revenue), 2)                                    AS room_revenue,
    ROUND(SUM(media_spend), 2)                                     AS media_spend,
    ROUND(SUM(media_spend) / NULLIF(SUM(orders), 0), 2)            AS cost_per_order,
    SUM(leads)                                                     AS leads
FROM src
WHERE week_start >= (SELECT min_date FROM mart_week_bounds)
  AND week_start + 6 <= (SELECT max_date FROM mart_week_bounds)
GROUP BY ALL
ORDER BY week_start DESC, room_revenue DESC;

-- ④ 传统 OTA 周报：分平台看间夜、佣金与结算
--    DEV-002（渠道间夜数环比偏离）盯的就是这张表
CREATE OR REPLACE TABLE mart_ota_weekly AS
WITH src AS (
    SELECT CAST(date_trunc('week', biz_date) AS DATE) AS week_start,
           channel, orders, room_nights, room_revenue, commission, settle_amount
    FROM stg_channel
    WHERE source_key = 'ota'
)
SELECT
    week_start,
    channel,
    SUM(orders)                                                    AS orders,
    SUM(room_nights)                                               AS room_nights,
    ROUND(SUM(room_revenue), 2)                                    AS room_revenue,
    ROUND(SUM(commission), 2)                                      AS commission,
    ROUND(SUM(settle_amount), 2)                                   AS settle_amount,
    ROUND(SUM(commission) / NULLIF(SUM(room_revenue), 0) * 100, 2)  AS commission_pct
FROM src
WHERE week_start >= (SELECT min_date FROM mart_week_bounds)
  AND week_start + 6 <= (SELECT max_date FROM mart_week_bounds)
GROUP BY ALL
ORDER BY week_start DESC, room_nights DESC;
