import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {buildInjection} from '../extension/payload.mjs';
const browser=await chromium.launch({headless:true,executablePath:process.env.GPT_PREVIEW_BROWSER});
try{
  const page=await browser.newPage({viewport:{width:1440,height:810}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.setContent('<!doctype html><html data-theme="dark"><body><div id="root">打开动画验证</div></body></html>');
  await page.evaluate(await buildInjection(process.cwd(),{deferStart:true,transition:'reopen'}));
  await page.waitForFunction(()=>window.__aemeathExtension?.status().ready);
  const prepared=await page.evaluate(()=>window.__aemeathExtension.status());
  assert.equal(prepared.backgroundState,'motion-ready');
  assert(prepared.motion.frames>0,'恢复动画就绪前背景必须已经绘制');
  assert.equal(prepared.motion.seconds,0,'交接前背景须保持与睁眼素材一致的初始姿态');
  // 模拟后台预热后窗口恢复到不同尺寸，首帧不能沿用旧的像素尺寸。
  const geometry=[];
  for(const viewport of [{width:945,height:676},{width:1440,height:810}]){
    await page.setViewportSize(viewport);
    const bounds=await page.frameLocator('#aemeath-extension-overlay').locator('.reopen-plane').evaluate(element=>{
      const rect=element.getBoundingClientRect(),image=element.querySelector('img');
      const scale=Math.max(innerWidth/image.naturalWidth,innerHeight/image.naturalHeight);
      return {width:rect.width,height:rect.height,x:rect.x,y:rect.y,expectedWidth:image.naturalWidth*scale,expectedHeight:image.naturalHeight*scale,viewWidth:innerWidth,viewHeight:innerHeight};
    });
    assert(Math.abs(bounds.width-bounds.expectedWidth)<1,'恢复窗口后，未播放的首帧宽度也必须立即适配');
    assert(Math.abs(bounds.height-bounds.expectedHeight)<1,'恢复窗口后，未播放的首帧高度也必须立即适配');
    assert(Math.abs(bounds.x-(bounds.viewWidth-bounds.width)/2)<1);
    assert(Math.abs(bounds.y-(bounds.viewHeight-bounds.height)/2)<1);
    geometry.push(bounds);
  }
  assert.equal(await page.evaluate(()=>window.__aemeathExtension.prepareToShow()),true);
  await page.screenshot({path:'preview/05-reopen-closed.png'});
  const overlay=page.frameLocator('#aemeath-extension-overlay');
  assert.equal(await overlay.locator('.scene').isVisible(),false);
  assert.equal(await overlay.locator('.reopen-closed').evaluate(element=>Number(getComputedStyle(element).opacity)),1);
  const beforeVideo=await overlay.locator('.reopen-video').evaluate(video=>({paused:video.paused,time:video.currentTime,ready:video.readyState,hidden:video.hidden}));
  assert(beforeVideo.paused&&beforeVideo.time===0&&beforeVideo.ready>=2&&!beforeVideo.hidden,'视频应预热到闭眼首帧并暂停');
  // 记录实际覆盖层透明度，确认结束前已露出宿主，而非先淡入不透明底色。
  await page.evaluate(()=>{
    window.reopenSamples=[];
    const frame=document.querySelector('#aemeath-extension-overlay');
    const sample=()=>{
      const rect=frame.contentDocument?.querySelector('.reopen-plane')?.getBoundingClientRect();
      window.reopenSamples.push({connected:frame.isConnected,opacity:Number(getComputedStyle(frame).opacity),width:rect?.width,height:rect?.height,x:rect?.x,y:rect?.y});
      if(frame.isConnected)requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  const started=Date.now();assert.equal(await page.evaluate(()=>window.__aemeathExtension.start()),true);
  await page.waitForTimeout(975);
  assert.equal(await overlay.locator('.reopen-closed').evaluate(element=>Number(getComputedStyle(element).opacity)),0);
  assert.equal(await page.evaluate(()=>window.__aemeathExtension.status().motion.seconds),0);
  assert((await overlay.locator('.reopen-video').evaluate(video=>video.currentTime))>.8,'眼睑视频应连续播放');
  const blend=await page.locator('#aemeath-extension-overlay').evaluate(element=>Number(getComputedStyle(element).opacity));
  assert(blend>0&&blend<.7,'睁眼结束时应正在与工作界面交叉淡化');
  assert.equal(await overlay.locator('.reopen-scene').evaluate(element=>Number(getComputedStyle(element).opacity)),1);
  await page.screenshot({path:'preview/06-reopen-open.png'});
  await page.waitForFunction(()=>window.__aemeathExtension.status().completed);
  const elapsedMs=Date.now()-started,status=await page.evaluate(()=>window.__aemeathExtension.status());
  assert(elapsedMs>=1450&&elapsedMs<2300);assert.equal(status.metrics.durationMs,1500);assert.equal(status.metrics.transition,'eye-open');
  assert.equal(status.overlay,false);assert.equal(status.wallpaper,true);assert.deepEqual(errors,[]);
  assert.equal(status.metrics.eyeMotion,'continuous-video');assert(status.metrics.videoFrames>=35);
  const samples=await page.evaluate(()=>window.reopenSamples.filter(sample=>sample.connected));
  assert(samples.length>10);
  assert(samples.at(-1).opacity<.02,'移除前覆盖层应已基本透明');
  assert(samples.every((sample,index)=>index===0||sample.opacity<=samples[index-1].opacity),'淡出应连续，不能反向闪回');
  assert(samples.every(sample=>['width','height','x','y'].every(key=>Math.abs(sample[key]-geometry.at(-1)[key])<1)),'播放首帧到结束不得缩放或移动图片');
  await page.waitForTimeout(250);
  assert((await page.evaluate(()=>window.__aemeathExtension.status().motion.seconds))>0,'覆盖层结束后应恢复背景动作');
  await writeFile('preview/eye-open-verification.json',JSON.stringify({passed:true,elapsedMs,geometry,blend,lastOpacity:samples.at(-1).opacity,status},null,2));
  console.log(JSON.stringify({passed:true,elapsedMs,metrics:status.metrics}));
}finally{await browser.close();}
