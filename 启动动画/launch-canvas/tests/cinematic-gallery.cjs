const {_electron}=require('playwright')
const {mkdir,writeFile,readFile}=require('node:fs/promises')
const {resolve,join}=require('node:path')
const {pathToFileURL}=require('node:url')
const assert=require('node:assert/strict')
const {galleryThemes}=require('../dist/catalog')
;(async()=>{
  const folder=resolve('.test-data/cinematic-gallery');await mkdir(folder,{recursive:true});await mkdir('preview/cinematic',{recursive:true})
  await writeFile(join(folder,'index.html'),`<!doctype html><body style="margin:0"><script src="${pathToFileURL(resolve('resources/gallery/engine.js')).href}"></script>`)
  await writeFile(join(folder,'main.cjs'),`const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(join(folder,'profile'))});app.whenReady().then(()=>{const w=new BrowserWindow({width:1000,height:650,useContentSize:true,webPreferences:{sandbox:true,backgroundThrottling:false}});w.loadFile(__dirname+'/index.html')});app.on('window-all-closed',()=>app.quit())`)
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE
  const application=await _electron.launch({executablePath:require('electron'),args:[join(folder,'main.cjs')],env}),report=[]
  try{
    const page=await application.firstWindow();await page.waitForFunction(()=>!!window.LaunchCanvasGallery)
    const requested=process.argv.find(x=>x.startsWith('--theme='))?.slice(8),sequences=new Set()
    for(const theme of galleryThemes.filter(t=>!t.preset&&(!requested||t.id===requested))){
      const imageURL=theme.image?'data:image/png;base64,'+(await readFile(resolve('resources/gallery',theme.image))).toString('base64'):undefined
      const spec={theme,mode:'cold',durationMs:12000,imageURL}
      const result=await page.evaluate(async spec=>{
        window.motion?.dispose();const motion=window.motion=window.LaunchCanvasGallery.createGalleryScene(spec);await motion.ready
        const canvas=document.querySelector('canvas'),ctx=canvas.getContext('2d'),frames=[]
        for(const t of [0,1.8,4.4,7.8,10.6,12]){motion.seek(t);frames.push(canvas.toDataURL())}
        const sequence=canvas.dataset.sequence,deformation=canvas.dataset.deformation
        motion.seek(4.4);const a=ctx.getImageData(0,0,canvas.width,canvas.height).data;motion.seek(4.4167);const b=ctx.getImageData(0,0,canvas.width,canvas.height).data
        let difference=0;for(let i=0;i<a.length;i+=4)difference+=Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])
        motion.seek(12);const last=canvas.toDataURL();const target=document.createElement('canvas'),bg=window.LaunchCanvasGallery.createGalleryScene({...spec,mode:'background'},target);await bg.ready;bg.seek(0)
        const compare=document.createElement('canvas');compare.width=canvas.width;compare.height=canvas.height;compare.getContext('2d').drawImage(target,0,0,canvas.width,canvas.height);const same=last===compare.toDataURL();bg.dispose()
        return {frames,sequence,deformation,same,difference:difference/(a.length/4*3*255)}
      },spec)
      assert.equal(result.sequence,theme.id);assert.equal(result.deformation,'none');sequences.add(result.sequence)
      assert.equal(new Set(result.frames).size,6,theme.id+' 各阶段必须存在动态变化');assert.ok(result.same,theme.id+' 末帧必须与背景首帧完全一致');assert.ok(result.difference<.025,theme.id+' 相邻帧不可突变')
      for(const [index,label] of [[1,'opening'],[2,'interaction'],[3,'resolution']])await writeFile(`preview/cinematic/${theme.id}-${label}.png`,Buffer.from(result.frames[index].split(',')[1],'base64'))
      report.push({theme:theme.id,story:theme.introLabel,sequence:result.sequence,adjacentDifference:result.difference,endMatchesBackground:result.same});console.log(theme.id+' / '+theme.introLabel+'：通过')
    }
    assert.equal(sequences.size,report.length)
    await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>window.motion.seek(3));assert.equal(await page.locator('canvas').getAttribute('data-phase'),'complete')
    await page.evaluate(()=>window.motion.dispose());assert.equal(await page.locator('canvas').count(),0)
    await writeFile(`preview/cinematic/${requested||'all'}-render.json`,JSON.stringify({passed:true,themes:report},null,2))
  }finally{await application.close()}
})().catch(error=>{console.error(error);process.exitCode=1})
