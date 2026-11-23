import {build} from 'esbuild'
import {mkdir,copyFile,access,readFile,stat,open} from 'node:fs/promises'
import {resolve,dirname,join} from 'node:path'
import {createRequire} from 'node:module'
import {spawn} from 'node:child_process'
const root=process.cwd(),source=resolve(root,'../codex-gpt-appearance')
await mkdir('dist',{recursive:true})
await mkdir('resources/native',{recursive:true})
for(const file of ['index.html','style.css','animation.js','image-settings.js','assets/config.js','assets/contours.js','assets/artwork.jpg','assets/avatar.jpg','assets/artwork-blink.jpg','assets/eye-open-motion.webm','extension/living-wallpaper.mjs','extension/wallpaper.css','THIRD_PARTY_NOTICES.md']){
  const target=join(root,'resources/legacy',file);await mkdir(dirname(target),{recursive:true});if(!await access(target).then(()=>true,()=>false))await copyFile(join(source,file),target)
}
if(!await access('resources/icon.ico').then(()=>true,()=>false))await copyFile(join(source,'assets/icons/launch.ico'),'resources/icon.ico')
const compiler=join(process.env.WINDIR,'Microsoft.NET/Framework64/v4.0.30319/csc.exe')
await new Promise((done,reject)=>{const child=spawn(compiler,['/nologo','/target:exe','/platform:x64','/reference:System.Web.Extensions.dll','/out:'+resolve('resources/native/TaskbarIcon.exe'),resolve('native/TaskbarIcon.cs')],{stdio:'inherit',windowsHide:true});child.on('error',reject);child.on('exit',code=>code===0?done():reject(Error('任务栏图标助手编译失败')))})
await new Promise((done,reject)=>{const child=spawn(compiler,['/nologo','/target:exe','/reference:System.Windows.Forms.dll','/reference:System.Web.Extensions.dll','/out:'+resolve('resources/native/WindowHost.exe'),resolve('native/WindowHost.cs')],{stdio:'inherit',windowsHide:true});child.on('error',reject);child.on('exit',code=>code===0?done():reject(Error('原生窗口助手编译失败')))})
await new Promise((done,reject)=>{const child=spawn(compiler,['/nologo','/target:exe','/out:'+resolve('resources/native/PortOwner.exe'),resolve('native/PortOwner.cs')],{stdio:'inherit',windowsHide:true});child.on('error',reject);child.on('exit',code=>code===0?done():reject(Error('端口校验助手编译失败')))})
await build({entryPoints:['src/main.ts','src/preload.ts','src/player-preload.ts','src/domain.ts','src/shortcuts.ts','src/store.ts','src/detection.ts','src/background.ts','src/cdp.ts','src/catalog.ts','src/video-catalog.ts','src/media-response.ts','src/calibration-rules.ts','src/background-policy.ts'],bundle:true,platform:'node',format:'cjs',target:'node22',external:['electron','original-fs'],outdir:'dist',sourcemap:true})
const require=createRequire(import.meta.url),{videoThemes}=require(resolve('dist/video-catalog.js')),{galleryThemes}=require(resolve('dist/catalog.js'))
const videoManifest=JSON.parse(await readFile('resources/gallery/video-manifest.json','utf8'))
if(videoManifest.version!==1||!videoManifest.themes||Array.isArray(videoManifest.themes))throw Error('视频图库清单格式无效')
for(const [id,value] of Object.entries(videoManifest.themes)){
  if(!galleryThemes.some(theme=>theme.id===id)||!videoThemes[id])throw Error('视频主题尚未通过完整验收：'+id)
  if(galleryThemes.find(theme=>theme.id===id).group==='场景'&&!await access(resolve('resources/gallery/video-reference',id+'.png')).then(()=>true,()=>false))throw Error('视频场景的静态预览图缺失：'+id)
  for(const slot of ['cold','warm','background']){
    const file=resolve('resources',value[slot].file),info=await stat(file)
    if(!info.isFile()||info.size<1024)throw Error('视频素材缺失或为空：'+file)
    const handle=await open(file,'r'),header=Buffer.alloc(32)
    try{await handle.read(header,0,header.length,0)}finally{await handle.close()}
    if(header.toString('ascii',4,8)!=='ftyp')throw Error('视频素材不是有效的 MP4 容器：'+file)
  }
}
await build({entryPoints:['src/renderer.ts','src/player.ts'],bundle:true,platform:'browser',format:'iife',target:'chrome130',outdir:'dist',sourcemap:true})
await mkdir('resources/gallery',{recursive:true})
await build({entryPoints:['src/gallery-motion.ts'],bundle:true,platform:'browser',format:'iife',globalName:'LaunchCanvasGallery',target:'chrome130',outfile:'resources/gallery/engine.js'})
for(const file of ['index.html','styles.css','player.html','player.css'])await copyFile('src/'+file,'dist/'+file)
console.log('TypeScript 应用与独立运行资源已构建。')
