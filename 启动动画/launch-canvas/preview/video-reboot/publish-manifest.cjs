/* 只有生成、拼接和人工视觉验收均完成的主题可以启用；默认要求全套齐备。 */
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const root = path.resolve(__dirname, '../..')
const themes = JSON.parse(fs.readFileSync(path.join(__dirname, 'theme-directions.json'), 'utf8').replace(/^\uFEFF/, ''))
const allowPartial = process.argv.includes('--partial')
const manifest = { version: 1, themes: {} }
const inventory = { createdAt: new Date().toISOString(), expected: themes.length, completed: [], pending: [] }
for (const theme of themes) {
  const folder = path.join(__dirname, 'generated', theme.id)
  const read = file => fs.existsSync(path.join(folder, file)) ? JSON.parse(fs.readFileSync(path.join(folder, file), 'utf8')) : null
  const assembly = read('assembly-qa.json'), visual = read('visual-review.json')
  if (!assembly?.technicalPassed || visual?.rawVisualReview !== 'pass' || visual?.finalVisualReview !== 'pass' || !visual?.verifiedRecommended) {
    inventory.pending.push(theme.id)
    continue
  }
  const item = { verified: true, handoffSeconds: assembly.handoffSeconds, coldLabel: visual.labels?.cold ?? theme.coldLabel, warmLabel: visual.labels?.warm ?? theme.warmLabel }
  const files = {}
  for (const slot of ['cold', 'warm', 'background']) {
    const file = `gallery/video/${theme.id}/${slot}.mp4`
    const absolute = path.join(root, 'resources', file), metadata = assembly.clips[slot]
    const size = fs.statSync(absolute).size
    if (size !== metadata.bytes) throw Error(`${theme.id}/${slot} 已改变，请重新验收`)
    const hash = crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex')
    if (visual.reviewedFiles?.[slot] !== hash) throw Error(`${theme.id}/${slot} 与视觉验收记录不一致，请复核最终文件`)
    item[slot] = { file, durationMs: metadata.durationMs }
    files[slot] = { ...item[slot], width: metadata.width, height: metadata.height, fps: metadata.fps, bytes: size, sha256: hash }
  }
  manifest.themes[theme.id] = item
  inventory.completed.push({ id: theme.id, name: theme.name, handoffSeconds: item.handoffSeconds, files })
}
fs.writeFileSync(path.join(__dirname, 'release-video-inventory.json'), JSON.stringify(inventory, null, 2))
if (inventory.pending.length && !allowPartial) throw Error(`尚有 ${inventory.pending.length} 套未通过完整验收，禁止发布：${inventory.pending.join(', ')}`)
fs.writeFileSync(path.join(root, 'resources/gallery/video-manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
console.log(JSON.stringify({ enabled: inventory.completed.length, pending: inventory.pending, partial: allowPartial }))
