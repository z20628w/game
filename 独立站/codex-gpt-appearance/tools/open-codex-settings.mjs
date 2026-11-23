import {connect,pageTarget,localSocket} from '../extension/cdp.mjs';
const port=Number(process.argv[2]);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('请从 Codex Animation 启动后再打开图片设置。');
const response=await fetch(`http://127.0.0.1:${port}/json/list`,{signal:AbortSignal.timeout(2000)});
for(const target of (await response.json()).filter(pageTarget)){
  const client=await connect(localSocket(target.webSocketDebuggerUrl,port));
  try{const result=await client.call('Runtime.evaluate',{expression:'window.__aemeathExtension?.openSettings()',returnByValue:true}); if(result.exceptionDetails)console.error(JSON.stringify(result.exceptionDetails));}finally{client.close();}
}
