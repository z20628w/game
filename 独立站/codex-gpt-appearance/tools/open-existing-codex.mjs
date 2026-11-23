import {readFile,writeFile,unlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {connect,pageTarget,localSocket} from '../extension/cdp.mjs';
import {buildInjection} from '../extension/payload.mjs';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const record=JSON.parse((await readFile(process.argv[2],'utf8')).replace(/^\uFEFF/,''));
const began=performance.now(),timings=[];
const mark=stage=>timings.push({stage,elapsedMs:Math.round(performance.now()-began)});
const saveTiming=()=>writeFile(join(dirname(process.argv[2]),'reopen-timing.json'),JSON.stringify({time:new Date().toISOString(),timings},null,2)).catch(()=>{});
const exe=process.argv[3],profile=process.argv[4];
const run=promisify(execFile);
const native=async mode=>JSON.parse((await run(join(root,'.build','WindowActivator.exe'),[mode,String(record.pid),exe],{windowsHide:true})).stdout.trim());
const before=await native('state');
mark('window-state');
async function activateOfficial(){
  // 让官方应用处理第二实例事件，正确更新 Electron 页面可见性。
  const host=spawn(exe,['--user-data-dir='+profile],{detached:true,windowsHide:true,stdio:'ignore'});
  await new Promise((resolve,reject)=>{host.once('spawn',resolve);host.once('error',reject);});host.unref();
}
// 窗口可见或只是最小化时，保持任务和动画原状，只切换到前台。
if(before.visible||before.minimized){await native('show');mark('foreground-only');await saveTiming();console.log('窗口已置于前台，未重播。');process.exit(0);}
// 在任何唤起动作之前挡住原生窗口的旧合成帧；异常时也必须解除。
const gatePath=join(dirname(process.argv[2]),'reopen-ready-'+randomUUID()+'.txt');
const gate=spawn(join(root,'.build','StartupGate.exe'),['--existing',exe,String(record.pid),gatePath],{windowsHide:true,stdio:'ignore'});
await new Promise((resolve,reject)=>{gate.once('spawn',resolve);gate.once('error',reject);});
async function waitMarker(suffix,attempts){
  for(let i=0;i<attempts;i++){
    if(await readFile(gatePath+suffix,'utf8').catch(()=>''))return true;
    await delay(25);
  }
  return false;
}
let client,installed=false,started=false;
try{
  if(!await waitMarker('.armed',200))throw Error('窗口显示保护未就绪');
  mark('gate-armed');
  // 先在原生保护下唤醒 Electron；否则隐藏页面的视频解码可能被暂停。
  await activateOfficial();mark('activation-requested');
  let target;
  for(let attempt=0;attempt<100;attempt++){
    const targets=await(await fetch(`http://127.0.0.1:${record.port}/json/list`,{signal:AbortSignal.timeout(1500)})).json();
    const main=targets.filter(pageTarget);if(main.length===1){target=main[0];break;}
    if(main.length>1)throw Error('无法唯一确定主窗口');
    await delay(100);
  }
  if(!target)throw Error('未找到可重新打开的主窗口');
  client=await connect(localSocket(target.webSocketDebuggerUrl,record.port));
  mark('page-connected');
  const evaluate=async expression=>{
    const result=await client.call('Runtime.evaluate',{expression,returnByValue:true});
    if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);
    return result.result?.value;
  };
  await evaluate('window.__aemeathExtension?.dispose()');
  await evaluate(await buildInjection(root,{deferStart:true,transition:'reopen'}));
  installed=true;
  mark('injected');
  let ready=false;
  for(let attempt=0;attempt<150;attempt++){
    if(await evaluate('window.__aemeathExtension?.status().ready')){ready=true;break;}
    await delay(100);
  }
  if(!ready)throw Error('打开动画预热超时');
  mark('media-ready');
  if(!await evaluate('window.__aemeathExtension.prepareToShow()'))throw Error('闭眼首帧未就绪');
  // 隐藏窗口可能仍保留上次的合成帧。强制提交已覆盖整个视口的首帧，
  // 不保存或输出截图；窗口保护解除前不启动动画计时。
  const covered=await evaluate(`(()=>{const frame=document.querySelector('#aemeath-extension-overlay');if(!frame)return false;const rect=frame.getBoundingClientRect(),style=getComputedStyle(frame);return style.visibility==='visible'&&Number(style.opacity)===1&&rect.width>=innerWidth&&rect.height>=innerHeight;})()`);
  if(!covered)throw Error('闭眼首帧未完整覆盖窗口');
  await client.call('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false},5000);
  mark('first-frame-composited');
  await writeFile(gatePath,'ready');
  if(!await waitMarker('.shown',200))throw Error('窗口显示保护未解除');
  for(let attempt=0;attempt<150;attempt++){
    if(await evaluate('document.visibilityState==="visible"'))break;
    await delay(100);
  }
  await native('show');
  if(!await evaluate('window.__aemeathExtension.start()'))throw Error('窗口未显示，动画未开始');
  started=true;
  mark('animation-started');
  console.log('已显示原窗口并播放 1.5 秒睁眼动画，未重启 Codex。');
}finally{
  if(installed&&!started)await client?.call('Runtime.evaluate',{expression:"document.querySelector('#aemeath-extension-overlay')?.contentWindow.launcherUI?.skip()"},1000).catch(()=>{});
  // 先解除原生透明保护，再清理握手文件。辅助进程另有 45 秒兜底。
  await writeFile(gatePath,'ready').catch(()=>{});
  const released=await waitMarker('.shown',200);
  client?.close();gate.unref();
  if(released)for(const suffix of ['', '.armed','.shown'])await unlink(gatePath+suffix).catch(()=>{});
  await saveTiming();
}
