const { _electron } = require('playwright')
const { mkdir, writeFile, readFile } = require('node:fs/promises')
const { resolve, join } = require('node:path')
const { pathToFileURL } = require('node:url')
const { galleryThemes } = require('../dist/catalog')

// 使用真实渲染时间线录制，视频帧与产品中的冷启动或恢复动画保持一致。
;(async () => {
  const warm=process.argv.includes('--warm'),durationMs=warm?1800:12000
  const folder = resolve(warm?'.test-data/warm-record':'.test-data/cinematic-record'), output = resolve(warm?'preview/warm':'preview/cinematic')
  await mkdir(folder, { recursive: true }); await mkdir(output, { recursive: true })
  await writeFile(join(folder, 'index.html'), `<!doctype html><body style="margin:0"><script src="${pathToFileURL(resolve('resources/gallery/engine.js')).href}"></script>`)
  await writeFile(join(folder, 'main.cjs'), `const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(join(folder,'profile'))});app.whenReady().then(()=>{const w=new BrowserWindow({width:960,height:640,useContentSize:true,webPreferences:{sandbox:true,backgroundThrottling:false}});w.loadFile(__dirname+'/index.html')});app.on('window-all-closed',()=>app.quit())`)
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
  const application = await _electron.launch({ executablePath: require('electron'), args: [join(folder,'main.cjs')], env })
  const requested = process.argv.find(arg=>arg.startsWith('--themes='))?.slice(9).split(',')
  const report = requested ? JSON.parse(await readFile(join(output,'recording-report.json'),'utf8').catch(()=>'[]')).filter(item=>!requested.includes(item.theme)) : []
  const themes = galleryThemes.filter(theme => !theme.preset&&(warm?theme.id.endsWith('-anime'):true))
  try {
    const page = await application.firstWindow(); await page.waitForFunction(() => !!window.LaunchCanvasGallery)
    for (const theme of themes.filter(theme=>!requested||requested.includes(theme.id))) {
      const url = async file => 'data:image/png;base64,' + (await readFile(resolve('resources/gallery',file))).toString('base64')
      const spec = { theme, mode:warm?'warm':'cold', durationMs, imageURL:theme.image?await url(theme.image):undefined, actorURL:warm?await url(`linked/${theme.id}-actor.png`):undefined, stageURL:warm?await url(`linked/${theme.id}-stage.png`):undefined }
      const result = await page.evaluate(async spec => {
        window.motion?.dispose(); const motion = window.motion = window.LaunchCanvasGallery.createGalleryScene(spec); await motion.ready; motion.seek(0)
        const canvas = document.querySelector('canvas'), stream = canvas.captureStream(30)
        const recorder = new MediaRecorder(stream, { mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:4000000 }), chunks=[]
        recorder.ondataavailable = event => chunks.push(event.data)
        const done = new Promise(resolve => recorder.onstop = resolve)
        recorder.start(); const started=performance.now(); let frames=0, previous=started, maxGap=0
        await new Promise(resolve => {
          const tick = now => { maxGap=Math.max(maxGap,now-previous);previous=now;frames++;motion.seek(Math.min(spec.durationMs/1000,(now-started)/1000));if(now-started<spec.durationMs+600)requestAnimationFrame(tick);else resolve() };requestAnimationFrame(tick)
        })
        recorder.stop(); await done; stream.getTracks().forEach(track=>track.stop())
        const buffer = new Uint8Array(await new Blob(chunks,{type:'video/webm'}).arrayBuffer()); let binary=''
        for(let i=0;i<buffer.length;i+=32768)binary+=String.fromCharCode(...buffer.subarray(i,i+32768))
        return { base64:btoa(binary),frames,maxGap:Math.round(maxGap),elapsed:Math.round(performance.now()-started) }
      },spec)
      await writeFile(join(output,theme.id+'.webm'),Buffer.from(result.base64,'base64'))
      delete result.base64; report.push({theme:theme.id,...result}); console.log(JSON.stringify(report.at(-1)))
    }
    await writeFile(join(output,'recording-report.json'),JSON.stringify(report,null,2))
    await writeFile(join(output,'index.html'),`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>启幕 · ${warm?'十二种恢复交互':'不同主题的冷启动演出'}</title><style>body{margin:32px;background:#10171c;color:#ecf3f2;font:17px "Microsoft YaHei UI",sans-serif}main{max-width:1100px;margin:auto}select{padding:12px;font:inherit;background:#24343e;color:inherit;border-radius:10px}video{display:block;width:100%;margin:20px 0;border-radius:16px}p{color:#aabfc6}</style><main><h1>${warm?'十二种恢复交互':'不同主题的冷启动演出'}</h1><p>各主题采用自己的动画过程。${warm?'动作 1.8 秒，随后保持背景交接帧':'每段约 12 秒'}；切换角色可比较不同演出。</p><select id="theme">${themes.filter(t=>report.some(r=>r.theme===t.id)).map(t=>`<option value="${t.id}">${t.name} · ${warm?t.description.split(' / ')[1]:t.introLabel}</option>`).join('')}</select><video controls autoplay loop src="${report[0].theme}.webm"></video><script>document.querySelector('select').onchange=e=>{const v=document.querySelector('video');v.src=e.target.value+'.webm';v.play()}</script></main></html>`)
  } finally { await application.close() }
})().catch(error=>{console.error(error);process.exitCode=1})


