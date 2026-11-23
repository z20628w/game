# Shopify 主题能力清单

共 46 项；“主题可实现”表示实现方式，不等于所有店铺条件和交互已经验收。远端实测请看 verification.md。

## 自由布局与响应式

- 分类：页面与设计 / 主题可实现
- 能力：颜色、字体、间距、栅格与移动端布局可由主题代码控制。
- 体验：打开首页并缩放窗口；主题编辑器可调导览标题和主题颜色。
- 路径：`/`
- 实现：`layout/theme.liquid、assets/lab.css`
- [官方依据](https://shopify.dev/docs/storefronts/themes)

## 可视化区块与拖拽

- 分类：页面与设计 / 主题可实现
- 能力：JSON 模板、Section、Block 与 Section Group 可组合页面。
- 体验：进入主题编辑器，移动首页区块；编辑组件实验区。
- 路径：`/?view=lab-components`
- 实现：`sections/lab-hub.liquid、sections/lab-flex.liquid`
- [官方依据](https://shopify.dev/docs/storefronts/themes/architecture)

## 可复用主题块

- 分类：页面与设计 / 主题可实现
- 能力：主题块可在支持 @theme 的区块内复用；应用块需要已安装的应用提供。
- 体验：组件实验区展示两个复用说明块；在编辑器增删。
- 路径：`/?view=lab-components`
- 实现：`blocks/lab-note.liquid`
- [官方依据](https://shopify.dev/docs/storefronts/themes/architecture/blocks/theme-blocks)

## 不同页面使用不同模板

- 分类：页面与设计 / 主题可实现
- 能力：商品、集合、页面、搜索等有独立模板；可建立替代模板。
- 体验：本实验室用首页替代模板承载数据、接口和收藏实验。
- 路径：`/?view=lab-data`
- 实现：`templates/index.lab-*.json`
- [官方依据](https://shopify.dev/docs/storefronts/themes/architecture/templates)

## 导航与移动菜单

- 分类：页面与设计 / 需后台配置
- 能力：主题展示菜单，菜单结构在 Shopify 后台维护；实验室导览独立提供。
- 体验：体验页头菜单及手机端抽屉；后台配置店铺主菜单。
- 路径：`/`
- 实现：`sections/header.liquid、snippets/lab-nav.liquid`
- [官方依据](https://shopify.dev/docs/storefronts/themes)

## 轮播、图文、折叠与视频

- 分类：页面与设计 / 主题可实现
- 能力：Dawn 内置轮播、图文、视频、折叠内容和多列组件。
- 体验：在组件实验区体验折叠内容，在编辑器添加媒体区块。
- 路径：`/?view=lab-components`
- 实现：`sections/slideshow.liquid、video.liquid、collapsible-content.liquid`
- [官方依据](https://shopify.dev/docs/storefronts/themes)

## 商品卡片与详情

- 分类：商品与发现 / 主题可实现
- 能力：读取 Shopify 商品、媒体、价格、描述和售卖状态。
- 体验：打开演示集合，再进入商品详情。
- 路径：`/collections/lab-demo-collection`
- 实现：`sections/main-product.liquid、snippets/card-product.liquid`
- [官方依据](https://shopify.dev/docs/storefronts/themes/product-merchandising)

## 多规格、变体价格与售罄

- 分类：商品与发现 / 主题可实现
- 能力：规格选择对应真实变体，价格与可用状态由 Shopify 数据决定。
- 体验：切换陶瓷杯颜色，查看台灯与售罄笔记本。
- 路径：`/products/lab-demo-cup`
- 实现：`assets/product-info.js、snippets/product-variant-picker.liquid`
- [官方依据](https://shopify.dev/docs/storefronts/themes/product-merchandising/variants)

## 图片画廊、视频与 3D

- 分类：商品与发现 / 需后台配置
- 能力：主题提供媒体展示能力；商品后台需要相应图片、视频或 3D 文件。
- 体验：商品图片可缩放；视频与 3D 需另行上传素材后体验。
- 路径：`/products/lab-demo-cup`
- 实现：`snippets/product-media-gallery.liquid`
- [官方依据](https://shopify.dev/docs/storefronts/themes/product-merchandising/media)

## 集合、分页与排序

- 分类：商品与发现 / 主题可实现
- 能力：集合数据由后台维护，主题渲染并处理原生排序与分页。
- 体验：切换演示集合的价格排序；更多商品时体验分页。
- 路径：`/collections/lab-demo-collection`
- 实现：`sections/main-collection-product-grid.liquid`
- [官方依据](https://shopify.dev/docs/storefronts/themes)

## 商品筛选

- 分类：商品与发现 / 需后台配置
- 能力：主题渲染平台返回的 filters；筛选项需在 Search & Discovery 中配置。
- 体验：查看集合页；若没有筛选项，先配置价格、库存与颜色过滤器。
- 路径：`/collections/lab-demo-collection`
- 实现：`snippets/facets.liquid、assets/facets.js`
- [官方依据](https://shopify.dev/docs/storefronts/themes/navigation-search/filtering)

## 搜索与预测搜索

- 分类：商品与发现 / 主题可实现
- 能力：使用 Shopify 搜索索引；结果受发布状态、语言和索引时延影响。
- 体验：点击页头搜索并输入“演示”；进入完整搜索结果页。
- 路径：`/search?q=演示`
- 实现：`sections/main-search.liquid、sections/predictive-search.liquid`
- [官方依据](https://shopify.dev/docs/storefronts/themes/navigation-search/search)

## 商品推荐

- 分类：商品与发现 / 需后台配置
- 能力：推荐服务可能返回空；可通过 Search & Discovery 设置相关或互补商品。
- 体验：商品底部查看推荐；新店没有推荐结果属于正常空态。
- 路径：`/products/lab-demo-cup`
- 实现：`sections/related-products.liquid`
- [官方依据](https://shopify.dev/docs/api/ajax/reference/product-recommendations)

## 快速加购

- 分类：商品与发现 / 主题可实现
- 能力：商品列表可启用快速加购，多规格商品打开规格选择。
- 体验：首页下方演示商品区点击快速加购。
- 路径：`/#lab-products`
- 实现：`sections/featured-collection.liquid、assets/quick-add.js`
- [官方依据](https://shopify.dev/docs/storefronts/themes)

## 本机收藏与商品对比

- 分类：商品与发现 / 主题可实现
- 能力：此示例仅保存在当前浏览器；清理存储后消失，不跨设备同步。
- 体验：商品页加入收藏，打开收藏实验页比较属性。
- 路径：`/?view=lab-saved`
- 实现：`assets/lab.js、sections/lab-saved.liquid`
- [官方依据](https://shopify.dev/docs/storefronts/themes)

## 加购、改数量与移除

- 分类：购物与结账 / 主题可实现
- 能力：使用真实 Ajax Cart，最终价格和库存校验来自 Shopify。
- 体验：加入两种颜色，在购物车调整数量并删除。
- 路径：`/cart`
- 实现：`assets/product-form.js、assets/cart.js`
- [官方依据](https://shopify.dev/docs/api/ajax/reference/cart)

## 购物车形态与位置

- 分类：购物与结账 / 主题可实现
- 能力：购物车可以是独立页、左右抽屉、居中弹窗或底部面板。主题决定布局和打开方式。
- 体验：在界面设计页用同一个真实购物车切换位置，也可以进入独立购物车页。
- 路径：`/?view=lab-ui#ui-cart`
- 实现：`sections/lab-ui.liquid、snippets/cart-drawer.liquid、assets/lab.js`
- [官方依据](https://shopify.dev/docs/api/ajax/reference/cart)

## 商品行定制文字

- 分类：购物与结账 / 主题可实现
- 能力：Line item properties 可记录输入内容；文字本身不会自动加价。
- 体验：陶瓷杯输入定制文字后加购，在购物车查看属性。
- 路径：`/products/lab-demo-cup`
- 实现：`snippets/lab-product-tools.liquid`
- [官方依据](https://shopify.dev/docs/api/ajax/reference/cart)

## 订单备注

- 分类：购物与结账 / 主题可实现
- 能力：购物车 note 可提交给订单；主题中的字段不改变履约规则。
- 体验：购物车页输入备注并离开输入框，使用接口实验读取购物车验证。
- 路径：`/cart`
- 实现：`sections/main-cart-footer.liquid`
- [官方依据](https://shopify.dev/docs/api/ajax/reference/cart)

## 折扣与礼品卡

- 分类：购物与结账 / 需后台配置
- 能力：优惠由后台折扣规则和平台计算；礼品卡商品需后台启用与配置。
- 体验：先创建测试折扣，再用购物车与结账验证；本项目不创建促销规则。
- 路径：`/cart`
- 实现：`snippets/price.liquid、sections/main-cart-footer.liquid`
- [官方依据](https://help.shopify.com/en/manual/discounts)

## 进入 Shopify 结账

- 分类：购物与结账 / 需后台配置
- 能力：主题把购物车交给托管结账；支付、配送、税费需要后台配置。
- 体验：可点击结账查看；测试下单前由店铺启用测试支付并配置配送。
- 路径：`/cart`
- 实现：`sections/main-cart-footer.liquid`
- [官方依据](https://shopify.dev/docs/apps/build/checkout)

## 在结账页指定位置增加组件

- 分类：购物与结账 / 需应用或专项开发
- 能力：通过结账界面扩展在平台提供的位置增加组件。结账步骤内部分位置仅适用于 Shopify Plus。
- 体验：先确定是结账步骤、感谢页还是订单状态页，再核对扩展位置和套餐。演示店未安装结账扩展。
- 路径：`/?view=lab-boundaries`
- 实现：`结账界面扩展，需要应用工程`
- [官方依据](https://shopify.dev/docs/apps/build/checkout)

## 到店自提

- 分类：购物与结账 / 需后台配置
- 能力：主题展示平台自提信息，需要地点、库存和自提设置。
- 体验：后台配置后，商品页出现提货可用性组件。
- 路径：`/products/lab-demo-cup`
- 实现：`sections/pickup-availability.liquid`
- [官方依据](https://shopify.dev/docs/storefronts/themes)

## 订阅与销售计划

- 分类：购物与结账 / 需应用或专项开发
- 能力：Selling plans 需要订阅应用或专项应用创建；主题还要实现对应选择器。
- 体验：本项目提供边界说明，未安装订阅应用或提交订阅订单。
- 路径：`/?view=lab-boundaries`
- 实现：`能力说明，未实现订阅选择器`
- [官方依据](https://shopify.dev/docs/apps/build/purchase-options/subscriptions)

## 组合商品与复杂促销

- 分类：购物与结账 / 需应用或专项开发
- 能力：展示组合不等于共享库存或结账优惠；应评估 Bundles、Functions 或应用。
- 体验：在需求评审中区分展示组合、库存联动与价格计算。
- 路径：`/?view=lab-boundaries`
- 实现：`能力说明，需专项实现`
- [官方依据](https://shopify.dev/docs/apps/build/product-merchandising/bundles)

## Metafields 自定义字段

- 分类：自定义数据 / 需后台配置
- 能力：在已有资源上添加有类型的字段，定义与值保存在后台。
- 体验：数据实验读取商品材质和特点列表，与后台字段对照。
- 路径：`/?view=lab-data`
- 实现：`sections/lab-data.liquid`
- [官方依据](https://shopify.dev/docs/storefronts/themes/architecture/metafields)

## Metaobjects 自定义结构

- 分类：自定义数据 / 需后台配置
- 能力：先定义类型和字段，再创建条目；可被多个商品引用。
- 体验：查看真实保养指南条目、全局读取和商品引用读取。
- 路径：`/?view=lab-data`
- 实现：`sections/lab-data.liquid、scripts/seed-demo.mjs`
- [官方依据](https://shopify.dev/docs/storefronts/themes/architecture/metaobjects)

## 动态数据源

- 分类：自定义数据 / 需后台配置
- 能力：支持的主题设置可绑定类型兼容的字段，绑定能力取决于设置类型与上下文。
- 体验：主题编辑器选择商品模板，尝试为文本字段连接动态源。
- 路径：`/products/lab-demo-cup`
- 实现：`sections/main-product.liquid`
- [官方依据](https://shopify.dev/docs/storefronts/themes/architecture/settings/dynamic-sources)

## Ajax API 与区块刷新

- 分类：自定义数据 / 主题可实现
- 能力：读取公开商品、当前购物车和服务端渲染区块；不需要 Admin token。
- 体验：接口实验发起只读请求，展示脱敏后的响应摘要。
- 路径：`/?view=lab-api`
- 实现：`sections/lab-api.liquid、assets/lab.js`
- [官方依据](https://shopify.dev/docs/api/ajax)

## Storefront API 扩展

- 分类：自定义数据 / 需应用或专项开发
- 能力：复杂前台查询可按需使用；权限、版本与购物车体系需要单独设计。
- 体验：当前主题使用 Liquid 与 Ajax；未接入另一套 Storefront Cart。
- 路径：`/?view=lab-boundaries`
- 实现：`能力说明，未配置 Storefront API`
- [官方依据](https://shopify.dev/docs/api/storefront)

## 品牌页与联系表单

- 分类：内容与增长 / 主题可实现
- 能力：页面正文由后台维护；联系表单由 Shopify 接收并发送通知。
- 体验：打开演示联系页。提交会真实发送通知，不自动替你提交。
- 路径：`/pages/lab-demo-contact`
- 实现：`sections/contact-form.liquid、templates/page.contact.json`
- [官方依据](https://shopify.dev/docs/storefronts/themes)

## 博客与文章

- 分类：内容与增长 / 需后台配置
- 能力：主题包含博客与文章模板；需要后台创建博客和文章。
- 体验：本项目已带模板，尚未创建演示博客或提交文章评论。
- 路径：`/?view=lab-components`
- 实现：`templates/blog.json、templates/article.json`
- [官方依据](https://shopify.dev/docs/storefronts/themes)

## 邮件订阅表单

- 分类：内容与增长 / 需后台配置
- 能力：主题提供订阅入口；发送营销邮件、自动化等需要另行配置。
- 体验：在编辑器添加 newsletter 区块；提交会真实修改订阅状态。
- 路径：`/?view=lab-components`
- 实现：`sections/newsletter.liquid`
- [官方依据](https://shopify.dev/docs/storefronts/themes)

## SEO 与结构化数据

- 分类：内容与增长 / 主题可实现
- 能力：主题生成标题、canonical、社交元数据和商品结构化数据；不保证排名。
- 体验：查看商品页面源码的元信息和 application/ld+json。
- 路径：`/products/lab-demo-cup`
- 实现：`layout/theme.liquid、snippets/meta-tags.liquid、sections/main-product.liquid`
- [官方依据](https://shopify.dev/docs/storefronts/themes)

## 多语言、多币种与 Markets

- 分类：内容与增长 / 需后台配置
- 能力：主题有 locale 与本地化表单；可选语言、国家和价格来自店铺设置。
- 体验：在店铺启用多个市场与语言后体验页头选择器。
- 路径：`/`
- 实现：`locales/、snippets/country-localization.liquid`
- [官方依据](https://shopify.dev/docs/storefronts/themes/markets)

## 客户登录与账户中心

- 分类：账号与扩展 / 需后台配置
- 能力：新客户账户由 Shopify 托管；主题提供入口，账户 UI 扩展另用扩展机制。
- 体验：使用页头账户入口；不把旧 customer 模板当作新账户方案。
- 路径：`/account`
- 实现：`sections/header.liquid`
- [官方依据](https://shopify.dev/docs/apps/build/customer-accounts)

## 评论、积分与跨设备收藏

- 分类：账号与扩展 / 需应用或专项开发
- 能力：涉及持久数据、权限与业务规则时需要应用或后端。
- 体验：本机收藏不能替代账户收藏，演示不伪造评论和积分。
- 路径：`/?view=lab-boundaries`
- 实现：`能力说明，未安装应用`
- [官方依据](https://shopify.dev/docs/apps/build)

## 应用块与嵌入

- 分类：账号与扩展 / 需应用或专项开发
- 能力：主题预留 @app 区块；具体内容由已安装的主题应用扩展提供。
- 体验：安装应用后在主题编辑器添加应用块或开启应用嵌入。
- 路径：`/?view=lab-components`
- 实现：`sections/apps.liquid、sections/lab-flex.liquid`
- [官方依据](https://shopify.dev/docs/apps/build/online-store/theme-app-extensions)

## 分析与隐私同意

- 分类：账号与扩展 / 需后台配置
- 能力：统计像素和同意策略由 Shopify Customer events / Customer privacy 配置。
- 体验：本项目不安装第三方跟踪器；需按目标市场确定同意流程。
- 路径：`/?view=lab-boundaries`
- 实现：`能力说明，未新增像素`
- [官方依据](https://shopify.dev/docs/api/customer-privacy)

## 不能用主题重写结账页面

- 分类：平台边界 / 平台边界
- 能力：checkout.liquid 不是新项目方案。结账扩展使用专用机制，部分位置限 Plus。
- 体验：设计结账需求时先核对计划、扩展位置和 API。
- 路径：`/?view=lab-boundaries`
- 实现：`无主题实现，使用 Checkout Extensibility`
- [官方依据](https://shopify.dev/docs/apps/build/checkout)

## 不能由前端决定结算价格

- 分类：平台边界 / 平台边界
- 能力：修改 DOM、表单或 JS 价格不会改变 Shopify 最终应付金额。
- 体验：定制文字要收费时需合法定价方案，不能信任浏览器传价。
- 路径：`/?view=lab-boundaries`
- 实现：`定价规则必须由平台/应用执行`
- [官方依据](https://shopify.dev/docs/api/functions)

## 不能在主题暴露管理密钥

- 分类：平台边界 / 平台边界
- 能力：Admin API 管理凭据不得交给浏览器；写入后台要通过授权服务端。
- 体验：演示数据脚本在本机通过官方 CLI 授权运行，主题只读取公开数据。
- 路径：`/?view=lab-boundaries`
- 实现：`scripts/store-api.mjs 仅本机运行`
- [官方依据](https://shopify.dev/docs/api/admin-graphql)

## 主题不是任意后端运行环境

- 分类：平台边界 / 平台边界
- 能力：主题上传的是 Liquid、JSON 和前端资源，不能在 Shopify 主题服务器运行 Node/PHP。
- 体验：ERP、私有数据库、Webhook 与定时任务需要应用或外部服务。
- 路径：`/?view=lab-boundaries`
- 实现：`无主题服务端部署`
- [官方依据](https://shopify.dev/docs/storefronts/themes/architecture)

## 核心 URL 与平台资源模型

- 分类：平台边界 / 平台边界
- 能力：可以定制页面外观、handle 和部分跳转，但不能任意重写所有平台保留路由。
- 体验：设计信息架构时使用 products、collections、pages 等平台路由。
- 路径：`/?view=lab-boundaries`
- 实现：`模板遵循 Shopify 路由模型`
- [官方依据](https://shopify.dev/docs/storefronts/themes/architecture/templates)

## CLI 初始化、开发、检查与上传

- 分类：开发流程 / 主题可实现
- 能力：CLI 管理开发流程；功能可行性由 Shopify 产品能力和店铺条件决定。
- 体验：项目提供 dev、check、push、package 命令和远端验证记录。
- 路径：`/?view=lab-boundaries`
- 实现：`package.json、scripts/deploy.mjs`
- [官方依据](https://shopify.dev/docs/api/shopify-cli/theme)

## 无障碍与性能基础

- 分类：开发流程 / 主题可实现
- 能力：语义结构、键盘操作、焦点、图片尺寸和按需脚本需要持续验证。
- 体验：用 Tab 操作筛选和收藏，缩窄屏幕；Dawn 提供商店基础交互。
- 路径：`/`
- 实现：`assets/lab.css、assets/lab.js、Dawn 原有组件`
- [官方依据](https://shopify.dev/docs/storefronts/themes/best-practices)
