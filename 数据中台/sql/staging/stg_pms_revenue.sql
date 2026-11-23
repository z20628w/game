-- ============================================================
-- 清洗层 · PMS 收入明细
--
-- 这一层只做两件事：统一列名、纠正类型。
-- 刻意「不做过滤」：如果把空科目、负数、勾稽不平的行在这里丢掉，
-- 后面的校验规则就永远发现不了问题，「异常必须复核」也就成了空话。
-- 让脏数据活到 rules 引擎面前，由规则判定它该不该拦。
--
-- 另外把 raw 层的 filename 带下来存成 src_file：
-- 任何一行都能反查到它是从哪个导出文件来的，这是留痕的起点。
-- ============================================================

CREATE OR REPLACE TABLE stg_pms_revenue AS
SELECT
    TRY_CAST(NULLIF(TRIM(biz_date), '') AS DATE)                      AS biz_date,
    NULLIF(TRIM(dept), '')                                            AS dept,
    NULLIF(TRIM(item), '')                                            AS item,
    ROUND(TRY_CAST(NULLIF(TRIM(amount_with_tax), '') AS DOUBLE), 2)   AS amount_with_tax,
    ROUND(TRY_CAST(NULLIF(TRIM(amount_net), '') AS DOUBLE), 2)        AS amount_net,
    ROUND(TRY_CAST(NULLIF(TRIM(tax_amount), '') AS DOUBLE), 2)        AS tax_amount,
    NULLIF(TRIM(filename), '')                                        AS src_file
FROM raw_pms_revenue;
