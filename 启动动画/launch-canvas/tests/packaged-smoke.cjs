const { _electron } = require('playwright')
const { resolve } = require('node:path')
const { mkdir, writeFile, readFile } = require('node:fs/promises')
const { execFile } = require('node:child_process')
const { promisify } = require('node:util')
const assert = require('node:assert/strict')
const run = promisify(execFile)
const version = require('../package.json').version
;(async () => {
  const executable = resolve('release', version, 'win-unpacked/LaunchCanvas.exe'), data = resolve('.test-data/packaged-profile'), desktop = resolve('.test-data/packaged-desktop')
  await mkdir(desktop, { recursive: true })
  const env = { ...process.env, LAUNCHCANVAS_DATA_DIR: data }; delete env.ELECTRON_RUN_AS_NODE
  const application = await _electron.launch({ executablePath: executable, env })
  let fixturePid = 0
  try {
    const page = await application.firstWindow(); await page.waitForSelector('.page-heading')
    const snapshot = await page.evaluate(() => window.studio.snapshot()); assert(snapshot.packaged); assert.equal(snapshot.version, version)
    await page.screenshot({ path: 'preview/07-packaged-manager.png' })
    let opened = application.waitForEvent('window'); await page.click('#preview'); let player = await opened
    await player.waitForFunction(() => document.querySelector('video')?.currentTime > .1); await player.waitForEvent('close')
    const fixture = resolve('.test-data/FixtureApp.exe'), scan = await page.evaluate(path => window.studio.scan(path), fixture)
    const profile = structuredClone(snapshot.database.profiles[0]); profile.id = require('node:crypto').randomUUID(); profile.name = '安装包验证'; profile.adapter = scan.adapter; profile.background.enabled = false; profile.cold = structuredClone(profile.warm)
    await page.evaluate(profile => window.studio.save(profile), profile)
    await application.evaluate(({app}, desktop) => app.setPath('desktop', desktop), desktop)
    const shortcut = await page.evaluate(id => window.studio.shortcut(id), profile.id)
    const link = await application.evaluate(({shell}, file) => shell.readShortcutLink(file), shortcut)
    assert.equal(link.target, executable); assert.equal(link.args, '--launch=' + profile.id)
    opened = application.waitForEvent('window')
    // 按快捷方式的目标和参数执行，并保留隔离测试目录，避免写入用户的正式配置。
    const secondInstance = run(link.target, [link.args], { env, windowsHide: true })
    player = await opened
    await player.waitForEvent('close', { timeout: 20000 })
    await secondInstance
    const state = JSON.parse((await run(resolve('release', version, 'win-unpacked/resources/studio/native/WindowHost.exe'), ['state', fixture, ''], { windowsHide: true })).stdout)
    fixturePid = state.pid; assert(state.visible)
    const installer = await readFile(resolve('release', version, 'LaunchCanvas-Setup-' + version + '.exe')); assert.equal(installer.subarray(0, 2).toString(), 'MZ'); assert(installer.length > 50000000)
    const report = { passed: true, installerBytes: installer.length, checks: ['打包程序启动', 'ASAR 中的主进程和预加载', '安装资源中的视频播放', '打包版 EXE 快捷方式', '快捷方式触发单实例启动', '打包的原生助手显示目标软件', '安装文件 Windows EXE 格式'] }
    await writeFile('preview/packaged-smoke.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report))
  } finally { if (fixturePid) await run('taskkill.exe', ['/PID', String(fixturePid), '/F'], { windowsHide: true }).catch(() => {}); await application.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
