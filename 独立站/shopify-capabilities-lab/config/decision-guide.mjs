// 首屏示例与清单共用能力 ID，避免入口和分类分开维护。
export const decisions = {
  direct: {
    title: '主题能直接做',
    description: '在主题编辑器或主题代码中实现。',
    levels: ['theme'],
    examples: [['layout', '首页排版与动效'], ['variants', '商品规格切换'], ['cart-drawer', '购物车抽屉']]
  },
  special: {
    title: '需要特殊方法',
    description: '先核对后台配置、应用、扩展或套餐。',
    levels: ['config', 'app'],
    examples: [['filters', '商品筛选'], ['reviews', '跨设备收藏'], ['checkout-extension', '结账页扩展']]
  },
  blocked: {
    title: '主题做不了',
    description: '这些做法超出主题权限，需调整方案。',
    levels: ['boundary'],
    examples: [['checkout-boundary', '重写整个结账页'], ['price-boundary', '前端直接改应付价'], ['server-boundary', '在主题里跑后端']]
  }
}

export const paths = {
  layout: '用主题设置管理风格，按设计稿编写布局和样式。',
  sections: '用可排序区块和主题设置开放编辑入口。',
  blocks: '开发可复用主题块，放进支持它的区块。',
  templates: '按页面类型创建模板，有差异的页面用替代模板。',
  navigation: '后台维护菜单，主题实现桌面与手机导航。',
  components: '复用或定制主题区块，再配置图文或媒体素材。',
  products: '用商品模板展示 Shopify 商品数据和购买入口。',
  variants: '用规格选择器切换变体，同步价格、库存状态和按钮。',
  media: '上传商品图片、视频或 3D 素材，主题负责画廊。',
  collections: '主题实现商品列表和分页，使用 Shopify 排序参数。',
  filters: '在「搜索与发现」配置价格、库存或规格等筛选项。',
  search: '用 Shopify 搜索和预测搜索接口，定制输入框与结果。',
  recommendations: '接入 Shopify 推荐结果，按需配置相关或互补商品。',
  'quick-add': '启用商品卡片快速加购，多规格商品先选择规格。',
  wishlist: '用浏览器本机存储保存收藏。跨设备同步需账户数据。',
  cart: '用购物车接口实现加购、改数量和移除。',
  'cart-drawer': 'Dawn 可选抽屉、独立页或加购通知。左右方向、居中和底部面板可改主题代码。',
  'line-properties': '用商品行属性记录刻字等输入。收费需另外定价。',
  'cart-note': '用购物车备注记录订单留言。',
  discount: '在后台配置优惠或礼品卡，主题展示结果。',
  checkout: '配置支付、配送和税费，主题从购物车跳转托管结账。',
  'checkout-extension': '使用结账界面扩展，按目标位置核对应用与套餐。',
  pickup: '配置门店地点、自提与库存，再展示可提货状态。',
  subscriptions: '用订阅应用建立销售计划，主题接入订阅选项。',
  bundles: '组合库存用组合商品方案，特殊折扣用应用或 Shopify Functions。',
  metafields: '在后台定义字段类型并填值，主题读取并展示。',
  metaobjects: '在后台定义结构并建条目，主题读取或引用。',
  'dynamic-source': '在主题编辑器把兼容的设置绑定到资源字段。',
  ajax: '调用公开接口并按需刷新区块，保留加载与失败状态。',
  'storefront-api': '按需接入店面接口，单独设计数据权限和购物车流程。',
  pages: '用页面模板和原生联系表单实现图文与留言。',
  blogs: '后台建立博客和文章，主题定制列表和阅读页面。',
  newsletter: '主题提供订阅表单，后台或应用配置营销邮件。',
  seo: '在主题输出标题、规范链接和商品结构化数据。',
  markets: '在后台启用市场、语言与币种，主题提供切换入口。',
  accounts: '后台启用客户账户，账户页新增组件用客户账户扩展。',
  reviews: '接入应用或后端存储，按账户管理评论、积分与收藏。',
  'app-blocks': '安装提供相应区块的应用，再从编辑器添加。',
  analytics: '通过客户事件配置像素，通过客户隐私配置同意策略。',
  'checkout-boundary': '保留 Shopify 托管结账，在允许的位置使用结账扩展。',
  'price-boundary': '由后台商品价格、折扣或平台定价机制计算应付价。',
  'admin-boundary': '管理密钥放在授权服务端，由后端执行后台写入。',
  'server-boundary': '把业务后端部署到应用或外部服务。',
  'routes-boundary': '保留平台资源路由，用模板、页面标识或重定向调整入口。',
  'cli-workflow': '用 Shopify CLI 开发、检查并上传未发布主题。',
  accessibility: '在主题实现键盘操作、可读状态与响应式资源。'
}
