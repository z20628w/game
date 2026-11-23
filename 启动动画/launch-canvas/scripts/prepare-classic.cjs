const { _electron } = require('playwright')
const { mkdir, writeFile, readFile } = require('node:fs/promises')
const { resolve, join } = require('node:path')
const { pathToFileURL } = require('node:url')
const { createHash } = require('node:crypto')
const { galleryThemes } = require('../dist/catalog')

// 离线准备经典播放器的标准画幅、头像和真实边缘数据，启动时无需重新提取轮廓。
;(async () => {
  const folder=resolve('.test-data/classic-assets');await mkdir(folder,{recursive:true})
  await writeFile(join(folder,'index.html'),`<!doctype html><body><script src="${pathToFileURL(resolve('resources/legacy/image-settings.js')).href}"></script>`)
  await writeFile(join(folder,'main.cjs'),`const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(join(folder,'profile'))});app.whenReady().then(()=>{const w=new BrowserWindow({show:false,webPreferences:{sandbox:true,backgroundThrottling:false}});w.loadFile(__dirname+'/index.html')});app.on('window-all-closed',()=>app.quit())`)
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE
  const app=await _electron.launch({executablePath:require('electron'),args:[join(folder,'main.cjs')],env})
  const report=[]
  try {
    const page=await app.firstWindow();await page.waitForFunction(()=>!!window.imageSettings)
    for(const theme of galleryThemes.filter(item=>!item.preset)) {
      const input=await readFile(resolve('resources/gallery',theme.image||theme.id+'-thumb.png'))
      const result=await page.evaluate(async ({url,theme})=>{
        const image=new Image();image.src=url;await image.decode()
        const canvas=document.createElement('canvas');canvas.width=1920;canvas.height=1080
        const ctx=canvas.getContext('2d'),scale=Math.max(1920/image.width,1080/image.height)
        ctx.drawImage(image,(1920-image.width*scale)/2,(1080-image.height*scale)/2,image.width*scale,image.height*scale)
        const artwork=canvas.toDataURL('image/jpeg',.94)
        // 同一标准画幅交给原版轮廓算法，确保描线与显色画面逐点对齐。
        const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'))
        const traced=await window.imageSettings.importImage(new File([blob],'artwork.png',{type:'image/png'}),'artwork')
        const avatar=document.createElement('canvas');avatar.width=avatar.height=384
        const size=theme.image?image.height*(theme.id.endsWith('-anime')?.36:.46):Math.min(image.width,image.height)
        const eyes=theme.eyes||[.5,.46,.5,.46],cx=(eyes[0]+eyes[2])*.5*image.width,cy=((eyes[1]+eyes[3])*.5+.055)*image.height
        const x=Math.max(0,Math.min(image.width-size,cx-size/2)),y=Math.max(0,Math.min(image.height-size,cy-size/2))
        avatar.getContext('2d').drawImage(image,x,y,size,size,0,0,384,384)
        return {artwork,avatar:avatar.toDataURL('image/jpeg',.94),contours:traced.contours}
      },{theme,url:'data:image/png;base64,'+input.toString('base64')})
      const output=resolve('resources/legacy/gallery',theme.id);await mkdir(output,{recursive:true})
      for(const kind of ['artwork','avatar'])await writeFile(join(output,kind+'.jpg'),Buffer.from(result[kind].split(',')[1],'base64'))
      await writeFile(join(output,'contours.js'),'window.CONTOUR_PATHS='+JSON.stringify(result.contours)+';\n')
      report.push({theme:theme.id,source:theme.image||theme.id+'-thumb.png',sourceSHA256:createHash('sha256').update(input).digest('hex'),paths:result.contours.length})
      console.log(theme.id+': '+result.contours.length+' 条原图轮廓')
    }
    await writeFile('docs/经典开场素材记录.json',JSON.stringify({generator:'scripts/prepare-classic.cjs',themes:report},null,2))
  }finally{await app.close()}
})().catch(error=>{console.error(error);process.exitCode=1})
