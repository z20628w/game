const { _electron }=require('playwright')
const { mkdtemp, mkdir, writeFile }=require('node:fs/promises')
const { resolve }=require('node:path')
const assert=require('node:assert/strict')
const { galleryThemes }=require('../dist/catalog')

// 检查实际产品入口：原版沿用经典播放器，其他 32 套使用各自的演出。
;(async()=>{
  await mkdir('.test-data',{recursive:true});await mkdir('preview/classic',{recursive:true})
  const env={...process.env,LAUNCHCANVAS_DATA_DIR:await mkdtemp(resolve('.test-data/classic-gallery-'))};delete env.ELECTRON_RUN_AS_NODE
  const packaged=process.argv.includes('--packaged')
  const app=await _electron.launch({executablePath:packaged?resolve('release',require('../package.json').version,'win-unpacked/LaunchCanvas.exe'):require('electron'),args:packaged?[]:['.'],env})
  const report=[]
  try{
    const page=await app.firstWindow();await page.waitForSelector('#open-gallery')
    const id=(await page.evaluate(()=>window.studio.snapshot())).database.profiles[0].id
    const requested=process.argv.find(value=>value.startsWith('--theme='))?.slice(8)
    for(const theme of galleryThemes.filter(theme=>!requested||requested===theme.id)){
      const opened=app.waitForEvent('window')
      const pending=page.evaluate(({id,theme})=>window.studio.previewTheme(id,theme,'cold'),{id,theme:theme.id})
      const player=await opened
      if(!theme.preset){
        await player.waitForSelector('canvas[data-sequence="'+theme.id+'"]')
        const data=await player.evaluate(()=>window.player.data());assert.equal(data.kind,'gallery');assert.ok(!data.gallery.actorURL&&!data.gallery.stageURL,'冷启动不得加载人物变形分层')
        assert.equal(await player.locator('canvas').getAttribute('data-deformation'),'none')
        await player.waitForFunction(()=>Number(document.querySelector('canvas').dataset.seconds)>.15)
        const closed=player.waitForEvent('close');await player.click('#skip');await closed;await pending
        report.push({theme:theme.id,story:theme.introLabel,kind:'gallery'});console.log(theme.id+'：独立演出通过');continue
      }
      await player.waitForSelector('iframe')
      const frame=await player.locator('iframe').contentFrame()
      await frame.locator('.window[data-playing="true"]').waitFor()
      const data=await player.evaluate(()=>window.player.data());assert.equal(data.kind,'legacy');assert.ok(!data.gallery,'不加载旧人物网格和分层素材')
      const assets=await frame.locator('.window').evaluate(()=>({title:document.querySelector('.boot-title').textContent,art:document.querySelector('.artwork').src,avatar:document.querySelector('.avatar').src,paths:window.CONTOUR_PATHS.length}))
      assert.equal(assets.title,'欢迎回来');assert.ok(assets.paths>10)
      assert.ok(assets.art.endsWith('/assets/artwork.jpg'));assert.ok(assets.avatar.endsWith('/assets/avatar.jpg'))
      const phases=[]
      for(const [time,phase] of [[.4,'pulse'],[2.5,'identity'],[4.5,'dispersing'],[4.9,'scattered'],[6.2,'drawing'],[7.3,'colorize'],[8.5,'portrait'],[11.5,'shutter']]){
        await frame.locator('#timeline').evaluate((node,time)=>{node.value=String(time);node.dispatchEvent(new Event('input',{bubbles:true}))},time)
        assert.equal(await frame.locator('.window').getAttribute('data-stage'),phase)
        if(phase==='drawing')assert.ok(Number(await frame.locator('.line-art').getAttribute('data-fragments'))>10)
        if(phase==='portrait')assert.equal(await frame.locator('.artwork').evaluate(node=>node.style.opacity),'1')
        if(['chatgpt-anime','claude-art','aurora'].includes(theme.id)&&['identity','drawing','portrait'].includes(phase))await player.screenshot({path:`preview/classic/${theme.id}-${phase}.png`})
        phases.push(phase)
      }
      // 回看任意时间点仍可重建线稿。
      await frame.locator('#timeline').evaluate(node=>{node.value='6.2';node.dispatchEvent(new Event('input'))})
      assert.equal(await frame.locator('.window').getAttribute('data-stage'),'drawing')
      const closed=player.waitForEvent('close');await player.click('#skip');await closed;await pending
      report.push({theme:theme.id,paths:assets.paths,phases});console.log(theme.id+'：经典开场八阶段通过')
    }
    await writeFile(`preview/classic/${requested||'all'}-${packaged?'packaged':'dev'}.json`,JSON.stringify({passed:true,packaged,themes:report},null,2))
  }finally{await app.close()}
})().catch(error=>{console.error(error);process.exitCode=1})

