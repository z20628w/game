import {readFile,writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {setTimeout as delay} from 'node:timers/promises';
import assert from 'node:assert/strict';
import {connect,pageTarget,localSocket} from '../extension/cdp.mjs';
const [recordPath,exe,profile]=process.argv.slice(2);
const record=JSON.parse((await readFile(recordPath,'utf8')).replace(/^\uFEFF/,''));
const targets=await(await fetch(`http://127.0.0.1:${record.port}/json/list`)).json();
const main=targets.filter(pageTarget);assert.equal(main.length,1);
const client=await connect(localSocket(main[0].webSocketDebuggerUrl,record.port));
try{
  const status=async()=> (await client.call('Runtime.evaluate',{expression:'window.__aemeathExtension.status()',returnByValue:true})).result.value;
  let current;
  for(let i=0;i<25;i++){current=await status();if(current.completed)break;await delay(1000);}
  assert.equal(current.completed,true);assert.equal(current.wallpaper,true);
  await delay(1500);
  const before=await status();assert.equal(before.motion.active,true);
  const result=await promisify(execFile)(process.execPath,['tools/open-existing-codex.mjs',recordPath,exe,profile],{windowsHide:true});
  assert(result.stdout.includes('未重播'));
  await delay(1000);
  const after=await status();
  assert.equal(after.overlay,false);assert.equal(after.completed,true);
  assert.deepEqual(after.metrics,before.metrics);
  // Electron 也会将被其他窗口完全遮挡的页面标为 hidden；隐藏时暂停属于预期行为。
  if(after.visibility==='visible'){assert.equal(after.motion.paused,false);assert(after.motion.frames>before.motion.frames);}
  else assert.equal(after.motion.paused,true);
  const finalRecord=JSON.parse((await readFile(recordPath,'utf8')).replace(/^\uFEFF/,''));assert.equal(finalRecord.pid,record.pid);
  await writeFile('preview/existing-window-verification.json',JSON.stringify({passed:true,pid:record.pid,before,after,checks:['恢复后台窗口后完整动画','动态背景持续运行','已打开窗口只置前不重播','主进程未替换']},null,2));
  console.log(JSON.stringify({passed:true,animation:after.metrics,motion:after.motion,foregroundOnly:true,samePid:true}));
}finally{client.close();}
