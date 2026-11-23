const { _electron }=require('playwright')
const { mkdtemp }=require('node:fs/promises')
const { resolve }=require('node:path')
const assert=require('node:assert/strict')
;(async()=>{
  const env={...process.env,LAUNCHCANVAS_DATA_DIR:await mkdtemp(resolve('.test-data/gallery-ui-'))};delete env.ELECTRON_RUN_AS_NODE
  const packaged=process.argv.includes('--packaged')
  const application=await _electron.launch({executablePath:packaged?resolve('release',require('../package.json').version,'win-unpacked/LaunchCanvas.exe'):require('electron'),args:packaged?[]:['.'],env})
  let page
  try{
    page=await application.firstWindow();await page.waitForSelector('#open-gallery')
    const original=(await page.evaluate(()=>window.studio.snapshot())).database.profiles[0]
    await page.click('#open-gallery');assert.equal(await page.locator('[data-theme]').count(),33)
    await page.waitForFunction(()=>Array.from(document.querySelectorAll('.gallery-card img')).slice(0,8).every(image=>image.complete&&image.naturalWidth>0))
    assert.ok(await page.locator('.gallery-card').first().evaluate(node=>node.getBoundingClientRect().height>180),'图库卡片必须完整显示缩略图和名称')
    await page.screenshot({path:'preview/gallery-library.png'})
    await page.click('[data-filter="经典原版"]');assert.equal(await page.locator('[data-theme]').count(),1)
    await page.click('[data-theme="silver-dragon-classic"]')
    for(const [slot,kind] of [['cold','legacy'],['warm','video'],['background','living']]){
      const opened=application.waitForEvent('window');await page.click(`[data-preview="${slot}"]`);const player=await opened
      await player.waitForFunction(()=>!!window.player)
      const data=await player.evaluate(()=>window.player.data());assert.equal(data.kind,kind)
      if(slot==='cold')await player.waitForSelector('iframe')
      if(slot==='warm'){assert.equal(data.durationMs,1500);await player.waitForSelector('video')}
      if(slot==='background')await player.waitForSelector('canvas')
      await player.waitForEvent('close',{timeout:20000})
    }
    await page.click('#apply-all');await page.waitForSelector('dialog',{state:'detached'});await page.click('#save')
    await page.waitForFunction(()=>document.querySelector('#save-state')?.textContent==='配置已保存在本机')
    const classic=(await page.evaluate(()=>window.studio.snapshot())).database.profiles[0]
    assert.deepEqual([classic.cold.source,classic.warm.source,classic.background.source],['builtin:cold','builtin:eye','builtin:background'])
    assert.deepEqual(classic.adapter,original.adapter)
    await page.click('#open-gallery')
    await page.click('[data-filter="插画风"]');assert.equal(await page.locator('[data-theme]').count(),12)
    await page.click('[data-filter="二次元"]');assert.equal(await page.locator('[data-theme]').count(),11)
    await page.click('[data-filter="全部"]');await page.fill('#gallery-search','Seed');assert.equal(await page.locator('[data-theme]').count(),2)
    await page.click('[data-theme="seed-anime"]');await page.click('#apply-all');await page.waitForSelector('dialog',{state:'detached'});await page.click('#save')
    await page.waitForFunction(()=>document.querySelector('#save-state')?.textContent==='配置已保存在本机')
    let profile=(await page.evaluate(()=>window.studio.snapshot())).database.profiles[0]
    for(const slot of ['cold','warm','background'])assert.equal(profile[slot].source,`gallery:seed-anime:${slot}`)
    assert.equal(profile.cold.durationMs,12000)
    assert.deepEqual(profile.adapter,original.adapter)
    await page.click('[data-slot="warm"]');await page.click('#open-gallery');await page.click('[data-theme="silver-dragon-classic"]');await page.click('#apply-one')
    await page.waitForSelector('dialog',{state:'detached'});await page.click('#save')
    await page.waitForFunction(()=>document.querySelector('#save-state')?.textContent==='配置已保存在本机')
    profile=(await page.evaluate(()=>window.studio.snapshot())).database.profiles[0]
    assert.equal(profile.warm.source,'builtin:eye');assert.equal(profile.cold.source,'gallery:seed-anime:cold');assert.equal(profile.background.source,'gallery:seed-anime:background')
    await page.click('#open-gallery');await page.click('[data-filter="场景"]');assert.equal(await page.locator('[data-theme]').count(),8)
    await page.click('[data-theme="aurora"]')
    const opened=application.waitForEvent('window');await page.click('[data-preview="warm"]');const player=await opened
    await player.waitForSelector('#aemeath-living-wallpaper');await player.waitForFunction(()=>Number(document.querySelector('canvas')?.dataset.seconds)>.2);await player.waitForEvent('close')
    await page.click('#apply-one');await page.waitForSelector('dialog',{state:'detached'});await page.click('#save')
    await page.waitForFunction(()=>document.querySelector('#save-state')?.textContent==='配置已保存在本机')
    await page.reload();await page.waitForSelector('#open-gallery')
    profile=(await page.evaluate(()=>window.studio.snapshot())).database.profiles[0]
    assert.equal(profile.warm.source,'gallery:aurora:warm');assert.equal(profile.cold.source,'gallery:seed-anime:cold');assert.equal(profile.background.source,'gallery:seed-anime:background')
    await page.click('#open-gallery');await page.click('[data-theme="chatgpt-art"]')
    const coldPreview=application.waitForEvent('window');await page.click('[data-preview="cold"]');const coldPlayer=await coldPreview
    await coldPlayer.waitForSelector('canvas[data-sequence="chatgpt-art"]')
    assert.equal(await coldPlayer.locator('canvas').getAttribute('data-deformation'),'none')
    for(const phase of ['opening','interaction','resolution','handoff'])await coldPlayer.locator(`canvas[data-phase="${phase}"]`).waitFor({timeout:10000})
    await coldPlayer.waitForEvent('close')
    const preview=application.waitForEvent('window');await page.click('[data-preview="warm"]');const portrait=await preview
    await portrait.waitForFunction(()=>Number(document.querySelector('canvas')?.dataset.seconds)>.2);await portrait.waitForEvent('close')
    await page.click('[data-theme="grok-anime"]')
    const skipPreview=application.waitForEvent('window');await page.click('[data-preview="cold"]');const skipped=await skipPreview
    await skipped.locator('canvas[data-sequence="grok-anime"][data-phase="opening"]').waitFor()
    await skipped.screenshot({path:'preview/gallery-cold-player.png'})
    const closed=skipped.waitForEvent('close');await skipped.click('#skip');await closed
    await page.locator('.gallery-dialog [data-close]').first().click()
    assert.equal((await page.evaluate(()=>window.studio.snapshot())).database.profiles[0].warm.source,'gallery:aurora:warm')
    console.log(JSON.stringify({passed:true,packaged,checks:['33 套图库缩略图与筛选、经典原版三项预览与绑定','Seed 双画风','整套绑定保留软件路径','单项替换与持久化','完整冷启动实际按顺序播放五阶段','完整开场可跳过','场景及人物恢复动画实际播放','仅预览不改变配置']}))
  }catch(error){if(page&&!page.isClosed()){await page.screenshot({path:'preview/gallery-smoke-failure.png'});console.error((await page.locator('body').innerText()).slice(-2500))}throw error}finally{await application.close()}
})().catch(error=>{console.error(error);process.exitCode=1})
