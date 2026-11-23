/**
 * 演示交互的纯工具函数，供 lab.js 与 tests/lab.test.mjs 共用。
 * 存储参数由调用方传入，便于测试损坏 JSON、禁止存储及配额错误等边界。
 */
export const storageKey = 'shopify-capabilities-lab:saved:v1'

/** 校验本机存储中的商品路径标识，并将对比数量限制为六件。 */
/* 只接受适合作为商品路径的 handle，去重并截取六项，避免旧存储生成非法链接。 */
export function normalizeHandles(value) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter(handle => typeof handle === 'string' && /^[a-z0-9][a-z0-9-]{0,150}$/.test(handle)))].slice(0, 6)
}

/* 解析 localStorage 中的 JSON，格式损坏时返回空列表。读取权限异常继续抛给组件处理。 */
export function readSaved(storage) {
  // 旧数据无法解析时按空列表处理。存储权限错误交给界面提示。
  const raw = storage.getItem(storageKey)
  if (!raw) return []
  try { return normalizeHandles(JSON.parse(raw)) } catch { return [] }
}

/* 写入前使用同样的校验规则。setItem 的配额或权限错误由界面捕获后提示。 */
export function writeSaved(storage, handles) {
  const valid = normalizeHandles(handles)
  storage.setItem(storageKey, JSON.stringify(valid))
  return valid
}

/* 关键词、实现层级和分类同时满足时保留该行，空条件表示该维度不筛选。 */
export function matchesCapability(card, query, level, category) {
  return (!query || card.text.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) &&
    (!level || card.level === level) && (!category || card.category === category)
}

/** 只提取接口演示所需字段，省略购物车令牌，并截短区块 HTML。 */
/* 仅提取页面演示使用的响应字段。购物车摘要省略 token，区块结果只显示 HTML 长度与前段预览。 */
export function summarizeResponse(kind, data) {
  if (kind === 'cart') return {
    currency: data.currency, item_count: data.item_count, total_price: data.total_price,
    money_unit: 'Shopify Ajax 金额单位；显示价格请使用主题 money 过滤器',
    items: data.items?.map(item => ({ product_title: item.product_title, variant_title: item.variant_title, quantity: item.quantity, final_line_price: item.final_line_price, properties: item.properties })),
    note: data.note
  }
  if (kind === 'product') return { title: data.title, handle: data.handle, available: data.available, price: data.price,
    variants: data.variants?.map(item => ({ id: item.id, title: item.title, available: item.available, price: item.price })) }
  if (kind === 'search') return { products: data.resources?.results?.products?.map(item => ({ title: item.title, handle: item.handle, url: item.url })) ?? [] }
  return Object.fromEntries(Object.entries(data).map(([id, html]) => [id, html === null ? null : { html_length: html.length, html_preview: html.slice(0, 700) }]))
}
