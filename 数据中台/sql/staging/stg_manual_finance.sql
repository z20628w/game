-- ============================================================
-- 清洗层 · 人工导出财务套表
--
-- 上游系统暂时不提供接口，财务只能每周人工导出套表。
-- 这份数据不直接成表，而是作为「旁证」与 PMS 系统口径做交叉核对（CON-004）：
--   人工导出的部门不含税收入  vs  PMS 明细汇总出来的部门不含税收入
-- 两者不一致，说明其中一方漏导、口径串行或范围不同 —— 这正是过渡期最该盯的地方。
-- ============================================================

CREATE OR REPLACE TABLE stg_manual_finance AS
SELECT
    TRY_CAST(NULLIF(TRIM(biz_date), '') AS DATE)                    AS biz_date,
    NULLIF(TRIM(dept), '')                                          AS dept,
    ROUND(TRY_CAST(NULLIF(TRIM(amount_net), '') AS DOUBLE), 2)      AS amount_net,
    ROUND(TRY_CAST(NULLIF(TRIM(tax_amount), '') AS DOUBLE), 2)      AS tax_amount,
    ROUND(TRY_CAST(NULLIF(TRIM(amount_with_tax), '') AS DOUBLE), 2) AS amount_with_tax,
    NULLIF(TRIM(filename), '')                                      AS src_file
FROM raw_manual_finance;
