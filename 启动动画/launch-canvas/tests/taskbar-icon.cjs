const assert=require('node:assert/strict')
const {execFile,spawn}=require('node:child_process')
const {promisify}=require('node:util')
const {mkdir,mkdtemp,writeFile,copyFile}=require('node:fs/promises')
const {join,resolve}=require('node:path')
const {setTimeout:delay}=require('node:timers/promises')
const run=promisify(execFile)
;(async()=>{
  await mkdir('.test-data',{recursive:true});const folder=await mkdtemp(resolve('.test-data/taskbar-'))
  const packageRoot=join(folder,'WindowsApps','OpenAI.Codex_1.0.0.0_x64__2p2nqsd0c76g0')
  const exe=join(packageRoot,'app','ChatGPT.exe'),signal=join(folder,'signal'),helper=resolve('resources/native/TaskbarIcon.exe'),icon=resolve('resources/icon.ico')
  await mkdir(join(packageRoot,'app/resources'),{recursive:true})
  await copyFile(icon,join(packageRoot,'app/resources/icon-chatgpt.ico'))
  await writeFile(join(packageRoot,'AppxManifest.xml'),'<Package><Applications><Application Id="App" Executable="app/ChatGPT.exe"></Application></Applications></Package>')
  await run(join(process.env.WINDIR,'Microsoft.NET/Framework64/v4.0.30319/csc.exe'),['/nologo','/target:winexe','/reference:System.Windows.Forms.dll','/reference:System.Drawing.dll','/out:'+exe,resolve('tests/FixtureApp.cs')],{windowsHide:true})
  const child=spawn(exe,[signal],{stdio:'ignore'});let manager
  try{
    let state
    for(let i=0;i<40;i++){state=JSON.parse((await run(resolve('resources/native/WindowHost.exe'),['state',exe,'','native'],{windowsHide:true})).stdout);if(state.visible)break;await delay(100)}
    assert.ok(state.visible)
    const inspect=async()=>JSON.parse((await run(helper,['inspect',exe,state.handle],{windowsHide:true})).stdout)
    const before=await inspect(),command='"'+exe+'"'
    const repaired=JSON.parse((await run(helper,['repair',exe,state.handle,icon,'LaunchCanvas.IconFixture',command],{windowsHide:true})).stdout)
    assert.equal(repaired.windowId,'LaunchCanvas.IconFixture');assert.equal(repaired.relaunchIcon,icon+',0');assert.equal(repaired.relaunchCommand,command)
    assert.equal(repaired.pid,before.pid);assert.equal(repaired.smallIcon,before.smallIcon,'保留窗口原有图标句柄')
    await assert.rejects(run(helper,['repair',process.execPath,state.handle,icon,'Wrong','wrong'],{windowsHide:true}),/窗口归属不匹配/)
    await assert.rejects(run(helper,['repair',exe,state.handle,join(folder,'missing.ico'),'Wrong','wrong'],{windowsHide:true}),/任务栏图标/)
    assert.deepEqual(await inspect(),repaired)
    const bundle=join(folder,'taskbar-test.cjs')
    await require('esbuild').build({stdin:{contents:"export {repairCodexTaskbar} from './src/taskbar';export {configureBackgroundPolicy} from './src/background-policy'",resolveDir:process.cwd(),loader:'ts'},outfile:bundle,bundle:true,platform:'node',format:'cjs',external:['electron','original-fs']})
    const env={...process.env,LAUNCHCANVAS_DATA_DIR:join(folder,'manager')};delete env.ELECTRON_RUN_AS_NODE
    manager=await require('playwright')._electron.launch({executablePath:resolve('release',require('../package.json').version,'win-unpacked/LaunchCanvas.exe'),env})
    await manager.firstWindow()
    const args={bundle,exe,state,resources:resolve('resources'),id:require('node:crypto').randomUUID()}
    await manager.evaluate(async(_,{bundle,exe,state,resources,id})=>{
      const {repairCodexTaskbar,configureBackgroundPolicy}=process.mainModule.require(bundle)
      // 可信安装注入只存在于隔离测试 bundle；生产仍须官方 Store 登记。
      configureBackgroundPolicy(exe)
      const profile={id,adapter:{kind:'codex',executable:exe,args:[],title:'',pagePrefix:'',selectors:[],capability:'supported',evidence:[],files:[]}}
      await repairCodexTaskbar(profile,state,resources)
      await repairCodexTaskbar(profile,state,resources)
    },args)
    const integrated=await inspect()
    assert.equal(integrated.windowId,'OpenAI.Codex_2p2nqsd0c76g0!App')
    assert.equal(integrated.relaunchIcon,join(packageRoot,'app/resources/icon-chatgpt.ico')+',0')
    assert.ok(integrated.relaunchCommand.endsWith('--launch='+args.id))
    assert.equal(integrated.pid,before.pid)
    console.log('通过：真实测试窗口图标修复、归属保护、原窗口与进程保留、TypeScript 官方清单解析及启幕重启命令。')
  }finally{if(manager)await manager.close();await writeFile(signal+'.quit','quit');for(let i=0;i<30&&child.exitCode===null;i++)await delay(50);if(child.exitCode===null)child.kill()}
})().catch(error=>{console.error(error);process.exitCode=1})
