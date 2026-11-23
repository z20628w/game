const {_electron}=require('playwright')
const {mkdir,writeFile,readFile}=require('node:fs/promises')
const {resolve,join}=require('node:path')
const {pathToFileURL}=require('node:url')
const assert=require('node:assert/strict')
const {galleryThemes}=require('../dist/catalog')
;(async()=>{
  const folder=resolve('.test-data/warm-handoff');await mkdir(folder,{recursive:true});await mkdir('preview/warm',{recursive:true})
  await writeFile(join(folder,'index.html'),`<!doctype html><body style="margin:0"><script src="${pathToFileURL(resolve('resources/gallery/engine.js')).href}"></script>`)
  await writeFile(join(folder,'main.cjs'),`const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(join(folder,'profile'))});app.whenReady().then(()=>{const w=new BrowserWindow({width:1000,height:650,useContentSize:true});w.loadFile(__dirname+'/index.html')});app.on('window-all-closed',()=>app.quit())`)
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE
  const application=await _electron.launch({executablePath:require('electron'),args:[join(folder,'main.cjs')],env})
  const results=[]
  try{
    const page=await application.firstWindow();await page.waitForFunction(()=>!!window.LaunchCanvasGallery)
    const url=async name=>'data:image/png;base64,'+(await readFile(resolve('resources/gallery',name))).toString('base64')
    const specFor=async theme=>({theme,mode:'warm',durationMs:1800,imageURL:theme.image?await url(theme.image):undefined,closedURL:theme.image?await url(theme.id+'-closed.png'):undefined,actorURL:theme.image?await url('linked/'+theme.id+'-actor.png'):undefined,stageURL:theme.image?await url('linked/'+theme.id+'-stage.png'):undefined})
    const verify=async (spec,viewport=false)=>page.evaluate(async ({spec,viewport})=>{
      const scene=window.LaunchCanvasGallery.createGalleryScene(spec);await scene.ready;scene.pause()
      if(viewport){for(const [key,value] of Object.entries({x:8,y:31,width:834,height:501}))document.documentElement.style.setProperty('--player-client-'+key,value+'px');window.dispatchEvent(new Event('resize'))}
      const warm=document.querySelector('canvas'),samples=[]
      for(const time of [0,.45,.9,1.35,1.8]){scene.seek(time);samples.push(warm.toDataURL())}
      const target=document.createElement('canvas'),background=window.LaunchCanvasGallery.createGalleryScene({...spec,...spec.handoff,mode:'background',handoff:undefined},target);await background.ready;background.seek(0)
      const compare=document.createElement('canvas');compare.width=warm.width;compare.height=warm.height;const ctx=compare.getContext('2d');ctx.drawImage(target,0,0)
      const expected=ctx.getImageData(0,0,compare.width,compare.height).data,actual=warm.getContext('2d').getImageData(0,0,warm.width,warm.height).data
      let max=0;for(let i=0;i<actual.length;i++)max=Math.max(max,Math.abs(actual[i]-expected[i]))
      scene.seek(.9);const screenshot=warm.toDataURL();scene.seek(9);const held=warm.toDataURL()===samples[4]
      scene.dispose();background.dispose()
      if(viewport)for(const key of ['x','y','width','height'])document.documentElement.style.removeProperty('--player-client-'+key)
      return{max,held,unique:new Set(samples.slice(0,4)).size,screenshot,canvases:document.querySelectorAll('canvas').length}
    },{spec,viewport})
    for(const theme of galleryThemes.filter(theme=>!theme.preset)){const spec=await specFor(theme),result=await verify(spec);assert.equal(result.max,0,theme.id+' 末帧必须逐像素等于待机首帧');assert.equal(result.held,true);assert.equal(result.unique,4);assert.equal(result.canvases,0);await writeFile(`preview/warm/${theme.id}.png`,Buffer.from(result.screenshot.split(',')[1],'base64'));results.push(theme.id)}
    const mixed=await specFor(galleryThemes[1]);mixed.handoff={...await specFor(galleryThemes.find(t=>t.id==='ocean')),mode:'background',fit:'contain'}
    assert.equal((await verify(await specFor(galleryThemes[1]),true)).max,0,'窗口尺寸变化后，客户区末帧仍应逐像素对齐背景')
    assert.equal((await verify(mixed)).max,0,'不同主题/适配方式也应交接到所选背景')
    await page.emulateMedia({reducedMotion:'reduce'});const reduced=await verify(await specFor(galleryThemes[1]));assert.equal(reduced.max,0);assert.equal(reduced.unique,1)
    await writeFile('preview/warm-handoff.json',JSON.stringify({passed:true,themes:results,checks:['32 套短交互产生不同阶段','末帧与待机首帧像素完全一致','后台准备较慢时保持末帧','不同主题与适配方式交接','减少动态效果','资源释放']},null,2))
    console.log('32 套恢复动画逐像素交接、跨主题交接、等待末帧及资源清理均通过')
  }finally{await application.close()}
})().catch(error=>{console.error(error);process.exitCode=1})
