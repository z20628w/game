const { _electron } = require('playwright')
const assert = require('node:assert/strict')
const { access, mkdir, mkdtemp, writeFile } = require('node:fs/promises')
const { resolve } = require('node:path')
const appRoot = process.env.LAUNCHCANVAS_TEST_APP_DIR || resolve('.')
const packagedOption = process.argv.find(value => value === '--packaged' || value.startsWith('--packaged='))
const packagedPath = packagedOption && resolve(packagedOption.includes('=') ? packagedOption.slice('--packaged='.length) : `release/${require('../package.json').version}/win-unpacked/LaunchCanvas.exe`)
const output = resolve('preview/video-gallery', packagedPath ? 'packaged' : '.')

;(async () => {
  await mkdir('.test-data', { recursive: true }); await mkdir(output, { recursive: true })
  if (packagedPath) await access(packagedPath)
  const env = { ...process.env, LAUNCHCANVAS_DATA_DIR: await mkdtemp(resolve('.test-data/video-gallery-')) }; delete env.ELECTRON_RUN_AS_NODE
  const application = await _electron.launch({ executablePath: packagedPath || require('electron'), args: packagedPath ? [] : [appRoot], env })
  try {
    const page = await application.firstWindow(); await page.waitForSelector('#open-gallery')
    // 从当前运行的程序读取清单，打包测试不借用工作区 dist 冒充安装包内容。
    const runtime = await application.evaluate(({ app }) => {
      const { join } = process.getBuiltinModule('node:path')
      const appRequire = process.getBuiltinModule('node:module').createRequire(join(app.getAppPath(), 'package.json'))
      const catalog = appRequire(join(app.getAppPath(), 'dist/catalog.js'))
      const { videoThemes } = appRequire(join(app.getAppPath(), 'dist/video-catalog.js'))
      return {
        isPackaged: app.isPackaged, version: app.getVersion(), appPath: app.getAppPath(), userData: app.getPath('userData'),
        galleryThemes: catalog.galleryThemes, videoThemes,
        sources: Object.fromEntries(catalog.galleryThemes.map(theme => [theme.id, Object.fromEntries(['cold', 'warm', 'background'].map(slot => [slot, catalog.gallerySource(theme.id, slot)]))])),
        durations: Object.fromEntries(catalog.galleryThemes.map(theme => [theme.id, Object.fromEntries(['cold', 'warm', 'background'].map(slot => [slot, catalog.galleryDuration(theme.id, slot)]))])),
        sceneThumbnails: Object.fromEntries(catalog.galleryThemes.filter(theme => theme.group === '场景').map(theme => [theme.id, catalog.galleryThumbnail(theme)]))
      }
    })
    const { galleryThemes, videoThemes } = runtime
    assert.equal(resolve(runtime.userData).toLowerCase(), resolve(env.LAUNCHCANVAS_DATA_DIR).toLowerCase())
    if (packagedPath) assert.equal(runtime.isPackaged, true)
    assert.deepEqual(Object.entries(runtime.sceneThumbnails).filter(([, url]) => url.includes('/video-reference/')).map(([id]) => id), galleryThemes.filter(theme => theme.group === '场景' && videoThemes[theme.id]).map(theme => theme.id))
    const report = { executablePath: packagedPath || require('electron'), isPackaged: runtime.isPackaged, version: runtime.version, appPath: runtime.appPath, userData: runtime.userData, staticCards: 0, completedVideoThemes: Object.keys(videoThemes), sceneThumbnails: runtime.sceneThumbnails, previews: [], range: null }
    report.range = await application.evaluate(async ({ net }) => {
      const response = await net.fetch('lc-media://asset/' + encodeURIComponent('builtin:eye'), { headers: { Range: 'bytes=0-31' } })
      return { status: response.status, length: (await response.arrayBuffer()).byteLength, contentRange: response.headers.get('content-range') }
    })
    assert.equal(report.range.status, 206); assert.equal(report.range.length, 32); assert.match(report.range.contentRange, /^bytes 0-31\//)
    const original = (await page.evaluate(() => window.studio.snapshot())).database.profiles[0]
    await page.click('#open-gallery')
    assert.equal(await page.locator('.gallery-card').count(), 33)
    assert.equal(await page.locator('.gallery-card video').count(), 0)
    await page.waitForFunction(() => Array.from(document.querySelectorAll('.gallery-card img')).slice(0, 8).every(image => image.complete && image.naturalWidth > 0))
    report.staticCards = await page.locator('.gallery-card img').count()
    await page.click('[data-filter="连续视频"]')
    assert.equal(await page.locator('.gallery-card').count(), Object.keys(videoThemes).length)
    assert.deepEqual((await page.locator('.gallery-card').evaluateAll(cards => cards.map(card => card.dataset.theme))).sort(), Object.keys(videoThemes).sort())
    report.videoFilterCards = await page.locator('.gallery-card').count()
    await page.click('[data-filter="全部"]')
    assert.equal(await page.locator('.gallery-card').count(), 33)
    for (const theme of galleryThemes.filter(theme => videoThemes[theme.id])) {
      await page.click(`[data-theme="${theme.id}"]`)
      await page.waitForFunction(id => { const image = document.querySelector(`[data-theme="${id}"] img`); return image?.complete && image.naturalWidth > 0 }, theme.id)
      assert.match(await page.locator('.gallery-detail').innerText(), /连续视频/)
    }
    // 打包验收覆盖每段视频的实际解码；开发检查只播放代表主题。
    const previewThemes = galleryThemes.filter(theme => videoThemes[theme.id])
    for (const theme of packagedPath ? previewThemes : previewThemes.slice(0, 2)) {
      await page.click(`[data-theme="${theme.id}"]`)
      for (const slot of ['cold', 'warm', 'background']) {
        if (slot === 'background' && original.adapter.capability !== 'supported') continue
        const opened = application.waitForEvent('window'); await page.click(`[data-preview="${slot}"]`)
        const player = await opened
        await player.waitForFunction(() => !!window.player)
        const data = await player.evaluate(() => window.player.data())
        assert.equal(data.kind, 'video'); assert.equal(data.source, runtime.sources[theme.id][slot])
        if (slot !== 'background') {
          assert.equal(data.videoTimeline.backgroundSource, `gallery:${theme.id}:background`)
          assert.equal(data.videoTimeline.matched, true)
        }
        await player.waitForFunction(() => Array.from(document.querySelectorAll('video')).some(video => video.readyState >= 2 && video.currentTime > .15))
        assert.equal(await player.locator('canvas,iframe').count(), 0)
        await player.screenshot({ path: resolve(output, `${theme.id}-${slot}.png`) })
        const closed = player.waitForEvent('close'); await player.click('#skip'); await closed
        report.previews.push({ theme: theme.id, slot, kind: data.kind })
      }
    }
    const selected = galleryThemes.find(theme => videoThemes[theme.id]) || galleryThemes[0]
    await page.click(`[data-theme="${selected.id}"]`); await page.click('#apply-all')
    await page.waitForSelector('dialog', { state: 'detached' }); await page.click('#save')
    await page.waitForFunction(() => document.querySelector('#save-state')?.textContent === '配置已保存在本机')
    const saved = (await page.evaluate(() => window.studio.snapshot())).database.profiles[0]
    for (const slot of ['cold', 'warm', 'background']) {
      assert.equal(saved[slot].source, runtime.sources[selected.id][slot])
      assert.equal(saved[slot].durationMs, runtime.durations[selected.id][slot])
    }
    assert.deepEqual(saved.adapter, original.adapter)
    if (videoThemes[selected.id]) assert.equal(await page.locator('#duration').isDisabled(), true)
    assert.equal(await page.locator('.slot-card video').count(), 0)
    if (packagedPath) assert.equal(report.previews.length, Object.keys(videoThemes).length * 3)
    await page.screenshot({ path: resolve(output, 'editor.png') })
    await writeFile(resolve(output, 'ui-report.json'), JSON.stringify(report, null, 2))
    console.log(JSON.stringify(report))
  } finally { await application.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
