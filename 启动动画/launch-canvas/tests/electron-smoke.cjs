const { _electron: electron } = require('playwright')
const assert = require('node:assert/strict')
const { mkdir, readFile, writeFile, mkdtemp } = require('node:fs/promises')
const { resolve, join } = require('node:path')
const { execFile } = require('node:child_process')
const { promisify } = require('node:util')
const run = promisify(execFile)
;(async () => {
  await mkdir('preview', { recursive: true }); await mkdir('.test-data', { recursive: true })
  const fixture = resolve('.test-data/FixtureApp.exe')
  await run(join(process.env.WINDIR, 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'), ['/nologo', '/target:winexe', '/reference:System.Windows.Forms.dll', '/reference:System.Drawing.dll', '/out:' + fixture, resolve('tests/FixtureApp.cs')], { windowsHide: true })
  const env = { ...process.env, LAUNCHCANVAS_DATA_DIR: await mkdtemp(resolve('.test-data/smoke-profile-')) }; delete env.ELECTRON_RUN_AS_NODE
  const application = await electron.launch({ executablePath: require('electron'), args: ['.'], cwd: process.cwd(), env, timeout: 30000 })
  const errors = []; let fixturePid = 0
  try {
    const page = await application.firstWindow(); page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') console.log('RENDERER:', message.text()) })
    await page.waitForSelector('.page-heading', { timeout: 20000 })
    await page.screenshot({ path: 'preview/01-manager.png' })
    const initial = await page.evaluate(() => window.studio.snapshot())
    assert(initial.database.profiles.some(profile => profile.adapter.kind === 'codex'))
    let opened = application.waitForEvent('window')
    await page.click('#preview'); let player = await opened
    await player.waitForSelector('video'); await player.waitForFunction(() => document.querySelector('video')?.readyState >= 2)
    await player.screenshot({ path: 'preview/02-warm-preview.png' }); await player.waitForEvent('close', { timeout: 10000 })
    await page.click('[data-slot="cold"]'); opened = application.waitForEvent('window'); await page.click('#preview'); player = await opened
    await player.waitForSelector('iframe'); const frame = player.frameLocator('iframe')
    await frame.locator('.window').waitFor(); await frame.locator('.window').evaluate(node => new Promise(resolve => { const timer = setInterval(() => { if (node.dataset.playing === 'true') { clearInterval(timer); resolve(true) } }, 50) }))
    await player.screenshot({ path: 'preview/03-cold-preview.png' }); const coldClosed = player.waitForEvent('close', { timeout: 15000 }); await player.evaluate(() => document.querySelector('#skip').click()).catch(error => { if (!player.isClosed()) throw error }); await coldClosed
    await page.click('[data-slot="background"]'); opened = application.waitForEvent('window'); await page.click('#preview'); player = await opened
    await player.waitForFunction(() => Number(document.querySelector('#aemeath-living-wallpaper')?.dataset.seconds) > .3)
    await player.screenshot({ path: 'preview/05-living-background.png' }); await player.waitForEvent('close', { timeout: 10000 })
    await page.locator('.add-outline').click(); await page.fill('#install-path', resolve('.test-data')); await page.click('#scan-path'); await page.waitForSelector('.scan-found')
    await page.screenshot({ path: 'preview/04-detection.png' }); await page.fill('#group-name', '测试应用 · 独立配置'); await page.click('#create-group'); await page.waitForSelector('dialog', { state: 'detached' })
    const saved = await page.evaluate(() => window.studio.snapshot()), test = saved.database.profiles.find(profile => profile.name.startsWith('测试应用'))
    assert.equal(test.adapter.capability, 'unavailable'); assert.equal(test.background.enabled, false)
    test.cold.source = 'builtin:eye'; test.cold.durationMs = 1500; test.adapter.args = [resolve('.test-data/fixture-signal')]
    await page.evaluate(profile => window.studio.save(profile), test)
    await page.reload(); await page.waitForSelector(`[data-select="${test.id}"]`); await page.click(`[data-select="${test.id}"]`)
    const beforeLaunch = Date.now(); await page.evaluate(id => window.studio.launch(id), test.id)
    const state = JSON.parse((await run(resolve('resources/native/WindowHost.exe'), ['state', fixture, ''], { windowsHide: true })).stdout)
    fixturePid = state.pid; console.log('FIXTURE STATE:', state); assert(state.found && state.visible)
    const beforeCount = application.windows().length
    await page.evaluate(id => window.studio.launch(id), test.id)
    assert.equal(application.windows().length, beforeCount, '已打开的窗口不应重播')
    await writeFile(resolve('.test-data/fixture-signal.hide'), 'hide')
    let hidden = state
    for (let i=0; i<20; i++) { hidden = JSON.parse((await run(resolve('resources/native/WindowHost.exe'), ['state', fixture, ''], { windowsHide: true })).stdout); if (!hidden.visible) break }
    assert(hidden.running && !hidden.visible, '测试程序应在后台保留进程')
    opened = application.waitForEvent('window'); const reopening = page.evaluate(id => window.studio.launch(id), test.id).then(() => null, error => error); player = await opened
    await player.waitForFunction(() => !!window.player)
    const warm = await player.evaluate(() => window.player.data()); assert.equal(warm.source, 'builtin:eye'); assert.equal(warm.durationMs, 1500)
    assert.equal(await reopening, null); const restored = JSON.parse((await run(resolve('resources/native/WindowHost.exe'), ['state', fixture, ''], { windowsHide: true })).stdout); assert(restored.visible)
    const desktop = resolve('.test-data/desktop'); await mkdir(desktop, { recursive: true }); await application.evaluate(({app}, path) => app.setPath('desktop', path), desktop)
    const shortcut = await page.evaluate(id => window.studio.shortcut(id), test.id)
    const link = await application.evaluate(({shell}, file) => shell.readShortcutLink(file), shortcut)
    assert(link.args.endsWith('--launch=' + test.id)); assert.equal(link.target.toLowerCase(), require('electron').toLowerCase())
    const report = { passed: true, checks: ['管理界面', '连续视频预览', '原开场动画预览', '人物动态背景预览', '安装目录检测', '独立配置持久化', '原生软件不误报背景支持', '通用 EXE 实际启动', '已打开窗口只置前', '后台进程恢复时播放睁眼动画', '桌面快捷方式目标与参数'], errors }
    assert.deepEqual(errors, []); await writeFile('preview/electron-smoke.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report))
  } finally {
    if (fixturePid) await run('taskkill.exe', ['/PID', String(fixturePid), '/F'], { windowsHide: true }).catch(() => {})
    await application.close()
  }
})().catch(error => { console.error(error); process.exitCode = 1 })
