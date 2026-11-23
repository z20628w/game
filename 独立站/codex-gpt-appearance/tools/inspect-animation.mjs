import {readFile} from 'node:fs/promises';
import {connect,pageTarget,localSocket} from '../extension/cdp.mjs';
const record=JSON.parse((await readFile(process.argv[2],'utf8')).replace(/^\uFEFF/,''));
const targets=await(await fetch(`http://127.0.0.1:${record.port}/json/list`,{signal:AbortSignal.timeout(2000)})).json();
for(const target of targets.filter(pageTarget)){
  const client=await connect(localSocket(target.webSocketDebuggerUrl,record.port));
  try{
    if(process.argv.includes('--windows')){try{console.log(JSON.stringify({target:target.id,window:await client.call('Browser.getWindowForTarget',{targetId:target.id})}));}catch(error){console.log(error.message);}}
    const result=await client.call('Runtime.evaluate',{expression:`JSON.stringify({visibility:document.visibilityState,reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches,status:window.__aemeathExtension?.status(),overlay:document.getElementById('aemeath-extension-overlay')?.contentDocument?.querySelector('.window')?.dataset})`,returnByValue:true});
    console.log(JSON.stringify({target:target.id,route:new URL(target.url).searchParams.get('initialRoute'),diagnostic:result.result?.value}));
  }finally{client.close();}
}
