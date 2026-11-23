import { readFile } from 'node:fs/promises'
import { graphql } from './store-api.mjs'

const names = { cup: '陶瓷杯', bag: '帆布包', lamp: '阅读台灯', notebook: '灵感笔记本' }
const localize = process.argv.includes('--localize')
for (const [kind, name] of Object.entries(names)) {
  const handle = `lab-demo-${kind}`
  const product = (await graphql(`query($query: String!) {
    products(first: 2, query: $query) { nodes {
      id handle tags
      media(first: 2) { nodes { id alt } pageInfo { hasNextPage } }
      variants(first: 20) { nodes { media(first: 1) { nodes { id } } } pageInfo { hasNextPage } }
    } }
  }`, { query: `handle:${handle}` })).products.nodes.find(item => item.handle === handle)
  if (!product?.tags.includes('shopify-capabilities-lab-v1')) throw new Error(`未找到本项目演示商品 ${handle}`)
  const alt = `演示 · ${name}原创商品示意图`
  if (product.media.nodes.some(item => item.alt === alt)) { console.log(`${kind} 已有演示图片`); continue }
  const legacyAlt = `演示 · ${kind} 原创商品示意图`
  // 替换模式会重设媒体列表，只允许处理未绑定规格的单张旧版演示图。
  if (localize && (product.media.nodes.length !== 1 || product.media.nodes[0].alt !== legacyAlt
    || product.media.pageInfo.hasNextPage || product.variants.pageInfo.hasNextPage
    || product.variants.nodes.some(variant => variant.media.nodes.length))) {
    throw new Error(`${name}存在额外媒体或规格绑定，请先核对媒体后再替换`)
  }
  if (!localize && product.media.nodes.some(item => item.alt === legacyAlt)) {
    console.log(`${name}已有原版图片，使用 --localize 更新`)
    continue
  }
  const bytes = await readFile(`demo-media/${kind}.png`)
  const filename = `lab-demo-${kind}-zh.png`
  // 先把文件上传到 Shopify 指定的暂存地址，再用资源 URL 关联商品。
  const data = await graphql(`mutation($input: [StagedUploadInput!]!) {
    stagedUploadsCreate(input: $input) { stagedTargets { url resourceUrl parameters { name value } } userErrors { field message } }
  }`, { input: [{ filename, mimeType: 'image/png', resource: 'PRODUCT_IMAGE', httpMethod: 'POST', fileSize: String(bytes.length) }] }, true)
  const target = data.stagedUploadsCreate.stagedTargets[0]
  const body = new FormData()
  for (const item of target.parameters) body.append(item.name, item.value)
  body.append('file', new Blob([bytes], { type: 'image/png' }), filename)
  const response = await fetch(target.url, { method: 'POST', body, signal: AbortSignal.timeout(60000) })
  if (!response.ok) throw new Error(`媒体上传失败 HTTP ${response.status}`)
  if (localize) {
    await graphql(`mutation($identifier: ProductSetIdentifiers!, $input: ProductSetInput!) {
      productSet(identifier: $identifier, input: $input) {
        product { id }
        userErrors { field message }
      }
    }`, { identifier: { id: product.id }, input: {
      files: [{ originalSource: target.resourceUrl, contentType: 'IMAGE', filename, alt }]
    } }, true)
    console.log(`${name}已提交中文版示意图`)
    continue
  }
  await graphql(`mutation($product: ProductUpdateInput!, $media: [CreateMediaInput!]) {
    productUpdate(product: $product, media: $media) { product { id } userErrors { field message } }
  }`, { product: { id: product.id }, media: [{ originalSource: target.resourceUrl, mediaContentType: 'IMAGE', alt }] }, true)
  console.log(`${kind} 图片已提交 Shopify 处理`)
}
