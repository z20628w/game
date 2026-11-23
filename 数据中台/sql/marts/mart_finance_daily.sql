-- ============================================================
-- 报表层 · 财务日报（3 张交付表 + 1 张校验基表）
--
-- 口径（简报 P1）：去掉税后汇总成 3 张表；财务口径一律用「不含税收入」，
-- 税额单列，不做价税分离以外的调整。所以这里所有收入列都取 amount_net。
--
-- ① mart_finance_daily —— 校验基表，(业务日期, 部门) 粒度
--    它不是交付物，而是规则的落脚点：UNQ-001 查主键重复、DEV-001 查环比偏离
--    都必须有一张粒度确定的表才说得清。所以先建它，再从上面对外聚合。
-- ============================================================

CREATE OR REPLACE TABLE mart_finance_daily AS
SELECT
    biz_date,
    dept,
    ROUND(SUM(amount_net), 2)       AS revenue_net,
    ROUND(SUM(tax_amount), 2)       AS tax_amount,
    ROUND(SUM(amount_with_tax), 2)  AS revenue_with_tax,
    COUNT(*)                        AS item_count
FROM stg_pms_revenue
GROUP BY ALL
ORDER BY biz_date, dept;

-- ② 交付表之一 · 收入汇总表：按天看全酒店收入
CREATE OR REPLACE TABLE mart_finance_revenue AS
SELECT
    biz_date,
    ROUND(SUM(revenue_net), 2)       AS revenue_net,
    ROUND(SUM(tax_amount), 2)        AS tax_amount,
    ROUND(SUM(revenue_with_tax), 2)  AS revenue_with_tax,
    SUM(item_count)                  AS item_count
FROM mart_finance_daily
GROUP BY ALL
ORDER BY biz_date DESC;

-- ③ 交付表之二 · 税额明细表：按天 + 部门看税额构成与税负率
CREATE OR REPLACE TABLE mart_finance_tax AS
SELECT
    biz_date,
    dept,
    ROUND(revenue_net, 2)                                        AS revenue_net,
    ROUND(tax_amount, 2)                                         AS tax_amount,
    ROUND(CASE WHEN revenue_net = 0 THEN NULL
               ELSE tax_amount / revenue_net * 100 END, 2)       AS tax_rate_pct
FROM mart_finance_daily
ORDER BY biz_date DESC, dept;

-- ④ 交付表之三 · 部门收入表：期间累计，看部门贡献
CREATE OR REPLACE TABLE mart_finance_dept AS
SELECT
    dept,
    ROUND(SUM(revenue_net), 2)       AS revenue_net,
    ROUND(SUM(tax_amount), 2)        AS tax_amount,
    ROUND(SUM(revenue_with_tax), 2)  AS revenue_with_tax,
    MIN(biz_date)                    AS period_start,
    MAX(biz_date)                    AS period_end
FROM mart_finance_daily
GROUP BY ALL
ORDER BY revenue_net DESC;
