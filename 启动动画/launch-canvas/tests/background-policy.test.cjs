const test=require('node:test'),assert=require('node:assert/strict')
const {mkdtemp,mkdir,writeFile,unlink}=require('node:fs/promises')
const {join}=require('node:path'),{tmpdir}=require('node:os'),{randomUUID}=require('node:crypto')
const {enforceBackgroundPolicy}=require('../dist/background-policy')
const {parseManifest}=require('../dist/domain'),{Store}=require('../dist/store'),{applyBackground}=require('../dist/background')
function adapter(executable){return{kind:'electron',executable,args:[],title:'',pagePrefix:'file://',selectors:['#root'],capability:'supported',evidence:[],files:[]}}
test('任意 Electron、伪造支持标记和改名 WorkBuddy 都不能开放背景',async()=>{
  const folder=await mkdtemp(join(tmpdir(),'lc-background-policy-'))
  await mkdir(join(folder,'resources'));await writeFile(join(folder,'resources/app.asar'),'fixture');await writeFile(join(folder,'icudtl.dat'),'fixture')
  for(const name of ['Other.exe','WorkBuddy.exe']){const exe=join(folder,name);await writeFile(exe,'not a real program');assert.equal((await enforceBackgroundPolicy(adapter(exe))).capability,'unavailable')}
  const imported=parseManifest({version:1,name:'Codex',executable:'Other.exe',framework:'electron',capability:'supported',background:{enabled:true,selectors:['body']}},join(folder,'adapter.json'))
  assert.equal(imported.adapter.capability,'unavailable')
})
test('官方安装路径确认后才允许 Codex，换绑其他窗口程序即禁用',async()=>{
  const folder=await mkdtemp(join(tmpdir(),'lc-codex-policy-')),official=join(folder,'ChatGPT.exe');await writeFile(official,'fixture')
  assert.equal((await enforceBackgroundPolicy(adapter(official))).capability,'unavailable')
  assert.equal((await enforceBackgroundPolicy(adapter(official),official)).capability,'supported')
  assert.equal((await enforceBackgroundPolicy({...adapter(official),windowExecutable:join(folder,'Other.exe')},official)).capability,'unavailable')
})
test('Codex 自动更新先迁移官方安装绑定；旧包存在或已删除均可，其他窗口不能借此开放背景',async()=>{
  const folder=await mkdtemp(join(tmpdir(),'lc-codex-update-'))
  const oldRoot=join(folder,'WindowsApps','OpenAI.Codex_26.1027.3384.0_x64__2p2nqsd0c76g0')
  const nextRoot=join(folder,'WindowsApps','OpenAI.Codex_26.1027.6604.0_x64__2p2nqsd0c76g0')
  const old=join(oldRoot,'app','ChatGPT.exe'),next=join(nextRoot,'app','ChatGPT.exe')
  for(const file of [old,next]){await mkdir(require('node:path').dirname(file),{recursive:true});await writeFile(file,'fixture')}
  const value={...adapter(old),kind:'codex',capability:'unavailable',windowExecutable:old,files:[{path:old,purpose:'主程序',action:'绑定'}]}
  const result=await enforceBackgroundPolicy(value,next)
  assert.equal(result.executable,next);assert.equal(result.windowExecutable,next);assert.equal(result.files[0].path,next);assert.equal(result.capability,'supported')
  assert.equal(value.executable,old,'不修改传入配置')
  const {scanInstallation}=require('../dist/detection')
  for(const selected of [old,oldRoot,join(oldRoot,'app')])assert.equal((await scanInstallation(selected,next)).adapter.executable,next)
  await unlink(old)
  assert.equal((await scanInstallation(oldRoot,next)).adapter.capability,'supported')
  const other={...value,windowExecutable:join(folder,'Other.exe')}
  const rejected=await enforceBackgroundPolicy(other,next)
  assert.equal(rejected.executable,old);assert.equal(rejected.capability,'unavailable')
  const impostor={...value,executable:join(folder,'Other','OpenAI.Codex_26.1027.3384.0_x64__2p2nqsd0c76g0','app','ChatGPT.exe'),windowExecutable:undefined}
  assert.equal((await enforceBackgroundPolicy(impostor,next)).capability,'unavailable')
})
test('保存配置及直接调用背景应用都不能绕过禁用规则',async()=>{
  const folder=await mkdtemp(join(tmpdir(),'lc-save-policy-')),store=new Store(folder);await store.load()
  const media={source:'builtin:background',durationMs:1200,enabled:true,fit:'cover',opacity:30}
  const profile={id:randomUUID(),name:'WorkBuddy',createdAt:'',updatedAt:'',adapter:adapter(join(folder,'Other.exe')),cold:{...media},warm:{...media},background:{...media}}
  await store.save(profile);assert.equal(store.data.profiles[0].background.enabled,false);assert.equal(store.data.profiles[0].adapter.capability,'unavailable')
  let called=false;await assert.rejects(applyBackground({call:()=>{called=true}},profile,folder,store),/已确认适配/);assert.equal(called,false)
})
