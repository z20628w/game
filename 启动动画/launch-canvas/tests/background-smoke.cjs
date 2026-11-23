const { _electron } = require('playwright')
const { mkdir, writeFile } = require('node:fs/promises')
const { resolve } = require('node:path')
const { createServer } = require('node:net')
const assert = require('node:assert/strict')
const { connect, selectPage } = require('../dist/cdp')
const { applyBackground } = require('../dist/background')
const { Store } = require('../dist/store')
;(async () => {
  const folder = resolve('.test-data/background'); await mkdir(folder, { recursive: true })
  const port = await new Promise(resolve => { const server = createServer(); server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)) }) })
  await writeFile(folder + '/fixture.html', '<!doctype html><html><body style="margin:0"><div id="root" style="height:100vh;background:white;color:#eee"><main class="wb-home-route" style="height:100%;background:rgb(20,20,20)"><h1>独立背景适配测试</h1><textarea style="background:rgb(31,31,31)"></textarea><dialog open style="background:rgb(40,40,40)">浮层保持原底色</dialog></main></div></body></html>')
  await writeFile(folder + '/main.cjs', `const {app,BrowserWindow,protocol,net}=require('electron');protocol.registerSchemesAsPrivileged([{scheme:'app',privileges:{standard:true,secure:true}}]);app.setPath('userData',${JSON.stringify(folder + '/profile')});app.whenReady().then(()=>{const w=new BrowserWindow({width:1000,height:650,webPreferences:{sandbox:true}});protocol.handle('app',()=>net.fetch(require('node:url').pathToFileURL(__dirname+'/fixture.html').href));w.loadURL('app://-/index.html')});app.on('window-all-closed',()=>app.quit())`)
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
  const application = await _electron.launch({ executablePath: require('electron'), args: [folder + '/main.cjs', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=' + port], env })
  let client,manager
  try {
    const page = await application.firstWindow(); await page.waitForSelector('#root')
    const targets = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json()
    client = await connect(selectPage(targets, 'app://-/index.html').webSocketDebuggerUrl)
    const store = new Store(folder + '/assets-store'); await store.load()
    // 仅以已确认 WorkBuddy 的只读安装身份验证渲染模块，页面仍是独立测试宿主。
    const approved=await require('../dist/detection').scanInstallation(process.env.LC_TEST_WORKBUDDY_EXE||'D:/file_address/WorkBuddy/WorkBuddy.exe')
    assert.equal(approved.adapter.capability,'supported')
    const profile = { adapter: approved.adapter, background: { enabled: true, source: 'builtin:background', opacity: 45, fit: 'cover' } }
    await applyBackground(client, profile, resolve('resources'), store)
    await page.waitForFunction(() => window.__launchCanvasBackground?.status().motion.frames > 8)
    assert.equal(await page.locator('#root').evaluate(node => getComputedStyle(node).backgroundColor), 'rgba(0, 0, 0, 0)')
    assert.equal(await page.locator('.wb-home-route').evaluate(node => getComputedStyle(node).backgroundColor), 'rgba(0, 0, 0, 0)', 'WorkBuddy 首页主容器不能遮住背景')
    assert.equal(await page.locator('textarea').evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(31, 31, 31)')
    assert.equal(await page.locator('dialog').evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(40, 40, 40)')
    await page.screenshot({ path: 'preview/06-background-integration.png' })
    for (const source of ['gallery:aurora:background','gallery:chatgpt-anime:background']) {
      profile.background.source=source;await applyBackground(client,profile,resolve('resources'),store)
      await page.waitForFunction(()=>window.__launchCanvasBackground?.status().motion.frames>8)
      assert.equal(await page.locator('#aemeath-living-wallpaper').count(),1)
    }
    await applyBackground(client,profile,resolve('resources'),store,true)
    assert.equal(await page.evaluate(()=>window.__launchCanvasBackground.status().motion.seconds),0)
    await page.waitForTimeout(250)
    assert.equal(await page.evaluate(()=>window.__launchCanvasBackground.status().motion.seconds),0,'交接前背景应等待同一首帧')
    await page.evaluate(()=>window.__launchCanvasBackground.resume())
    await page.waitForFunction(()=>window.__launchCanvasBackground.status().motion.seconds>.1)
    const time=await page.evaluate(()=>window.__launchCanvasBackground.status().motion.seconds)
    await page.evaluate(()=>window.__launchCanvasBackground.resume())
    assert.ok(await page.evaluate(()=>window.__launchCanvasBackground.status().motion.seconds)>=time,'重复恢复不能重置时间线')
    const asset = await store.importAsset(resolve('resources/legacy/assets/eye-open-motion.webm')); profile.background.source = 'asset:' + asset.id
    await applyBackground(client, profile, resolve('resources'), store)
    await page.waitForFunction(() => document.querySelector('video')?.currentTime > .2)
    assert.equal(await page.locator('#aemeath-living-wallpaper').count(), 1)
    profile.adapter.selectors = ['#missing-root']
    await applyBackground(client, profile, resolve('resources'), store)
    assert.equal(await page.locator('#root').evaluate(node=>getComputedStyle(node).backgroundColor),'rgba(0, 0, 0, 0)','使用启幕确认的背景规则，不接受自行替换的选择器')
    profile.background.enabled = false; await applyBackground(client, profile, resolve('resources'), store)
    assert.equal(await page.locator('#aemeath-living-wallpaper').count(), 0)
    assert.equal(await page.locator('#root').evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(255, 255, 255)')
    assert.equal(await page.locator('.wb-home-route').evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(20, 20, 20)')
    // 独立测试宿主验证：已打开窗口应用背景、无接口明确报出，不启动或关闭真实目标软件。
    const bundle=folder+'/foreground-test.cjs'
    await require('esbuild').build({stdin:{contents:"export {Launcher} from './src/launcher';export {Store} from './src/store';export {configureBackgroundPolicy} from './src/background-policy'",resolveDir:process.cwd(),loader:'ts'},outfile:bundle,bundle:true,platform:'node',format:'cjs',external:['electron','original-fs']})
    manager=await _electron.launch({executablePath:process.env.LC_TEST_MANAGER_EXE||resolve('release',require('../package.json').version,'win-unpacked/LaunchCanvas.exe'),env:{...env,LAUNCHCANVAS_DATA_DIR:folder+'/foreground-manager-profile'}})
    await manager.firstWindow()
    const foreground=await manager.evaluate(async(_electron,{bundle,folder,resources,port,target})=>{
      const req=process.mainModule.require.bind(process.mainModule)
      const {Launcher,Store,configureBackgroundPolicy}=req(bundle),fs=req('node:fs/promises'),path=req('node:path')
      const store=new Store(path.join(folder,'foreground-store'));await store.load()
      // 仅在测试 bundle 内将独立 Electron 宿主作为可信安装，生产发现逻辑未替换。
      configureBackgroundPolicy(target)
      const media={source:'builtin:background',enabled:true,fit:'cover',opacity:45,durationMs:1200}
      const p={id:req('node:crypto').randomUUID(),name:'独立置前背景测试',createdAt:'',updatedAt:'',adapter:{kind:'electron',executable:target,args:[],title:'',pagePrefix:'file://',selectors:['#root'],capability:'supported',evidence:[],files:[]},cold:{...media},warm:{...media},background:{...media}}
      store.data.profiles.push(p)
      const runtime=path.join(store.directory,'runtime');await fs.mkdir(runtime,{recursive:true});const session=path.join(runtime,p.id+'.json');await fs.writeFile(session,JSON.stringify({port,executable:target}))
      const events=[],launcher=new Launcher(store,resources,event=>events.push(event))
      const applied=await launcher.launch(p),players=launcher.players.size
      await fs.unlink(session)
      const missing=await launcher.launch(p)
      return{applied,missing,players,messages:events.map(event=>event.message)}
    },{bundle,folder,resources:resolve('resources'),port,target:require('electron')})
    assert.deepEqual(foreground.applied,{action:'foreground',background:'passed'},JSON.stringify(foreground.messages))
    assert.deepEqual(foreground.missing,{action:'foreground',background:'failed'})
    assert.equal(foreground.players,0,'窗口已打开时不能播放动画')
    assert.ok(foreground.messages.some(message=>message.includes('本次运行没有可用的背景接口')))
    const report = { passed: true, checks: ['只读确认 WorkBuddy 安装身份；仅在独立测试页面验证渲染', '本机 CDP 页面连接', '人物动态背景连续绘制', '选择器透明背景', '视频背景播放', '替换背景不叠加', '使用内置已确认规则', '关闭背景还原页面','WorkBuddy 首页容器透明且输入框弹窗保留底色','已打开窗口直接置前并应用背景，不创建播放器','缺少本次运行接口时明确提示失败'] }
    await writeFile('preview/background-smoke.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report))
  } finally { client?.close(); if(manager)await manager.close(); await application.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
