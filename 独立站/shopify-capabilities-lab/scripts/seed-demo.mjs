import { writeFile } from 'node:fs/promises'
import { graphql, config, root } from './store-api.mjs'
import path from 'node:path'

const mark = 'shopify-capabilities-lab-v1'
// 每个商品写入后保存资源 ID，便于中途失败时定位已创建内容。
const records = { store: config.store, createdAt: new Date().toISOString(), products: [], pages: [] }
async function save() {
  await writeFile(path.join(root, 'reports/demo-data.json'), JSON.stringify(records, null, 2))
}
async function publish(id, publicationId) {
  await graphql(`mutation($id: ID!, $input: [PublicationInput!]!) {
    publishablePublish(id: $id, input: $input) { userErrors { field message } }
  }`, { id, input: [{ publicationId }] }, true)
}

const context = await graphql(`query {
  publications(first: 30) { nodes { id name } }
  metaobjectDefinitionByType(type: "lab_demo_guide") { id type }
  metafieldDefinitions(first: 100, ownerType: PRODUCT, namespace: "lab_demo") { nodes { id key type { name } } }
}`)
const publication = context.publications.nodes.find(item => ['Online Store', '在线商店'].includes(item.name))
if (!publication) throw new Error('未找到在线商店发布渠道，停止创建数据')
let definition = context.metaobjectDefinitionByType
if (!definition) {
  const result = await graphql(`mutation($definition: MetaobjectDefinitionCreateInput!) {
    metaobjectDefinitionCreate(definition: $definition) { metaobjectDefinition { id type } userErrors { field message } }
  }`, { definition: {
    name: '演示 · 保养指南', type: 'lab_demo_guide', displayNameKey: 'title',
    access: { storefront: 'PUBLIC_READ' }, capabilities: { publishable: { enabled: true } },
    fieldDefinitions: [
      { name: '标题', key: 'title', type: 'single_line_text_field', required: true },
      { name: '正文', key: 'body', type: 'multi_line_text_field' },
      { name: '适用材料', key: 'material', type: 'single_line_text_field' }
    ]
  } }, true)
  definition = result.metaobjectDefinitionCreate.metaobjectDefinition
}
records.metaobjectDefinition = definition
// 商品上的指南字段限定可引用的元对象类型，条目正文集中维护。
const definitions = [
  { key: 'material', name: '演示 · 材质', type: 'single_line_text_field' },
  { key: 'features', name: '演示 · 特点', type: 'list.single_line_text_field' },
  { key: 'guide', name: '演示 · 保养指南', type: 'metaobject_reference', validations: [{ name: 'metaobject_definition_id', value: definition.id }] }
]
for (const item of definitions) {
  const existing = context.metafieldDefinitions.nodes.find(field => field.key === item.key)
  if (existing && existing.type.name !== item.type) throw new Error(`已有 lab_demo.${item.key} 的类型不匹配`)
  if (!existing) await graphql(`mutation($definition: MetafieldDefinitionInput!) {
    metafieldDefinitionCreate(definition: $definition) { createdDefinition { id } userErrors { field message } }
  }`, { definition: { ...item, namespace: 'lab_demo', ownerType: 'PRODUCT', access: { storefront: 'PUBLIC_READ' } } }, true)
}
let guide = (await graphql(`query { metaobjectByHandle(handle: {type: "lab_demo_guide", handle: "lab-demo-care"}) { id handle } }`)).metaobjectByHandle
if (!guide) {
  guide = (await graphql(`mutation($metaobject: MetaobjectCreateInput!) {
    metaobjectCreate(metaobject: $metaobject) { metaobject { id handle } userErrors { field message } }
  }`, { metaobject: { type: 'lab_demo_guide', handle: 'lab-demo-care', capabilities: { publishable: { status: 'ACTIVE' } }, fields: [
    { key: 'title', value: '演示 · 日常保养指南' },
    { key: 'body', value: '使用温水和柔软的布清洁。避免长时间暴晒。\n这是一条存储在 Shopify 后台的演示元对象，可被多个商品引用。' },
    { key: 'material', value: '陶瓷、织物与金属（演示）' }
  ] } }, true)).metaobjectCreate.metaobject
}
records.metaobject = guide
const demos = [
  { handle: 'lab-demo-cup', title: '演示 · 弧线陶瓷杯', material: '釉面陶瓷', type: '杯具', price: '29.00', compare: '39.00', options: ['雾白', '苔绿', '墨黑'] },
  { handle: 'lab-demo-bag', title: '演示 · 日常帆布包', material: '棉帆布', type: '包袋', price: '49.00', compare: null, options: ['原色', '炭灰'] },
  { handle: 'lab-demo-lamp', title: '演示 · 阅读台灯', material: '铝合金', type: '灯具', price: '89.00', compare: '109.00', options: ['暖白', '曜黑'] },
  { handle: 'lab-demo-notebook', title: '演示 · 灵感笔记本（售罄）', material: '再生纸', type: '文具', price: '15.00', compare: null, options: ['薄荷绿'], soldOut: true }
]
for (const item of demos) {
  console.log(`检查 ${item.title}`)
  let product = (await graphql(`query($query: String!) { products(first: 2, query: $query) { nodes { id handle title tags variants(first: 20) { nodes { id title } } } } }`, { query: `handle:${item.handle}` })).products.nodes.find(p => p.handle === item.handle)
  if (product) {
    // 同名 handle 可能属于正式商品，更新前核对演示标签。
    if (!product.tags.includes(mark)) throw new Error(`同名 handle ${item.handle} 不属于本项目，停止以免覆盖`)
  }
  if (!product) product = (await graphql(`mutation($product: ProductCreateInput!) {
    productCreate(product: $product) { product { id handle title tags variants(first: 20) { nodes { id title } } } userErrors { field message } }
  }`, { product: {
    title: item.title, handle: item.handle, status: 'ACTIVE', vendor: '演示 · 能力实验室', productType: item.type,
    tags: ['演示', mark], descriptionHtml: `<p>用于体验 Shopify 主题的${item.type}演示商品，请勿用于真实交易。</p><p>可测试规格切换、价格、购物车、自定义字段和保养指南。</p>`,
    productOptions: [{ name: '颜色', values: item.options.map(name => ({ name })) }],
    metafields: [
      { namespace: 'lab_demo', key: 'material', type: 'single_line_text_field', value: item.material },
      { namespace: 'lab_demo', key: 'features', type: 'list.single_line_text_field', value: JSON.stringify(['演示数据', '多规格体验', '后台托管']) },
      { namespace: 'lab_demo', key: 'guide', type: 'metaobject_reference', value: guide.id }
    ]
  } }, true)).productCreate.product
  records.products.push(product)
  await save()
  // 商品创建时已有首个变体，先更新其价格和库存策略，再补缺少的规格。
  await graphql(`mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) { productVariants { id } userErrors { field message } }
  }`, { productId: product.id, variants: [{ id: product.variants.nodes[0].id, price: item.price, compareAtPrice: item.compare, inventoryPolicy: item.soldOut ? 'DENY' : 'CONTINUE', inventoryItem: { tracked: !!item.soldOut } }] }, true)
  const missingOptions = item.options.slice(1).filter(name => !product.variants.nodes.some(variant => variant.title === name))
  if (missingOptions.length) await graphql(`mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkCreate(productId: $productId, variants: $variants) { productVariants { id } userErrors { field message } }
  }`, { productId: product.id, variants: missingOptions.map(name => ({ optionValues: [{ optionName: '颜色', name }], price: (Number(item.price) + Math.max(0, item.options.indexOf(name) - 1) * 3).toFixed(2), compareAtPrice: item.compare, inventoryPolicy: 'CONTINUE', inventoryItem: { tracked: false } })) }, true)
  // 发布到在线商店后，Liquid 与店面商品接口才可读取演示商品。
  await publish(product.id, publication.id)
}
let collection = (await graphql(`query { collections(first: 5, query: "handle:lab-demo-collection") { nodes { id handle } } }`)).collections.nodes.find(item => item.handle === 'lab-demo-collection')
if (!collection) collection = (await graphql(`mutation($input: CollectionInput!) {
  collectionCreate(input: $input) { collection { id handle } userErrors { field message } }
}`, { input: { title: '演示 · 商品体验集合', handle: 'lab-demo-collection', descriptionHtml: '<p>演示 Shopify 商品浏览、筛选、排序与购物车。</p>', products: records.products.map(item => item.id) } }, true)).collectionCreate.collection
await publish(collection.id, publication.id)
records.collection = collection
for (const item of [
  { handle: 'lab-demo-contact', title: '演示 · 联系表单', templateSuffix: 'contact', body: '<p>这是 Shopify 原生联系表单。提交会真实发送至店铺通知邮箱，请仅使用测试内容。</p>' },
  { handle: 'lab-demo-about', title: '演示 · 品牌内容页', templateSuffix: '', body: '<h2>内容由 Shopify 后台管理</h2><p>页面正文、商品、集合和元对象保存在店铺中。主题负责组织与展示这些数据。</p><p>这是一张带“演示”标记的测试页面。</p>' }
]) {
  let page = (await graphql(`query($query: String!) { pages(first: 5, query: $query) { nodes { id handle } } }`, { query: `handle:${item.handle}` })).pages.nodes.find(page => page.handle === item.handle)
  if (!page) page = (await graphql(`mutation($page: PageCreateInput!) {
    pageCreate(page: $page) { page { id handle } userErrors { field message } }
  }`, { page: { ...item, isPublished: true } }, true)).pageCreate.page
  records.pages.push(page)
}
await save()
console.log(`演示数据完成：${records.products.length} 个商品、1 个集合、1 条元对象、${records.pages.length} 个页面。记录位于 reports/demo-data.json`)
