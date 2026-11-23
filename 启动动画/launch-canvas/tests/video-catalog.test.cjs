const test = require('node:test')
const assert = require('node:assert/strict')
const { parseVideoManifest, resolveVideoSource, synchronizeVideoDurations } = require('../dist/video-catalog.js')
const { galleryThemes, gallerySource, galleryThumbnail } = require('../dist/catalog.js')

function theme(id) {
  const clip = (slot, durationMs) => ({ file: `gallery/video/${id}/${slot}.mp4`, durationMs })
  return { verified: true, cold: clip('cold', 8000), warm: clip('warm', 3000), background: clip('background', 6000), handoffSeconds: .5, coldLabel: '星环回旋', warmLabel: '抬手迎接' }
}
function registry(id = 'chatgpt-anime', value = theme(id)) { return parseVideoManifest({ version: 1, themes: { [id]: value } }) }

test('只有已验收的完整三段视频进入图库，单个损坏主题不影响其余主题', () => {
  const complete = theme('chatgpt-anime')
  const partial = theme('claude-art'); delete partial.background
  const pending = theme('gemini-art'); pending.verified = false
  assert.deepEqual(Object.keys(parseVideoManifest({ version: 1, themes: { 'chatgpt-anime': complete, 'claude-art': partial, 'gemini-art': pending } })), ['chatgpt-anime'])
  assert.deepEqual(parseVideoManifest({ version: 2, themes: { 'chatgpt-anime': complete } }), {})
  assert.deepEqual(parseVideoManifest(null), {})
})

test('拒绝路径穿越、跨主题视频、过长冷启动、不合适恢复时长和越界交接点', () => {
  for (const mutate of [
    value => { value.cold.file = '../../outside.mp4' },
    value => { value.background.file = 'gallery/video/claude-art/background.mp4' },
    value => { value.warm.file = 'C:/video/warm.mp4' },
    value => { value.cold.durationMs = 10000 },
    value => { value.warm.durationMs = 1500 },
    value => { value.warm.durationMs = 5000 },
    value => { value.background.durationMs = NaN },
    value => { value.handoffSeconds = 3 },
    value => { value.handoffSeconds = -1 }
  ]) {
    const value = theme('chatgpt-anime'); mutate(value)
    assert.deepEqual(registry('chatgpt-anime', value), {})
  }
})

test('既有主题标识和原版内置标识直接映射视频，未知与未完成主题仍返回空', () => {
  const themes = { ...registry(), ...registry('silver-dragon-classic') }
  for (const [source, slot] of [['builtin:cold', 'cold'], ['builtin:eye', 'warm'], ['builtin:background', 'background']]) {
    const media = resolveVideoSource(source, themes)
    assert.equal(media.themeId, 'silver-dragon-classic'); assert.equal(media.slot, slot)
    assert.equal(media.file, `gallery/video/silver-dragon-classic/${slot}.mp4`)
  }
  assert.equal(resolveVideoSource('gallery:chatgpt-anime:warm', themes).durationMs, 3000)
  assert.equal(resolveVideoSource('gallery:silver-dragon-classic:background', themes).background.durationMs, 6000)
  for (const source of ['gallery:claude-art:cold', 'gallery:../../x:cold', 'gallery:constructor:warm', 'toString', 'asset:123']) assert.equal(resolveVideoSource(source, themes), null)
})

test('迁移只更新已升级主题的完整视频时长，保留独立配置与导入素材', () => {
  const profile = {
    id: 'existing-id', adapter: { executable: 'D:/Apps/Example.exe' },
    cold: { source: 'gallery:chatgpt-anime:cold', durationMs: 12000, enabled: false, fit: 'contain', opacity: 70 },
    warm: { source: 'builtin:eye', durationMs: 1500, enabled: true, fit: 'cover', opacity: 100 },
    background: { source: 'asset:user-image', durationMs: 0, enabled: true, fit: 'contain', opacity: 22 }
  }
  const expected = structuredClone(profile); expected.cold.durationMs = 8000; expected.warm.durationMs = 3000
  const themes = { ...registry(), ...registry('silver-dragon-classic') }
  assert.equal(synchronizeVideoDurations(profile, themes), true); assert.deepEqual(profile, expected)
  assert.equal(synchronizeVideoDurations(profile, themes), false)
  profile.warm.source = 'asset:user-video'; profile.warm.durationMs = 9200
  assert.equal(synchronizeVideoDurations(profile, themes), false); assert.equal(profile.warm.durationMs, 9200)
})

test('33套主题保留原标识，全部缩略图使用静态图片地址', () => {
  assert.equal(galleryThemes.length, 33)
  for (const item of galleryThemes) assert.match(galleryThumbnail(item), /\.(png|jpg)$/)
  const classic = galleryThemes.find(item => item.id === 'silver-dragon-classic')
  assert.equal(galleryThumbnail(classic), 'lc-media://legacy/assets/artwork.jpg')
  assert.equal(gallerySource(classic.id, 'warm'), 'builtin:eye')
})
