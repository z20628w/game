const {_electron}=require('playwright')
const {mkdir,mkdtemp,writeFile,readFile}=require('node:fs/promises')
const {join,resolve}=require('node:path')
const {execFile}=require('node:child_process')
const {promisify}=require('node:util')
const {setTimeout:delay}=require('node:timers/promises')
const {randomUUID}=require('node:crypto')
const assert=require('node:assert/strict')
const run=promisify(execFile)
;(async()=>{
  await mkdir('.test-data',{recursive:true});const folder=await mkdtemp(resolve('.test-data/launcher-bridge-')),install=join(folder,'BridgeFixture'),actualDir=join(install,'app'),manager=join(folder,'manager')
  await mkdir(actualDir,{recursive:true});await mkdir(manager,{recursive:true})
  const entry=join(install,'BridgeFixture.exe'),actual=join(actualDir,'BridgeFixture.exe'),compiler=join(process.env.WINDIR,'Microsoft.NET/Framework64/v4.0.30319/csc.exe')
  await run(compiler,['/nologo','/target:winexe','/out:'+entry,resolve('tests/fixtures/BridgeLauncher.cs')],{windowsHide:true})
  await run(compiler,['/nologo','/target:winexe','/reference:System.Windows.Forms.dll','/reference:System.Drawing.dll','/out:'+actual,resolve('tests/fixtures/BridgeWindow.cs')],{windowsHide:true})
  await writeFile(join(actualDir,'resources.pak'),'');await writeFile(join(actualDir,'icudtl.dat'),'')
  const media={durationMs:800,enabled:true,fit:'cover',opacity:100}
  const profile={id:randomUUID(),name:'桥接测试',createdAt:'',updatedAt:'',adapter:{kind:'native',executable:entry,args:[],title:'LaunchCanvas Bridge Fixture',pagePrefix:'',selectors:['#root'],capability:'unavailable',evidence:[],files:[]},cold:{...media,source:'gallery:doubao-art:cold'},warm:{...media,source:'gallery:doubao-art:warm'},background:{...media,source:'gallery:doubao-art:background',durationMs:0,enabled:false}}
  await writeFile(join(manager,'profiles.json'),JSON.stringify({version:1,profiles:[profile],assets:[]}))
  const env={...process.env,LAUNCHCANVAS_DATA_DIR:manager};delete env.ELECTRON_RUN_AS_NODE
  const application=await _electron.launch({executablePath:resolve('release',require('../package.json').version,'win-unpacked/LaunchCanvas.exe'),env})
  const state=async()=>JSON.parse((await run(resolve('resources/native/WindowHost.exe'),['state',actual,'LaunchCanvas Bridge Fixture','electron'],{windowsHide:true})).stdout)
  const wait=async predicate=>{for(let i=0;i<70;i++){const s=await state();if(predicate(s))return s;await delay(80)}throw Error('桥接测试进程状态超时')}
  try{
    const page=await application.firstWindow();await page.waitForSelector('#open-gallery')
    const migrated=(await page.evaluate(()=>window.studio.snapshot())).database.profiles[0]
    assert.equal(migrated.adapter.executable,entry);assert.equal(migrated.adapter.windowExecutable,actual);assert.equal(migrated.adapter.processModel,'chromium');assert.deepEqual(migrated.cold,profile.cold);assert.deepEqual(migrated.warm,profile.warm)
    const launch=async slot=>{
      const opened=application.waitForEvent('window'),pending=page.evaluate(id=>window.studio.launch(id),profile.id).then(()=>null,e=>e)
      const player=await opened;await player.waitForFunction(()=>!!window.player);const source=(await player.evaluate(()=>window.player.data())).source
      assert.equal(await pending,null);assert.equal(source,profile[slot].source)
    }
    await launch('cold');const first=await state();assert.equal(first.mainProcessIds.length,1);assert.ok(first.helperCount>=1)
    const before=application.windows().length;await page.evaluate(id=>window.studio.launch(id),profile.id);assert.equal(application.windows().length,before,'窗口已打开时不能再次播放冷启动')
    await writeFile(join(actualDir,'close'),'close');await wait(s=>s.running&&!s.found);await launch('warm')
    await writeFile(join(actualDir,'quit'),'quit');await wait(s=>!s.running&&s.helperCount>0);await launch('cold')
    const log=(await readFile(join(manager,'launch.log'),'utf8')).trim().split('\n').map(s=>JSON.parse(s));assert.ok(!log.some(e=>e.stage==='failed'))
    const report={passed:true,checks:['旧配置自动分离启动入口与窗口程序并保留动画','启动器退出后仍识别真实窗口','已打开窗口直接置前','关闭窗口后恢复动画','排除残留 Chromium 子进程后使用冷启动','整个流程不误报主进程退出']}
    await writeFile('preview/launcher-bridge.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report))
  }finally{await writeFile(join(actualDir,'quit'),'quit');await writeFile(join(actualDir,'quit-helper'),'quit');await wait(s=>!s.running&&s.helperCount===0).catch(()=>{});await application.close()}
})().catch(e=>{console.error(e);process.exitCode=1})
