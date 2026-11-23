const { _electron: electron } = require('playwright')
const assert = require('node:assert/strict')
const { mkdtemp, mkdir, writeFile } = require('node:fs/promises')
const { resolve, join } = require('node:path')
const { randomUUID } = require('node:crypto')
;(async () => {
  const directory = await mkdtemp(resolve('.test-data/rebind-'))
  const folder = join(directory, 'WorkBuddy')
  await mkdir(join(folder, 'resources'), { recursive: true })
  for (const file of ['WorkBuddy.exe', 'RepairApp.exe', 'icudtl.dat', 'resources/app.asar']) await writeFile(join(folder, file), 'fixture')
  const env = { ...process.env, LAUNCHCANVAS_DATA_DIR: directory }; delete env.ELECTRON_RUN_AS_NODE
  const packaged = process.argv.includes('--packaged')
  const application = await electron.launch({ executablePath: packaged ? resolve('release', require('../package.json').version, 'win-unpacked/LaunchCanvas.exe') : require('electron'), args: packaged ? [] : ['.'], env, timeout: 30000 })
  try {
    const page = await application.firstWindow()
    await page.waitForSelector('.page-heading')
    if (process.env.WORKBUDDY_INSTALL) {
      const detected = await page.evaluate(path => window.studio.scan(path), process.env.WORKBUDDY_INSTALL)
      assert.equal(detected.adapter.kind, 'electron', JSON.stringify(detected.adapter))
      assert(detected.adapter.selectors.includes('.conversation-shell'))
    }
    const snapshot = await page.evaluate(() => window.studio.snapshot())
    const original = structuredClone(snapshot.database.profiles[0])
    original.id = randomUUID(); original.name = 'RepairApp'
    original.adapter = { kind: 'native', executable: join(folder, 'RepairApp.exe'), args: [], title: '', pagePrefix: '', selectors: ['#root'], capability: 'unavailable', evidence: [], files: [] }
    original.background.enabled = false; original.cold.durationMs = 5300; original.warm.durationMs = 1700
    await page.evaluate(profile => window.studio.save(profile), original)
    await page.reload(); await page.click(`[data-select="${original.id}"]`)
    await page.click('[data-tab="binding"]'); await page.click('#rebind')
    assert.equal(await page.inputValue('#install-path'), folder)
    await page.click('#scan-path'); await page.waitForSelector('.scan-found')
    assert.equal(await page.inputValue('#candidate-exe'), join(folder, 'WorkBuddy.exe'))
    assert.equal(await page.inputValue('#group-name'), 'WorkBuddy')
    await page.click('#create-group'); await page.waitForSelector('dialog', { state: 'detached' })
    const saved = (await page.evaluate(() => window.studio.snapshot())).database.profiles.find(profile => profile.id === original.id)
    assert.equal(saved.name, 'WorkBuddy'); assert.equal(saved.adapter.kind, 'electron')
    assert(saved.adapter.selectors.includes('.conversation-shell'))
    assert.deepEqual(saved.cold, original.cold); assert.deepEqual(saved.warm, original.warm)
    assert.deepEqual(saved.background, { ...original.background, enabled: true })
    await page.screenshot({ path: 'preview/rebind-workbuddy.png' })
    console.log(JSON.stringify({ passed: true, packaged, checks: ['修复工具旧组重新检测', '主程序与独立适配规则正确', '软件组 ID 与三份素材保留'] }))
  } finally { await application.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
