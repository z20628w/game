const { _electron } = require('playwright')
const { mkdir, writeFile, readFile } = require('node:fs/promises')
const { resolve, join } = require('node:path')
const { pathToFileURL } = require('node:url')
const assert = require('node:assert/strict')
const { galleryThemes } = require('../dist/catalog')
if(process.argv.includes('--cold-only')){require('../tests/cinematic-gallery.cjs')}else (async()=>{
  const folder=resolve('.test-data/gallery-render');await mkdir(folder,{recursive:true});await mkdir('preview/gallery',{recursive:true})
  await writeFile(join(folder,'index.html'),`<!doctype html><html><body style="margin:0"><script src="${pathToFileURL(resolve('resources/gallery/engine.js')).href}"></script></body></html>`)
  await writeFile(join(folder,'main.cjs'),`const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(join(folder,'profile'))});app.whenReady().then(()=>{const w=new BrowserWindow({width:1280,height:854,useContentSize:true,webPreferences:{sandbox:true}});w.loadFile(__dirname+'/index.html')});app.on('window-all-closed',()=>app.quit())`)
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE
  const application=await _electron.launch({executablePath:require('electron'),args:[join(folder,'main.cjs')],env})
  const report=[]
  try{
    const page=await application.firstWindow();await page.waitForFunction(()=>!!window.LaunchCanvasGallery)
    const capture=async path=>{const url=await page.locator('canvas').evaluate(node=>node.toDataURL('image/png'));await writeFile(path,Buffer.from(url.split(',')[1],'base64'))}
    const requested=process.argv.find(arg=>arg.startsWith('--theme='))?.slice(8)
    for(const theme of galleryThemes.filter(theme=>!theme.preset&&(!requested||theme.id===requested))){
      const imageURL=theme.image?'data:image/png;base64,'+(await readFile(resolve('resources/gallery',theme.image))).toString('base64'):undefined
      const closedURL=theme.image?'data:image/png;base64,'+(await readFile(resolve('resources/gallery',theme.id+'-closed.png'))).toString('base64'):undefined
      const actorURL=theme.image?'data:image/png;base64,'+(await readFile(resolve('resources/gallery/linked',theme.id+'-actor.png'))).toString('base64'):undefined
      const stageURL=theme.image?'data:image/png;base64,'+(await readFile(resolve('resources/gallery/linked',theme.id+'-stage.png'))).toString('base64'):undefined
      for(const mode of ['warm','background']){
        await page.evaluate(async spec=>{window.motion?.dispose();window.motion=window.LaunchCanvasGallery.createGalleryScene(spec);await window.motion.ready;window.motion.play();window.motion.pause();window.motion.seek(0)}, {theme,imageURL,closedURL,actorURL,stageURL,mode,durationMs:mode==='cold'?12000:1800})
        const initial=await page.locator('canvas').evaluate(node=>node.toDataURL())
        await page.evaluate(()=>window.motion.seek(1.5))
        const after=await page.locator('canvas').evaluate(node=>node.toDataURL())
        assert.notEqual(initial,after,`${theme.id}/${mode} 必须实际产生连续动态帧`)
        if(mode==='background'){
          await capture(theme.image?`preview/gallery/${theme.id}.png`:`resources/gallery/${theme.id}-thumb.png`)
          await page.evaluate(()=>{window.motion.play()});await page.waitForFunction(()=>window.motion.status().frames>4);await page.evaluate(()=>window.motion.pause())
        }
        if(mode==='warm'&&['chatgpt-art','chatgpt-anime','doubao-anime'].includes(theme.id)){
          for(const t of [0,.6,1.5]){await page.evaluate(time=>window.motion.seek(time),t);await capture(`preview/gallery/${theme.id}-warm-${t}.png`)}
        }
        report.push(theme.id+'/'+mode)
      }
    }
    await writeFile(process.argv.includes('--cold-only')?'preview/gallery-cold-render.json':'preview/gallery-render.json',JSON.stringify({passed:true,checks:report},null,2));console.log('全部 '+report.length+' 个图库动画通过对应阶段的渲染检查')
  }finally{await application.close()}
})().catch(error=>{console.error(error);process.exitCode=1})

