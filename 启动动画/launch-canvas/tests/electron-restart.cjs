const { _electron } = require('playwright')
const { mkdir, mkdtemp, writeFile, readFile } = require('node:fs/promises')
const { resolve, join } = require('node:path')
const { execFile, spawn } = require('node:child_process')
const { promisify } = require('node:util')
const { setTimeout: delay } = require('node:timers/promises')
const assert = require('node:assert/strict')
const run = promisify(execFile)
;(async () => {
  await mkdir('.test-data', { recursive: true })
  const folder = await mkdtemp(resolve('.test-data/electron-restart-')), managerData = join(folder, 'manager'), target = require('electron')
  await writeFile(join(folder, 'fixture.html'), '<!doctype html><html><head><title>Restart Electron Fixture</title></head><body><main id="root" style="height:100vh;background:white">软件重启与背景连接测试</main></body></html>')
  await writeFile(join(folder, 'main.cjs'), `
    const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path');
    app.setPath('userData',path.join(__dirname,'target-profile'));
    fs.writeFileSync(path.join(__dirname,'argv.json'),JSON.stringify(process.argv));
    let window;
    function show(){if(window&&!window.isDestroyed()){window.show();return}window=new BrowserWindow({width:900,height:600,autoHideMenuBar:true,webPreferences:{backgroundThrottling:false}});window.loadFile(path.join(__dirname,'fixture.html'));}
    if(!app.requestSingleInstanceLock())app.quit();
    else{app.on('second-instance',show);app.on('window-all-closed',()=>{});app.whenReady().then(()=>{show();const timer=setInterval(()=>{
      for(const command of ['close','quit']){const file=path.join(__dirname,command);if(fs.existsSync(file)){fs.unlinkSync(file);if(command==='close')window?.close();else{clearInterval(timer);app.quit();}}}
    },40);});}
  `)
  const env = { ...process.env, LAUNCHCANVAS_DATA_DIR: managerData }; delete env.ELECTRON_RUN_AS_NODE
  // 测试宿主固定关闭遮挡节流，避免其他桌面窗口影响后台交接的时间线断言。
  const gallery=process.argv.includes('--gallery'),coldSource=gallery?'gallery:qwen-anime:cold':'builtin:cold',warmSource=gallery?'gallery:qwen-anime:warm':'builtin:eye'
  await mkdir(managerData,{recursive:true})
  const legacyMedia={source:'builtin:background',durationMs:1200,enabled:true,fit:'cover',opacity:30}
  const legacy={id:require('node:crypto').randomUUID(),name:'旧版未确认 Electron',createdAt:'',updatedAt:'',adapter:{kind:'electron',executable:target,args:[join(folder,'main.cjs')],title:'Restart Electron Fixture',pagePrefix:'file://',selectors:['#root'],capability:'candidate',evidence:[],files:[]},cold:{...legacyMedia},warm:{...legacyMedia},background:{...legacyMedia}}
  await writeFile(join(managerData,'profiles.json'),JSON.stringify({version:1,profiles:[legacy],assets:[]}))
  const application = await _electron.launch({ executablePath: resolve('release', require('../package.json').version, 'win-unpacked/LaunchCanvas.exe'), env })
  const state = async () => JSON.parse((await run(resolve('resources/native/WindowHost.exe'), ['state', target, 'Restart Electron Fixture', 'electron'], { windowsHide: true })).stdout)
  const waitState = async predicate => { for (let i=0;i<60;i++) { const value=await state(); if(predicate(value))return value; await delay(80) } throw Error('Electron 测试状态超时') }
  try {
    const page = await application.firstWindow(); await page.waitForSelector('.page-heading')
    const snapshot=await page.evaluate(()=>window.studio.snapshot()), profile=structuredClone(snapshot.database.profiles[0])
    assert.equal(snapshot.database.profiles[0].adapter.capability,'unavailable');assert.equal(snapshot.database.profiles[0].background.enabled,false);
    await page.locator('[data-slot="background"]').click();assert.equal(await page.locator('#enabled').isDisabled(),true);assert.equal(await page.locator('#import-media').isDisabled(),true);await page.screenshot({path:'preview/background-disabled.png'});await page.locator('[data-slot="warm"]').click();
    profile.id=require('node:crypto').randomUUID();profile.name='Electron 重启测试'
    profile.adapter={kind:'electron',executable:target,args:[join(folder,'main.cjs')],title:'Restart Electron Fixture',pagePrefix:'file://',selectors:['#root'],capability:'supported',evidence:[],files:[]}
    profile.cold.durationMs=1200;profile.warm.durationMs=700
    profile.cold.source=coldSource;profile.warm.source=warmSource
    if(gallery)profile.background.source='gallery:qwen-anime:background'
    profile.background.enabled=true;const saved=await page.evaluate(profile=>window.studio.save(profile),profile);const normalized=saved.database.profiles.find(p=>p.id===profile.id);assert.equal(normalized.adapter.capability,'unavailable');assert.equal(normalized.background.enabled,false)
    const launch=async expected=>{
      const opened=application.waitForEvent('window')
      const pending=page.evaluate(id=>window.studio.launch(id),profile.id).then(()=>null,error=>error)
      let measuredBounds,expectedBounds
      const player=await opened;await player.waitForFunction(()=>!!window.player)
      assert.equal((await player.evaluate(()=>window.player.data())).source,expected)
      if(gallery&&expected===warmSource){
        const history=JSON.parse(await readFile(join(managerData,'runtime',profile.id+'.launch.json'),'utf8'))
        const bounds=history.windowBounds
        const wanted=await application.evaluate(({screen},b)=>screen.screenToDipRect(null,{x:b.x,y:b.y,width:b.width,height:b.height}),bounds)
        const actual=await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/player.html')).getContentBounds())
        measuredBounds=actual;expectedBounds=wanted
      }
      assert.equal(await pending,null)
      if(expectedBounds)assert.deepEqual(measuredBounds,expectedBounds,'预热的恢复遮层应匹配记录的完整窗口边界')
      const entries=(await readFile(join(managerData,'launch.log'),'utf8')).trim().split('\n').map(line=>JSON.parse(line))
      assert.equal(entries.at(-1).stage,'done',entries.at(-1).message)
      const argv=JSON.parse(await readFile(join(folder,'argv.json'),'utf8'));assert(!argv.some(arg=>arg.startsWith('--remote-debugging-')),'未确认软件不得自动开放背景调试接口')
      await assert.rejects(readFile(join(managerData,'runtime',profile.id+'.json'),'utf8'),{code:'ENOENT'})
      return null
    }
    const first=await launch(coldSource)
    const calibration=await page.evaluate(id=>window.studio.calibrationBegin(id),profile.id)
    const candidate=calibration.windows.find(window=>window.executable===target&&window.title==='Restart Electron Fixture');assert.ok(candidate)
    await page.evaluate(({id,handle})=>window.studio.calibrationBind(id,handle,'Restart Electron Fixture'),{id:calibration.sessionId,handle:candidate.handle})
    await assert.rejects(page.evaluate(id=>window.studio.calibrationTest(id,'background'),calibration.sessionId),/未适配或未启用/)
    await page.evaluate(id=>window.studio.calibrationEnd(id),calibration.sessionId)
    await writeFile(join(folder,'close'),'close');await waitState(value=>value.running&&!value.found)
    await launch(warmSource)
    await writeFile(join(folder,'quit'),'quit');await waitState(value=>!value.running)
    await launch(coldSource)
    await writeFile(join(folder,'quit'),'quit');await waitState(value=>!value.running)
    const external=spawn(target,[join(folder,'main.cjs')],{env,windowsHide:false,stdio:'ignore'})
    await new Promise((resolve,reject)=>{external.once('spawn',resolve);external.once('error',reject)});await waitState(value=>value.visible)
    await writeFile(join(folder,'close'),'close');await waitState(value=>value.running&&!value.found)
    profile.background.enabled=false;await page.evaluate(profile=>window.studio.save(profile),profile)
    const started=Date.now();await page.evaluate(id=>window.studio.launch(id),profile.id)
    assert(Date.now()-started<6000,'关闭背景后，不应等待不存在的背景接口');assert((await state()).visible)
    const report={passed:true,checks:['打包版启动真实 Electron 软件','未确认软件伪造支持标记后仍禁用背景','窗口校准不能开放背景','关闭窗口后恢复动画正常','彻底退出后冷启动正常','未确认软件不注入调试参数或建立背景接口','不等待外部实例的调试接口']}
    await writeFile('preview/electron-restart.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report))
  } finally {await writeFile(join(folder,'quit'),'quit');await waitState(value=>!value.running).catch(()=>{});await application.close()}
})().catch(error=>{console.error(error);process.exitCode=1})
