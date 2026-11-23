const { _electron } = require('playwright')
const assert = require('node:assert/strict')
const { mkdir, mkdtemp, writeFile, readFile } = require('node:fs/promises')
const { resolve, dirname, join } = require('node:path')
const { randomUUID } = require('node:crypto')
const { discoverCodex } = require('../dist/detection')

;(async () => {
  const official = await discoverCodex()
  assert.ok(official, '本机需要可只读核验的官方 Codex 安装记录')
  const old = join(dirname(dirname(dirname(official))), 'OpenAI.Codex_1.0.0.0_x64__2p2nqsd0c76g0', 'app', 'ChatGPT.exe')
  await mkdir('.test-data', { recursive: true })
  const directory = await mkdtemp(resolve('.test-data/codex-update-'))
  const profiles = [true, false].map(enabled => {
    const media = { enabled, source: 'builtin:background', fit: 'cover', opacity: 30, durationMs: 1200 }
    return { id: randomUUID(), name: 'Codex 更新测试 ' + enabled, createdAt: '', updatedAt: '', adapter: { kind: 'codex', executable: old, windowExecutable: old, args: [], title: '', pagePrefix: 'app://-/index.html', selectors: ['#root'], capability: enabled ? 'supported' : 'unavailable', evidence: [], files: [{ path: old, purpose: '主程序', action: '绑定' }] }, cold: { ...media, source: 'builtin:cold' }, warm: { ...media, source: 'builtin:eye' }, background: media }
  })
  await writeFile(join(directory, 'profiles.json'), JSON.stringify({ version: 1, profiles, assets: [] }))
  const env = { ...process.env, LAUNCHCANVAS_DATA_DIR: directory }; delete env.ELECTRON_RUN_AS_NODE
  const application = await _electron.launch({ executablePath: resolve('release', require('../package.json').version, 'win-unpacked/LaunchCanvas.exe'), env })
  try {
    const page = await application.firstWindow()
    await page.waitForSelector('.page-heading')
    const snapshot = await page.evaluate(() => window.studio.snapshot())
    assert.equal(snapshot.version, require('../package.json').version)
    for (const original of profiles) {
      const current = snapshot.database.profiles.find(profile => profile.id === original.id)
      assert.equal(current.adapter.executable, official)
      assert.equal(current.adapter.windowExecutable, official)
      assert.equal(current.adapter.capability, 'supported')
      assert.equal(current.background.enabled, original.background.enabled, '恢复支持不覆盖用户开关')
      assert.equal(current.background.source, original.background.source)
    }
    const scan = await page.evaluate(old => window.studio.scan(old), old)
    assert.equal(scan.adapter.executable, official)
    assert.equal(scan.adapter.capability, 'supported')
    const saved = JSON.parse(await readFile(join(directory, 'profiles.json'), 'utf8'))
    assert.ok(saved.profiles.every(profile => profile.adapter.executable === official))
    console.log('通过：打包版启动迁移旧 Codex 路径、恢复背景支持、保留软件组与开关、重选旧目录及持久化。未启动或退出真实 Codex。')
  } finally { await application.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
