import { readFile, writeFile } from 'node:fs/promises'
const read = async file => JSON.parse(await readFile(`theme/${file}`, 'utf8'))
const write = async (file, value) => writeFile(`theme/${file}`, `${JSON.stringify(value, null, 2)}\n`)
const template = type => ({ sections: { main: { type, settings: {} } }, order: ['main'] })

await write('templates/index.json', {
  sections: {
    main: { type: 'lab-hub', settings: {} },
    products: { type: 'featured-collection', settings: { title: '从这几件演示商品开始', collection: 'lab-demo-collection', products_to_show: 4, columns_desktop: 4, show_view_all: true, image_ratio: 'square', show_secondary_image: true, quick_add: 'standard', padding_top: 36, padding_bottom: 60 } }
  }, order: ['main', 'products']
})
for (const view of ['data', 'api', 'saved', 'boundaries']) await write(`templates/index.lab-${view}.json`, template(`lab-${view}`))
await write('templates/index.lab-components.json', {
  sections: {
    main: { type: 'lab-flex', blocks: {
      design: { type: 'lab-note', settings: { label: '01 / 设计', title: '内容与样式可分别调整', body: '<p>标题、正文、颜色和间距可以由主题设置提供。UI 高保真设计仍是开发的重要输入。</p>' } },
      product: { type: 'lab-note', settings: { label: '02 / 产品', title: '一个模块可服务多个页面', body: '<p>独立的主题块可以在不同容器复用。应用块需要安装提供该扩展的应用后才能添加。</p>' } }
    }, block_order: ['design', 'product'], settings: {} },
    faq: { type: 'collapsible-content', blocks: {
      first: { type: 'collapsible_row', settings: { heading: '可以完全控制前台布局吗？', row_content: '<p>可以通过 Liquid、CSS 和 JavaScript 自定义主题页面，同时遵循 Shopify 模板与路由规则。</p>', icon: 'none' } },
      second: { type: 'collapsible_row', settings: { heading: '这里的内容必须由开发修改吗？', row_content: '<p>接入主题设置的文字与图片可在主题编辑器修改；商品与元对象内容在后台维护。</p>', icon: 'none' } },
      third: { type: 'collapsible_row', settings: { heading: '视频、图文、轮播如何体验？', row_content: '<p>在主题编辑器中添加 Dawn 的视频、图文或幻灯片区块并选择素材。本页面不假装已配置媒体素材。</p>', icon: 'none' } }
    }, block_order: ['first', 'second', 'third'], settings: { heading: '折叠内容，也是一个可编辑区块', heading_size: 'h1', layout: 'none', color_scheme: 'scheme-1', open_first_collapsible_row: true, padding_top: 36, padding_bottom: 64 } }
  }, order: ['main', 'faq']
})
const header = await read('sections/header-group.json')
header.sections['announcement-bar'].blocks['announcement-bar-0'].settings.text = '演示环境 · 用真实操作理解 Shopify 主题能力'
await write('sections/header-group.json', header)
const data = await read('config/settings_data.json')
if (typeof data.current === 'string') data.current = structuredClone(data.presets[data.current])
Object.assign(data.current, { cart_type: 'drawer', show_cart_note: true, predictive_search_enabled: true, currency_code_enabled: true })
data.current.color_schemes['scheme-1'].settings.button = '#194f42'
data.current.color_schemes['scheme-1'].settings.text = '#172e2b'
await write('config/settings_data.json', data)
const schema = await read('config/settings_schema.json')
schema[0].theme_name = 'Capabilities Lab'
schema[0].theme_author = 'Shopify / 本地演示项目'
await write('config/settings_schema.json', schema)
let layout = await readFile('theme/layout/theme.liquid', 'utf8')
if (!layout.includes("'lab.css'")) layout = layout.replace('</head>', `  {{ 'lab.css' | asset_url | stylesheet_tag }}\n    <script type="module" src="{{ 'lab.js' | asset_url }}"></script>\n  </head>`)
if (!layout.includes("render 'lab-nav'")) layout = layout.replace("{% sections 'header-group' %}", "{% sections 'header-group' %}\n    {% render 'lab-nav' %}")
await writeFile('theme/layout/theme.liquid', layout)
let product = await readFile('theme/sections/main-product.liquid', 'utf8')
if (!product.includes("render 'lab-product-tools'")) product = product.replace("{%- when 'buy_buttons' -%}", "{%- when 'buy_buttons' -%}\n                  {% render 'lab-product-tools', product: product, product_form_id: product_form_id %}")
await writeFile('theme/sections/main-product.liquid', product)
console.log('演示主题配置完成。此脚本用于初次初始化；日常开发直接编辑 theme/，避免覆盖编辑器设置。')
