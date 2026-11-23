-- ============================================================
-- 清洗层 · 会员消费
-- 客源周报的数据底座：按等级看结构与人均消费（ARPU）
-- ============================================================

CREATE OR REPLACE TABLE stg_member AS
SELECT
    TRY_CAST(NULLIF(TRIM(biz_date), '') AS DATE)                    AS biz_date,
    NULLIF(TRIM(level), '')                                         AS level,
    TRY_CAST(NULLIF(TRIM(member_count), '') AS INTEGER)             AS member_count,
    ROUND(TRY_CAST(NULLIF(TRIM(consume_amount), '') AS DOUBLE), 2)  AS consume_amount,
    NULLIF(TRIM(filename), '')                                      AS src_file
FROM raw_member_daily;
