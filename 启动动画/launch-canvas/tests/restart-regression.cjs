const { _electron } = require('playwright')
const assert = require('node:assert/strict')
const { mkdir, writeFile, mkdtemp } = require('node:fs/promises')
const { resolve, join } = require('node:path')
const { execFile, spawn } = require('node:child_process')
const { promisify } = require('node:util')
const { setTimeout: delay } = require('node:timers/promises')
const run = promisify(execFile)
;(async () => {
  await mkdir('.test-data', { recursive: true }); await mkdir('preview', { recursive: true })
  const folder = await mkdtemp(resolve('.test-data/restart-')), fixture = join(folder, 'RestartFixture.exe'), signal = join(folder, 'signal')
  await run(join(process.env.WINDIR, 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'), ['/nologo', '/target:winexe', '/reference:System.Windows.Forms.dll', '/reference:System.Drawing.dll', '/out:' + fixture, resolve('tests/FixtureApp.cs')], { windowsHide: true })
  const state = async () => JSON.parse((await run(resolve('resources/native/WindowHost.exe'), ['state', fixture, '', 'electron'], { windowsHide: true })).stdout)
  const waitState = async predicate => { for (let i=0;i<50;i++) { const value = await state(); if (predicate(value)) return value; await delay(60) } throw Error('测试状态等待超时') }
  const stop = async pid => run('taskkill.exe', ['/PID', String(pid), '/F'], { windowsHide: true }).catch(() => {})
  const helpers = [], mainPids = new Set()
  const env = { ...process.env, LAUNCHCANVAS_DATA_DIR: join(folder, 'profile') }; delete env.ELECTRON_RUN_AS_NODE
  const application = await _electron.launch({ executablePath: resolve('release',require('../package.json').version,'win-unpacked/LaunchCanvas.exe'), env })
  try {
    const page = await application.firstWindow(); await page.waitForSelector('.page-heading')
    const snapshot = await page.evaluate(() => window.studio.snapshot()), profile = structuredClone(snapshot.database.profiles[0])
    profile.id = require('node:crypto').randomUUID(); profile.name = '退出重启回归测试'
    profile.adapter = { kind: 'electron', executable: fixture, args: [signal], title: '', pagePrefix: '', selectors: ['#root'], capability: 'unavailable', evidence: [], files: [] }
    profile.cold.source = 'builtin:cold'; profile.cold.durationMs = 1000
    profile.warm.source = 'builtin:eye'; profile.warm.durationMs = 600; profile.background.enabled = false
    await page.evaluate(profile => window.studio.save(profile), profile)
    const launch = async () => {
      const captures = []
      const onWindow = player => captures.push((async () => { await player.waitForFunction(() => !!window.player); return player.evaluate(() => window.player.data()) })())
      application.on('window', onWindow)
      try { await page.evaluate(id => window.studio.launch(id), profile.id); const value = await waitState(value => value.visible); mainPids.add(value.pid); return (await Promise.all(captures)).map(value => value.source) }
      finally { application.off('window', onWindow) }
    }
    for (const argument of ['--type=renderer', '--type=gpu-process', '--type=crashpad-handler', '--stdio', '--prewarm']) {
      const child = spawn(fixture, [argument], { windowsHide: true, stdio: 'ignore' }); helpers.push(child)
      await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject) })
    }
    const orphanState = await waitState(value => value.helperCount === 5)
    assert.equal(orphanState.running, false); assert.deepEqual(orphanState.mainProcessIds, [])
    assert.deepEqual(await launch(), ['builtin:cold'], '只有辅助进程时必须冷启动')
    await writeFile(signal + '.hide', 'hide'); await waitState(value => value.running && !value.visible)
    profile.id = require('node:crypto').randomUUID(); profile.name = '后台软件新添加的软件组'
    await page.evaluate(profile => window.studio.save(profile), profile)
    assert.deepEqual(await launch(), ['builtin:cold'], '新软件组即使软件已在后台，也应先播放完整开场')
    await writeFile(signal + '.hide', 'hide'); await waitState(value => value.running && !value.visible)
    assert.deepEqual(await launch(), ['builtin:eye'], '主进程正常留在后台时仍用恢复动画')
    await stop((await state()).pid); await waitState(value => !value.running)
    assert.deepEqual(await launch(), ['builtin:cold'], '结束主进程但残留辅助进程后应冷启动')
    await writeFile(signal + '.hide', 'hide'); await waitState(value => value.running && !value.visible)
    await writeFile(signal + '.exit-on-reopen', 'quit')
    assert.deepEqual(await launch(), ['builtin:eye', 'builtin:cold'], '恢复请求与退出竞争时自动改为冷启动')
    await writeFile(signal + '.hide', 'hide'); await waitState(value => value.running && !value.visible)
    await writeFile(signal + '.ignore-reopen', 'ignore')
    let settled = false
    const hiddenLaunch = launch().then(value => { settled = true; return value })
    await delay(1800); assert.equal(settled, false, '不能将隐藏窗口句柄误报为打开成功')
    await writeFile(signal + '.show', 'show'); assert.deepEqual(await hiddenLaunch, ['builtin:eye'])
    await writeFile(signal + '.hide', 'hide');await waitState(value=>value.running&&!value.visible)
    const oldPid=(await state()).pid
    await application.evaluate(({app})=>{globalThis.fixtureShownPlayers=[];app.on('browser-window-created',(_event,window)=>{window.on('show',()=>{if(window.webContents.getURL().endsWith('/player.html'))void window.webContents.executeJavaScript('window.player.data()').then(data=>globalThis.fixtureShownPlayers.push(data.source))})})})
    await writeFile(signal+'.replace-on-reopen','replace')
    assert.deepEqual(await launch(),['builtin:eye','builtin:cold'],'旧进程仍在收尾但新进程已显示窗口时，必须重新选择冷启动')
    assert.deepEqual(await application.evaluate(()=>globalThis.fixtureShownPlayers),['builtin:cold'],'只允许显示最终冷启动，恢复动画仅隐藏预热')
    const replacement=await state();assert.notEqual(replacement.pid,oldPid);assert(replacement.mainProcessIds.includes(oldPid),'测试必须包含旧新主进程重叠，不能依赖 running=false')
    await stop(oldPid)
    await stop((await state()).pid); await Promise.all(helpers.map(child => stop(child.pid)))
    await waitState(value => !value.running && value.helperCount === 0)
    assert.deepEqual(await launch(), ['builtin:cold'], '彻底退出后仍可再次正常冷启动')
    const report = { passed: true, checks: ['区分主进程与残留辅助进程', '仅有辅助进程时冷启动', '新软件组首次完整开场', '后台恢复', '杀死主进程后冷启动', '恢复期间退出自动重启', '隐藏句柄不视为启动完成', '旧新主进程重叠时按窗口真实进程改为冷启动', '切换判断时恢复动画始终隐藏，只有冷启动显示', '完全退出后再次冷启动'] }
    await writeFile('preview/restart-regression.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report))
  } finally {
    const current = await state().catch(() => null); if (current?.running) mainPids.add(current.pid)
    await Promise.all([...mainPids].map(stop)); await Promise.all(helpers.map(child => stop(child.pid)))
    await application.close()
  }
})().catch(error => { console.error(error); process.exitCode = 1 })
