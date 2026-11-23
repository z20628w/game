import { writeFile } from 'node:fs/promises'
import { graphql, config, runCli } from './store-api.mjs'

const data = await graphql(`query {
  products(first: 20, query: "tag:shopify-capabilities-lab-v1") { nodes {
    id title handle status onlineStoreUrl
    resourcePublicationsV2(first: 20) { nodes { isPublished publication { name } } }
    variants(first: 20) { nodes { id title price inventoryPolicy inventoryQuantity } }
    media(first: 10) { nodes { id alt status } }
    metafields(first: 10, namespace: "lab_demo") { nodes { key type value } }
  } }
  collections(first: 5, query: "handle:lab-demo-collection") { nodes { id title handle productsCount { count } } }
  pages(first: 50, query: "handle:lab-demo-contact OR handle:lab-demo-about") { nodes { id title handle isPublished } }
  metaobjectByHandle(handle: {type: "lab_demo_guide", handle: "lab-demo-care"}) { id type handle fields { key value } capabilities { publishable { status } } }
}`)
const { themes } = await runCli(['theme', 'list', '--store', config.store, '--json', '--no-input'])
const products = data.products.nodes
const issues = []
if (products.length !== 4) issues.push(`演示商品数量为 ${products.length}，预期 4`)
if (products.reduce((sum, product) => sum + product.variants.nodes.length, 0) !== 8) issues.push('变体数量与预期 8 不符')
for (const product of products) {
  if (product.status !== 'ACTIVE' || !product.resourcePublicationsV2.nodes.some(item => item.isPublished && ['在线商店', 'Online Store'].includes(item.publication.name))) issues.push(`${product.handle} 未发布到在线商店`)
  if (!product.media.nodes.some(media => media.status === 'READY')) issues.push(`${product.handle} 图片未 READY`)
  if (product.metafields.nodes.length < 3) issues.push(`${product.handle} 缺少自定义字段`)
}
const soldOut = products.find(product => product.handle === 'lab-demo-notebook')
if (!soldOut?.variants.nodes.every(variant => variant.inventoryPolicy === 'DENY' && variant.inventoryQuantity === 0)) issues.push('售罄商品库存策略不匹配')
if (data.metaobjectByHandle?.capabilities.publishable.status !== 'ACTIVE') issues.push('保养指南不是 Active')
if (!data.collections.nodes.some(collection => collection.handle === 'lab-demo-collection' && collection.productsCount.count === 4)) issues.push('演示集合不完整')
if (!['lab-demo-contact', 'lab-demo-about'].every(handle => data.pages.nodes.some(page => page.handle === handle && page.isPublished))) issues.push('演示页面不完整')
const report = { checkedAt: new Date().toISOString(), store: config.store, themes, issues, data }
await writeFile('reports/store-verification.json', JSON.stringify(report, null, 2))
console.log(JSON.stringify({ checkedAt: report.checkedAt, productCount: products.length, variants: products.reduce((sum, item) => sum + item.variants.nodes.length, 0), themes, issues }, null, 2))
if (issues.length) process.exitCode = 1
