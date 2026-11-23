-- ============================================================
-- 清洗层 · PMS 房态
-- 用于旁证收入：房费收入应与房态推算值同量级（本仓库先落表，规则按需再加）
-- ============================================================

CREATE OR REPLACE TABLE stg_pms_room AS
SELECT
    TRY_CAST(NULLIF(TRIM(biz_date), '') AS DATE)                    AS biz_date,
    NULLIF(TRIM(room_type), '')                                     AS room_type,
    TRY_CAST(NULLIF(TRIM(total_rooms), '') AS INTEGER)              AS total_rooms,
    TRY_CAST(NULLIF(TRIM(sold_rooms), '') AS INTEGER)               AS sold_rooms,
    ROUND(TRY_CAST(NULLIF(TRIM(room_revenue), '') AS DOUBLE), 2)    AS room_revenue,
    ROUND(TRY_CAST(NULLIF(TRIM(sold_rooms), '') AS DOUBLE)
          / NULLIF(TRY_CAST(NULLIF(TRIM(total_rooms), '') AS DOUBLE), 0) * 100, 2)
                                                                    AS occupancy_pct,
    NULLIF(TRIM(filename), '')                                      AS src_file
FROM raw_pms_room;
