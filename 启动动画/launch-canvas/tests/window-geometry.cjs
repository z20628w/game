const {_electron}=require('playwright')
const {mkdir,mkdtemp,writeFile,readFile}=require('node:fs/promises')
const {resolve,join}=require('node:path')
const {execFile}=require('node:child_process')
const {promisify}=require('node:util')
const {setTimeout:delay}=require('node:timers/promises')
const assert=require('node:assert/strict')
const run=promisify(execFile)
;(async()=>{
  await mkdir('.test-data',{recursive:true});const folder=await mkdtemp(resolve('.test-data/window-geometry-')),manager=join(folder,'manager'),target=require('electron'),title='LaunchCanvas Geometry Fixture'
  await writeFile(join(folder,'fixture.html'),`<!doctype html><title>${title}</title><body style="margin:0;background:#18263e;color:white"><h1>隔离窗口尺寸测试</h1>`)
  await writeFile(join(folder,'main.cjs'),`
    const {app,BrowserWindow}=require('electron'),fs=require('fs'),path=require('path');app.setPath('userData',path.join(__dirname,'target-data'));let window;
    function options(){return JSON.parse(fs.readFileSync(path.join(__dirname,'bounds.json'),'utf8'))}
    function show(){if(window&&!window.isDestroyed()){window.show();return}const b=options();window=new BrowserWindow({...b,show:false,autoHideMenuBar:true,webPreferences:{backgroundThrottling:false}});window.loadFile(path.join(__dirname,'fixture.html'));window.once('ready-to-show',()=>{if(b.maximized)window.maximize();window.show()})}
    if(!app.requestSingleInstanceLock())app.quit();else{app.on('second-instance',show);app.on('window-all-closed',()=>{});app.whenReady().then(()=>{show();const timer=setInterval(()=>{const file=path.join(__dirname,'command.json');if(!fs.existsSync(file))return;const command=JSON.parse(fs.readFileSync(file,'utf8'));fs.unlinkSync(file);if(command.action==='quit'){clearInterval(timer);app.quit()}else if(command.action==='close')window?.close();else if(command.action==='resize')window?.setBounds(command.bounds);else if(command.action==='minimize')window?.minimize()},40)})}
  `)
  const env={...process.env,LAUNCHCANVAS_DATA_DIR:manager};delete env.ELECTRON_RUN_AS_NODE
  const app=await _electron.launch({executablePath:resolve('release',require('../package.json').version,'win-unpacked/LaunchCanvas.exe'),env})
  const command=async(action,extra={})=>writeFile(join(folder,'command.json'),JSON.stringify({action,...extra}))
  const inspect=async()=>JSON.parse((await run(resolve('resources/native/WindowHost.exe'),['state',target,title,'electron'],{windowsHide:true})).stdout)
  const wait=async predicate=>{for(let i=0;i<70;i++){const s=await inspect();if(predicate(s))return s;await delay(70)}throw Error('等待测试窗口超时')}
  const closeEnough=(a,b,label)=>{for(const k of ['x','y','width','height'])assert.ok(Math.abs(a[k]-b[k])<=1,`${label}.${k}: ${a[k]} != ${b[k]}`)}
  const report=[]
  try{
    const page=await app.firstWindow();await page.waitForSelector('#open-gallery')
    const snapshot=await page.evaluate(()=>window.studio.snapshot()),profile=structuredClone(snapshot.database.profiles[0])
    profile.id=require('crypto').randomUUID();profile.name='窗口尺寸隔离测试';profile.adapter={kind:'electron',executable:target,args:[join(folder,'main.cjs')],title,pagePrefix:'file://',selectors:[],capability:'unavailable',evidence:[],files:[]}
    const builtin=process.argv.includes('--builtin')
    profile.cold.source=builtin?'builtin:cold':'gallery:claude-art:cold';profile.warm.source=builtin?'builtin:eye':'gallery:claude-art:warm';profile.cold.durationMs=4500;profile.warm.durationMs=3300;profile.background.enabled=false
    await page.evaluate(p=>window.studio.save(p),profile)
    const area=await app.evaluate(({screen,app})=>{global.geometryShows=[];app.on('browser-window-created',(_event,window)=>window.on('show',()=>{if(window.webContents.getURL().endsWith('/player.html'))global.geometryShows.push(window.getBounds())}));return screen.getPrimaryDisplay().workArea})
    const initial={x:area.x+40,y:area.y+50,width:Math.min(850,area.width-100),height:Math.min(540,area.height-120)}
    const larger={x:area.x+90,y:area.y+80,width:Math.min(1110,area.width-120),height:Math.min(700,area.height-130)}
    await writeFile(join(folder,'bounds.json'),JSON.stringify(initial))
    const measure=async player=>{
      const state=await inspect(),wanted=await app.evaluate(({screen},s)=>{const outer=screen.screenToDipRect(null,{x:s.x,y:s.y,width:s.width,height:s.height}),client=screen.screenToDipRect(null,{x:s.clientX,y:s.clientY,width:s.clientWidth,height:s.clientHeight});return {outer,client:{x:client.x-outer.x,y:client.y-outer.y,width:client.width,height:client.height}}},state)
      const actual=await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/player.html'));return {outer:w.getBounds(),visible:w.isVisible(),shows:global.geometryShows}})
      const content=await player.locator('canvas, #scene>iframe, #scene>video').evaluate(c=>{const r=c.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})
      return {wanted,actual,content}
    }
    const runLaunch=async(slot,resize)=>{
      const opened=app.waitForEvent('window'),pending=page.evaluate(id=>window.studio.launch(id),profile.id).then(()=>null,error=>error)
      const player=await opened;await player.waitForSelector('canvas, #scene>iframe, #scene>video')
      for(let i=0;i<100;i++){if(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().some(w=>w.webContents.getURL().endsWith('/player.html')&&w.isVisible())))break;await delay(50)}
      let first,after
      try{
        assert.equal((await player.evaluate(()=>window.player.data())).source,profile[slot].source)
        await delay(60);first=await measure(player)
        if(resize){await command('resize',{bounds:resize});await delay(750);after=await measure(player)}
        assert.equal(await pending,null)
      }finally{await pending}
      closeEnough(first.actual.outer,first.wanted.outer,slot+' 窗口边界');closeEnough(first.content,first.wanted.client,slot+' 客户区取景');closeEnough(first.actual.shows.at(-1),first.wanted.outer,slot+' 第一帧边界')
      if(after){closeEnough(after.actual.outer,after.wanted.outer,'运行中窗口变化');closeEnough(after.content,after.wanted.client,'运行中客户区变化')}
      report.push({slot,first,after})
    }
    await runLaunch('cold',larger)
    await command('close');await wait(s=>s.running&&!s.found)
    // 恢复时新窗口刻意与缓存尺寸不同，必须以本次创建的窗口为准。
    await writeFile(join(folder,'bounds.json'),JSON.stringify(initial));await runLaunch('warm')
    await command('quit');await wait(s=>!s.running)
    await writeFile(join(folder,'bounds.json'),JSON.stringify({...larger,maximized:true}));await runLaunch('cold')
    const before=await app.evaluate(()=>global.geometryShows.length);await command('minimize');await wait(s=>s.minimized);await page.evaluate(id=>window.studio.launch(id),profile.id)
    assert.equal(await app.evaluate(()=>global.geometryShows.length),before,'已有窗口最小化时只置前，不重播动画')
    const history=JSON.parse(await readFile(join(manager,'runtime',profile.id+'.launch.json'),'utf8'));assert.ok(history.windowBounds.width>0)
    await writeFile(builtin?'preview/window-geometry-builtin.json':'preview/window-geometry.json',JSON.stringify({passed:true,builtin,checks:['首次冷启动第一帧按真实尺寸','播放中调整大小与位置','恢复时覆盖过期历史尺寸','再次冷启动最大化窗口','内容区取景保持一致','最小化窗口直接置前'],launches:report},null,2));console.log('窗口尺寸与内容区对齐检查全部通过')
  }finally{await command('quit');await wait(s=>!s.running).catch(()=>{});await app.close()}
})().catch(error=>{console.error(error);process.exitCode=1})
