import {readFile,writeFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {buildInjection} from '../extension/payload.mjs';
import {connect,pageTarget,localSocket} from '../extension/cdp.mjs';
const record=JSON.parse((await readFile(process.argv[2],'utf8')).replace(/^\uFEFF/,''));
const targets=await(await fetch(`http://127.0.0.1:${record.port}/json/list`,{signal:AbortSignal.timeout(2000)})).json();
const mainTargets=targets.filter(pageTarget);
if(mainTargets.length!==1)throw Error('无法唯一确定主窗口，未重播动画。');
// 清理旧版误装到搜索浮窗的外观，仅操作本启动器自己的实例。
for(const target of targets.filter(target=>{
  try{const url=new URL(target.url);return url.protocol==='app:'&&url.hostname==='-'&&url.pathname==='/index.html'&&url.searchParams.get('initialRoute')==='/spotlight';}catch{return false;}
})){
  const client=await connect(localSocket(target.webSocketDebuggerUrl,record.port));
  try{await client.call('Runtime.evaluate',{expression:'window.__aemeathExtension?.dispose()',returnByValue:true});}finally{client.close();}
}
const client=await connect(localSocket(mainTargets[0].webSocketDebuggerUrl,record.port));
try{
  const evaluate=async expression=>{
    const result=await client.call('Runtime.evaluate',{expression,returnByValue:true});
    if(result.exceptionDetails)throw Error('动画执行失败：'+(result.exceptionDetails.exception?.description||result.exceptionDetails.text));
    return result.result?.value;
  };
  if(await evaluate('document.visibilityState')!=='visible')throw Error('请先显示主窗口再重播。');
  await evaluate('window.__aemeathExtension?.dispose()');
  await evaluate(await buildInjection(process.cwd(),{deferStart:true}));
  let ready=false;
  for(let attempt=0;attempt<100;attempt++){
    if(await evaluate('window.__aemeathExtension?.status().ready')){ready=true;break;}
    await delay(100);
  }
  if(!ready)throw Error('动画素材预热超时');
  await evaluate('window.__aemeathExtension.prepareToShow()');
  await delay(200);
  if(!await evaluate('window.__aemeathExtension.start()'))throw Error('主窗口未开始播放');
  const samples=[];
  for(let second=0;second<20;second++){
    await delay(1000);
    const sample=await evaluate(`({status:window.__aemeathExtension.status(),elapsed:document.getElementById('aemeath-extension-overlay')?.contentDocument?.querySelector('.window')?.dataset.elapsed})`);
    samples.push(sample);
    if(sample.status.completed)break;
  }
  const final=samples.at(-1).status;
  const passed=final.completed&&final.wallpaper&&!final.overlay&&samples.some(sample=>sample.status.visibility==='visible'&&Number(sample.elapsed)>1&&Number(sample.elapsed)<10);
  const report={passed,target:mainTargets[0].id,time:new Date().toISOString(),samples};
  await writeFile('preview/live-verification.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify({passed,status:final,samples:samples.length}));
  if(!passed)throw Error('实际窗口播放验证未通过');
}finally{client.close();}
