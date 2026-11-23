-- ============================================================
-- 清洗层 · 渠道（OTA + 新媒体）
--
-- 这里兑现简报里那句「平台间字段口径不一致，导入前需先套表统一列名」：
-- OTA 关心佣金 / 结算金额，新媒体关心投放费用 / 线索数，
-- 统一成一张宽表，用 source_key 区分来源，各自用不到的列补 0 而不是留空 ——
-- 补 0 是为了让 SUM() 不用到处 COALESCE。
--
-- 注意：因为补了 0，佣金 / 结算这两列的勾稽规则必须限定 source_key='ota'，
-- 否则新媒体行会被「0 = 房费 + 佣金」这种伪命题误判（见 report_rules.yaml CON-002/003）。
-- ============================================================

CREATE OR REPLACE TABLE stg_channel AS
SELECT
    TRY_CAST(NULLIF(TRIM(biz_date), '') AS DATE)                    AS biz_date,
    NULLIF(TRIM(source_key), '')                                    AS source_key,
    NULLIF(TRIM(channel), '')                                       AS channel,
    COALESCE(TRY_CAST(NULLIF(TRIM(orders), '') AS INTEGER), 0)        AS orders,
    COALESCE(TRY_CAST(NULLIF(TRIM(room_nights), '') AS INTEGER), 0)   AS room_nights,
    COALESCE(ROUND(TRY_CAST(NULLIF(TRIM(room_revenue), '') AS DOUBLE), 2), 0)  AS room_revenue,
    COALESCE(ROUND(TRY_CAST(NULLIF(TRIM(commission), '') AS DOUBLE), 2), 0)    AS commission,
    COALESCE(ROUND(TRY_CAST(NULLIF(TRIM(settle_amount), '') AS DOUBLE), 2), 0) AS settle_amount,
    COALESCE(ROUND(TRY_CAST(NULLIF(TRIM(media_spend), '') AS DOUBLE), 2), 0)   AS media_spend,
    COALESCE(TRY_CAST(NULLIF(TRIM(leads), '') AS INTEGER), 0)         AS leads,
    NULLIF(TRIM(filename), '')                                      AS src_file
FROM raw_channel_daily;
