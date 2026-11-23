import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,unlink,rm} from 'node:fs/promises';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resolve,join,dirname,basename} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {connect,localSocket} from '../extension/cdp.mjs';
import {buildInjection} from '../extension/payload.mjs';

// 直接启动独立 Chromium，不使用 Playwright 的强制页面可见模拟。
const exe=process.env.GPT_PREVIEW_BROWSER;
const profile=await mkdtemp(join(tmpdir(),'codex-prewarm-test-'));
const gatePath=resolve('preview','gate-test-'+randomUUID()+'.txt');
const chrome=spawn(exe,['--user-data-dir='+profile,'--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--no-first-run','--no-default-browser-check','--window-size=1000,760','about:blank'],{windowsHide:true,stdio:'ignore'});
let browser,page,gate;
async function waitFor(read,label,timeout=6000){
  const end=Date.now()+timeout;
  while(Date.now()<end){const value=await read();if(value)return value;await delay(25);}
  throw Error(label+'超时');
}
const marker=suffix=>waitFor(()=>readFile(gatePath+suffix,'utf8').catch(()=>''),suffix);
try{
  const active=await waitFor(()=>readFile(join(profile,'DevToolsActivePort'),'utf8').catch(()=>''),'浏览器启动');
  const [port,socket]=active.trim().split(/\r?\n/);
  browser=await connect('ws://127.0.0.1:'+port+socket);
  const targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  const target=targets.find(target=>target.type==='page');
  page=await connect(localSocket(target.webSocketDebuggerUrl,Number(port)));
  const evaluate=async expression=>{
    const result=await page.call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    if(result.exceptionDetails)throw Error(result.exceptionDetails.text);
    return result.result.value;
  };
  await evaluate("document.title='真实后台预热测试';document.body.style.background='#091511'");
  const other=await browser.call('Target.createTarget',{url:'about:blank'});
  await browser.call('Target.activateTarget',{targetId:other.targetId});
  await waitFor(()=>evaluate('document.visibilityState==="hidden"'),'真实后台状态');
  const native=async mode=>JSON.parse((await promisify(execFile)(resolve('.build/WindowActivator.exe'),[mode,String(chrome.pid),exe],{windowsHide:true})).stdout);
  gate=spawn(resolve('.build/StartupGate.exe'),['--existing',exe,String(chrome.pid),gatePath],{windowsHide:true,stdio:'ignore'});
  await marker('.armed');assert.equal((await native('state')).alpha,0);
  // 与生产流程相同：原生保护 -> 唤醒 -> 准备视频 -> 首帧合成 -> 显示。
  await browser.call('Target.activateTarget',{targetId:target.id});
  const begin=Date.now();
  await evaluate(await buildInjection(process.cwd(),{deferStart:true,transition:'reopen'}));
  await waitFor(()=>evaluate('window.__aemeathExtension?.status().ready'),'媒体预热');
  const prewarmMs=Date.now()-begin;
  const video=await evaluate("(()=>{const video=document.querySelector('#aemeath-extension-overlay').contentDocument.querySelector('.reopen-video');return {hidden:video.hidden,ready:video.readyState,time:video.currentTime};})()");
  assert.equal(video.hidden,false,'恢复后不能回退为图片');assert(video.ready>=2);assert.equal(video.time,0);
  assert(await evaluate('window.__aemeathExtension.prepareToShow()'));
  await page.call('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});
  await writeFile(gatePath,'ready');await marker('.shown');await native('show');
  await waitFor(()=>evaluate('document.visibilityState==="visible"'),'页面恢复显示');
  assert(await evaluate('window.__aemeathExtension.start()'));
  await waitFor(()=>evaluate('window.__aemeathExtension.status().completed'),'动画完成');
  const status=await evaluate('window.__aemeathExtension.status()');
  assert.equal(status.metrics.eyeMotion,'continuous-video');assert.equal(status.metrics.eyeMotionError,null);
  const report={passed:true,prewarmMs,video,metrics:status.metrics};
  await writeFile('preview/native-prewarm-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{
  if(gate){await writeFile(gatePath,'ready');await marker('.shown').catch(()=>{});gate.unref();}
  page?.close();await browser?.call('Browser.close').catch(()=>{});browser?.close();
  await waitFor(()=>Promise.resolve(chrome.exitCode!==null),'测试浏览器关闭',4000).catch(()=>{chrome.kill();});
  for(const suffix of ['','.armed','.shown'])await unlink(gatePath+suffix).catch(()=>{});
  // 只删除本次创建的临时测试配置目录，不接触用户浏览器配置。
  if(dirname(resolve(profile))===resolve(tmpdir())&&basename(profile).startsWith('codex-prewarm-test-'))await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:300});
}
