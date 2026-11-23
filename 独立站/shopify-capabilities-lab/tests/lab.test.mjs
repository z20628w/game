import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { normalizeHandles, readSaved, writeSaved, matchesCapability, summarizeResponse, storageKey } from '../theme/assets/lab-utils.js'
import { capabilities, levels } from '../config/capabilities.mjs'

test('收藏拒绝 URL、脚本、路径与非字符串，去重并限制 6 个', () => {
  assert.deepEqual(normalizeHandles(['cup', 'cup', '../admin', 'https://evil.test', '<script>', null, 7, 'bag']), ['cup', 'bag'])
  assert.equal(normalizeHandles(Array.from({ length: 10 }, (_, i) => `demo-${i}`)).length, 6)
})
test('损坏的本地 JSON 回落为空，存储异常交给 UI 处理', () => {
  assert.deepEqual(readSaved({ getItem: () => '{invalid' }), [])
  assert.throws(() => readSaved({ getItem: () => { throw new Error('denied') } }), /denied/)
})
test('写入数据仅保存有效 handle，配额错误不会被忽略', () => {
  let saved
  writeSaved({ setItem: (key, value) => { assert.equal(key, storageKey); saved = value } }, ['cup', 'cup', '../x'])
  assert.deepEqual(JSON.parse(saved), ['cup'])
  assert.throws(() => writeSaved({ setItem: () => { throw new Error('quota') } }, ['cup']), /quota/)
})
test('能力筛选同时遵守关键词、分类和实现条件', () => {
  const card = { text: 'Metaobjects 元对象', level: 'config', category: '自定义数据' }
  assert.equal(matchesCapability(card, ' METAOBJECTS ', 'config', '自定义数据'), true)
  assert.equal(matchesCapability(card, '', 'theme', ''), false)
  assert.equal(matchesCapability(card, '支付', '', ''), false)
})
test('接口摘要不暴露购物车 token 或其他任意字段', () => {
  const summary = summarizeResponse('cart', { token: 'secret', customer: { email: 'private' }, item_count: 0, items: [], currency: 'USD' })
  assert.equal('token' in summary, false)
  assert.equal('customer' in summary, false)
  assert.equal(summary.item_count, 0)
})
test('区块错误保持 null，可识别失败而非成功空字符串', () => {
  assert.deepEqual(summarizeResponse('sections', { one: null, two: '<div>ok</div>' }), { one: null, two: { html_length: 13, html_preview: '<div>ok</div>' } })
})
test('清单的 ID 唯一，每条都有实现位置、官方来源和有效边界', () => {
  assert.equal(new Set(capabilities.map(item => item.id)).size, capabilities.length)
  for (const item of capabilities) {
    assert.ok(levels[item.level])
    assert.ok(item.implementation && item.steps)
    assert.match(item.source, /^https:\/\/(shopify\.dev|help\.shopify\.com)\//)
  }
})
test('模板只引用存在的本地 section，区块 ID 和顺序对应', async () => {
  for (const name of ['index', 'index.lab-data', 'index.lab-api', 'index.lab-components', 'index.lab-saved', 'index.lab-boundaries']) {
    const template = JSON.parse(await readFile(`theme/templates/${name}.json`, 'utf8'))
    for (const id of template.order) {
      assert.ok(template.sections[id])
      await readFile(`theme/sections/${template.sections[id].type}.liquid`, 'utf8')
    }
  }
})
