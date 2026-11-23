import assert from 'node:assert/strict';
import {readFile,writeFile,unlink} from 'node:fs/promises';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from 'playwright';
import {buildInjection} from '../extension/payload.mjs';

// 独立 Chromium 测试窗口；不连接、隐藏或关闭用户的 Codex。
const exe=process.env.GPT_PREVIEW_BROWSER;
const browser=await chromium.launch({headless:false,executablePath:exe,args:['--window-size=1000,760']});
const gatePath=resolve('preview','gate-test-'+randomUUID()+'.txt');
let gate;
async function marker(suffix){
  for(let i=0;i<200;i++){
    if(await readFile(gatePath+suffix,'utf8').catch(()=>''))return true;
    await delay(25);
  }
  return false;
}
try{
  const session=await browser.newBrowserCDPSession();
  const {processInfo}=await session.send('SystemInfo.getProcessInfo');
  const pid=processInfo.find(process=>process.type==='browser').id;
  const context=await browser.newContext({viewport:{width:945,height:676}});
  const page=await context.newPage();
  const cdp=await context.newCDPSession(page);
  await page.setContent('<html><head><title>动画交接测试</title></head><body style="background:#091511;color:white">正在验证动画首帧</body></html>');
  const state=async()=>JSON.parse((await promisify(execFile)(resolve('.build/WindowActivator.exe'),['state',String(pid),exe],{windowsHide:true})).stdout);
  assert.equal((await state()).found,true);
  gate=spawn(resolve('.build/StartupGate.exe'),['--existing',exe,String(pid),gatePath],{windowsHide:true,stdio:'ignore'});
  await new Promise((resolve,reject)=>{gate.once('spawn',resolve);gate.once('error',reject);});
  assert(await marker('.armed'));
  assert.equal((await state()).alpha,0,'准备期间原生窗口必须不可见');
  await page.bringToFront();
  const preparedAt=Date.now();
  await page.evaluate(await buildInjection(process.cwd(),{deferStart:true,transition:'reopen'}));
  await page.waitForFunction(()=>window.__aemeathExtension?.status().ready,{},{polling:50});
  const prewarmMs=Date.now()-preparedAt;
  assert(await page.evaluate(()=>window.__aemeathExtension.prepareToShow()));
  const captured=await cdp.send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});
  assert(captured.data.length>100000,'透明保护期间必须能完成角色首帧合成');
  assert.equal((await state()).alpha,0,'首帧合成前不能提前解除保护');
  await writeFile(gatePath,'ready');assert(await marker('.shown'));
  assert.equal((await state()).alpha,255,'完成首帧后应恢复原生窗口显示');
  await page.bringToFront();
  await page.waitForFunction(()=>document.visibilityState==='visible');
  assert(await page.evaluate(()=>window.__aemeathExtension.start()));
  await page.waitForFunction(()=>window.__aemeathExtension.status().completed);
  const status=await page.evaluate(()=>window.__aemeathExtension.status());
  assert.equal(status.metrics.durationMs,1500);
  assert.equal(status.metrics.eyeMotion,'continuous-video');
  assert.equal(status.metrics.eyeMotionError,null);
  const checks=['原生窗口准备期间透明','透明期间可提交闭眼首帧','提交后恢复显示','恢复后播放连续视频'];
  await writeFile('preview/reopen-gate-verification.json',JSON.stringify({passed:true,prewarmMs,checks,metrics:status.metrics},null,2));
  console.log(JSON.stringify({passed:true,prewarmMs,checks}));
}finally{
  if(gate){await writeFile(gatePath,'ready');await marker('.shown');gate.unref();}
  await browser.close();
  for(const suffix of ['','.armed','.shown'])await unlink(gatePath+suffix).catch(()=>{});
}
