import { BrowserWindow, screen, app } from 'electron'
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises'
import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join, dirname } from 'node:path'
import { createServer } from 'node:net'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import type { AdapterKind, LaunchEvent, PlayerData, Profile, Slot, LaunchResult, HandoffFrame } from './shared'
import { mediaKind, mediaURL } from './shared'
import { Store } from './store'
import { connect, selectPage, type CDP, type Target } from './cdp'
import { applyBackground } from './background'
import { repairCodexTaskbar } from './taskbar'
import { discoverCodex, exists } from './detection'
import { parseGallerySource } from './catalog'
import { resolveVideoSource } from './video-catalog'
import { enforceProfileBackground, backgroundPolicyMessage, configureBackgroundPolicy } from './background-policy'
const run = promisify(execFile)
const windowExecutable=(profile:Profile)=>profile.adapter.windowExecutable||profile.adapter.executable
const windowModel=(profile:Profile):AdapterKind=>profile.adapter.processModel==='chromium'?'electron':profile.adapter.kind
interface WindowState { running: boolean; mainProcessIds: number[]; helperCount: number; unknownProcessIds: number[]; found: boolean; foreground:boolean; handle:string; pid: number; visible: boolean; minimized: boolean; x: number; y: number; width: number; height: number; clientX: number; clientY: number; clientWidth: number; clientHeight: number }
interface SessionRecord { port: number; executable: string }
interface Player { window: BrowserWindow; data: PlayerData; geometryKey?:string; ready: Promise<void>; finish: Promise<void>; acknowledge(error?: string): void; complete(): void }
export class Launcher {
  readonly players = new Map<number, Player>()
  private active = new Set<string>()
  isLaunching(id: string) { const profile = this.store.data.profiles.find(item => item.id === id); return !!profile && this.active.has(windowExecutable(profile).toLowerCase()) }
  constructor(readonly store: Store, readonly resources: string, readonly emit: (event: LaunchEvent) => void) {}
  async native(mode: string, executable: string, title: string, kind: AdapterKind = 'native',windowClass=''): Promise<WindowState> { const result = await run(join(this.resources, 'native/WindowHost.exe'), [mode, executable, title, kind,windowClass], { windowsHide: true, timeout: 4000 }); return JSON.parse(result.stdout) }
  async inspect(profile: Profile) {
    const state = await this.native('state', windowExecutable(profile), profile.adapter.title, windowModel(profile),profile.adapter.windowClass)
    if (!state.running && state.unknownProcessIds.length) throw Error('无法确认目标软件的主进程状态，请确保启幕与目标软件使用相同的权限运行')
    return state
  }
  async verifyPort(port: number, executable: string): Promise<boolean> {
    if (!Number.isInteger(port) || port < 1024 || port > 65535) return false
    try { const result = await run(join(this.resources, 'native/PortOwner.exe'), [String(port), executable], { windowsHide: true, timeout: 2500 }); return !!JSON.parse(result.stdout) } catch { return false }
  }
  private async freePort() { return new Promise<number>((resolve, reject) => { const server = createServer(); server.on('error', reject); server.listen(0, '127.0.0.1', () => { const address = server.address(); const port = typeof address === 'object' && address ? address.port : 0; server.close(() => resolve(port)) }) }) }
  private async session(profile: Profile): Promise<SessionRecord | null> {
    const candidates = [join(this.store.directory, 'runtime', profile.id + '.json')]
    if (profile.adapter.kind === 'codex') candidates.push(join(process.env.LOCALAPPDATA ?? '', 'OpenAI/ChatGPTFix/runtime-port.json'))
    for (const file of candidates) { try { const record = JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, '')); if (await this.verifyPort(record.port, windowExecutable(profile))) return { port: record.port, executable: windowExecutable(profile) } } catch {} }
    return null
  }
  async verifyBackground(profile:Profile){
    profile=await enforceProfileBackground(profile)
    if(profile.adapter.capability!=='supported')throw Error(backgroundPolicyMessage)
    if(!profile.background.enabled)throw Error('请先在软件背景中启用并保存背景设置')
    const session=await this.session(profile)
    if(!session)throw Error('本次运行没有可用的背景接口。请在目标软件中保存需要保留的文件并手动完整退出该软件，再进行冷启动验证；无需重新保存启幕配置')
    const targets=await (await fetch('http://127.0.0.1:'+session.port+'/json/list',{signal:AbortSignal.timeout(2000)})).json() as Target[]
    const target=selectPage(targets,profile.adapter.pagePrefix)
    if(!target)throw Error('没有找到匹配的背景页面，需要单独适配页面规则')
    const url=new URL(target.webSocketDebuggerUrl)
    if(url.hostname!=='127.0.0.1'||Number(url.port)!==session.port)throw Error('背景接口归属不匹配')
    const client=await connect(url.href)
    try{await applyBackground(client,profile,this.resources,this.store)}finally{client.close()}
  }
  async removeUnsupportedBackground(profile:Profile){
    const file=join(this.store.directory,'runtime',profile.id+'.json')
    const session=await this.session(profile)
    if(!session){await unlink(file).catch(()=>{});return}
    let client:CDP|undefined
    try{
      const targets=await (await fetch('http://127.0.0.1:'+session.port+'/json/list',{signal:AbortSignal.timeout(2000)})).json() as Target[]
      const target=selectPage(targets,profile.adapter.pagePrefix)
      if(target){const url=new URL(target.webSocketDebuggerUrl);if(url.hostname!=='127.0.0.1'||Number(url.port)!==session.port)throw Error('旧背景接口归属不匹配');client=await connect(url.href);await client.call('Runtime.evaluate',{expression:'window.__launchCanvasBackground?.dispose()'},2500)}
      await unlink(file).catch(()=>{})
    }finally{client?.close()}
  }
  private geometry(state?:WindowState){
    if(!state?.found||state.minimized||state.width<320||state.height<200)return null
    const bounds=screen.screenToDipRect(null,{x:state.x,y:state.y,width:state.width,height:state.height})
    const client=state.clientWidth>=320&&state.clientHeight>=200?screen.screenToDipRect(null,{x:state.clientX,y:state.clientY,width:state.clientWidth,height:state.clientHeight}):bounds
    return {bounds,viewport:{x:client.x-bounds.x,y:client.y-bounds.y,width:client.width,height:client.height}}
  }
  private alignPlayer(player:Player,state:WindowState){
    const geometry=this.geometry(state)
    if(!geometry||player.window.isDestroyed())return false
    const key=JSON.stringify(geometry)
    if(player.geometryKey!==key){
      player.geometryKey=key;player.data.viewport=geometry.viewport
      player.window.setBounds(geometry.bounds,false)
      player.window.webContents.send('player:viewport',geometry.viewport)
    }
    return true
  }
  async createPlayer(profile: Profile, slot: Slot, preview: boolean, state?: WindowState): Promise<Player> {
    const setting = profile[slot]
    let bounds = { width: 1000, height: 650, x: 0, y: 0 }
    const geometry=!preview?this.geometry(state):null
    if (geometry) bounds = geometry.bounds
    else { const area = screen.getPrimaryDisplay().workArea; bounds.width = Math.min(1000, area.width - 80); bounds.height = Math.min(650, area.height - 80); bounds.x = Math.round(area.x + (area.width - bounds.width) / 2); bounds.y = Math.round(area.y + (area.height - bounds.height) / 2) }
    const data: PlayerData = { name: profile.name, source: setting.source, url: mediaURL(setting.source), slot, kind: slot === 'background' && setting.source === 'builtin:background' ? 'living' : mediaKind(setting.source, this.store.data.assets), durationMs: slot === 'background' ? 6000 : setting.durationMs, fit: setting.fit, opacity: slot === 'background' ? setting.opacity : 100, preview }
    if(geometry)data.viewport=geometry.viewport
    const video = resolveVideoSource(setting.source)
    if (video) {
      data.kind = 'video'
      if (slot !== 'background') {
        data.durationMs = video.durationMs
        const selectedBackground = profile.background.enabled ? resolveVideoSource(profile.background.source) : null
        const backgroundSource = 'gallery:' + (selectedBackground?.themeId ?? video.themeId) + ':background'
        const matched = (!selectedBackground || selectedBackground.themeId === video.themeId) && (!selectedBackground || profile.background.fit === setting.fit)
        data.videoTimeline = { backgroundSource, backgroundURL: mediaURL(backgroundSource), loopEntrySeconds: matched ? video.handoffSeconds : 0, fit: selectedBackground ? profile.background.fit : setting.fit, opacity: profile.background.enabled ? profile.background.opacity : 100, matched }
      }
    }
    const gallery = !video ? parseGallerySource(setting.source) : null
    if (gallery) {
      data.kind = 'gallery'
      data.gallery = { theme: gallery.theme, mode: slot, durationMs: data.durationMs, fit: data.fit, opacity: data.opacity,
        imageURL: gallery.theme.image ? 'data:image/png;base64,' + (await readFile(join(this.resources, 'gallery', gallery.theme.image))).toString('base64') : undefined,
        closedURL: gallery.theme.image && slot !== 'cold' ? 'data:image/png;base64,' + (await readFile(join(this.resources, 'gallery', gallery.theme.id + '-closed.png'))).toString('base64') : undefined }
      if (slot === 'warm' && gallery.theme.image) {
        const layers = await Promise.all(['actor','stage'].map(async layer => 'data:image/png;base64,' + (await readFile(join(this.resources, 'gallery/linked', gallery.theme.id + '-' + layer + '.png'))).toString('base64')))
        data.gallery.actorURL = layers[0]; data.gallery.stageURL = layers[1]
      }
      const background=slot==='warm'&&profile.background.enabled?parseGallerySource(profile.background.source):null
      if(background&&(background.theme.id!==gallery.theme.id||profile.background.fit!==setting.fit)){
        const imageURL=background.theme.image?'data:image/png;base64,'+(await readFile(join(this.resources,'gallery',background.theme.image))).toString('base64'):undefined
        data.gallery.handoff={theme:background.theme,mode:'background',durationMs:6000,imageURL,fit:profile.background.fit}
      }
    }
    if (data.kind === 'living') {
      const textures = await Promise.all(['artwork.jpg', 'artwork-blink.jpg'].map(async name => 'data:image/jpeg;base64,' + (await readFile(join(this.resources, 'legacy/assets', name))).toString('base64')))
      data.url = textures[0]; data.blinkURL = textures[1]
    }
    // 先读完依赖素材；文件缺失时不会遗留未注册的隐藏窗口或就绪计时器。
    const window = new BrowserWindow({ ...bounds, show: false, frame: false, backgroundColor: '#081411', resizable: false, alwaysOnTop: !preview, skipTaskbar: !preview, title: '启幕 · 动画预览', webPreferences: { preload: join(__dirname, 'player-preload.js'), sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } })
    let readyResolve!: () => void, readyReject!: (error: Error) => void, finishResolve!: () => void, finishReject!: (error: Error) => void
    const ready = new Promise<void>((resolve, reject) => { readyResolve = resolve; readyReject = reject })
    const finish = new Promise<void>((resolve, reject) => { finishResolve = resolve; finishReject = reject })
    // 背景接入与播放并行，先保存播放失败，后续 await 时再统一展示错误。
    void finish.catch(() => {})
    const timer = setTimeout(() => readyReject(Error('媒体准备超时，请换用较小的 MP4、WebM 或图片')), 12000)
    const player: Player = { window, data, ready, finish, acknowledge(error) { clearTimeout(timer); error ? readyReject(Error(error)) : readyResolve() }, complete() { finishResolve() } }
    this.players.set(window.webContents.id, player)
    window.webContents.ipc.on('player:failed', (_event, error: string) => { readyReject(Error(error)); finishReject(Error(error)) })
    const id = window.webContents.id
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.on('closed', () => { clearTimeout(timer); this.players.delete(id); readyReject(Error('预览已关闭')); finishResolve() })
    void window.loadFile(join(__dirname, 'player.html')).catch(error => player.acknowledge(error.message))
    try { await ready; return player } catch (error) { if (!window.isDestroyed()) window.destroy(); throw error }
  }
  async preview(profile: Profile, slot: Slot) {
    if (slot === 'background' && (await enforceProfileBackground(profile)).adapter.capability !== 'supported') throw Error(backgroundPolicyMessage)
    const player = await this.createPlayer(profile, slot, true)
    try { player.window.show(); player.window.webContents.send('player:play'); await player.finish }
    finally { if (!player.window.isDestroyed()) player.window.close() }
  }
  private async waitMarker(path: string, suffix: string, timeout = 4000) { const end = Date.now() + timeout; while (Date.now() < end) { if (await exists(path + suffix)) return; await delay(25) } throw Error('窗口显示保护等待超时') }
  async launch(original: Profile,expected?:'cold'|'warm'|'foreground'): Promise<LaunchResult> {
    let profile = structuredClone(original)
    if (profile.adapter.kind === 'codex') { const next = await discoverCodex().catch(() => ''); if (next) configureBackgroundPolicy(next) }
    profile=await enforceProfileBackground(profile)
    if (JSON.stringify(profile.adapter) !== JSON.stringify(original.adapter)) await this.store.save(profile)
    const executable = profile.adapter.executable
    const monitored=windowExecutable(profile),model=windowModel(profile)
    if (!executable || !await exists(executable)) throw Error('未找到目标软件，请重新选择安装目录')
    if(!await exists(monitored))throw Error('窗口监测程序不存在，请重新绑定软件安装目录')
    if ([executable,monitored].some(file=>file.toLowerCase()===process.execPath.toLowerCase())) throw Error('不能把启幕自身配置为启动目标')
    const key = monitored.toLowerCase()
    if (this.active.has(key)) {if(expected)throw Error('软件正在启动，请等待本次启动完成');return {action:'foreground',background:'skipped'}}
    this.active.add(key)
    const report = (stage: string, message: string, error = false) => this.emit({ profileId: profile.id, stage, message, error })
    let player: Player | undefined, guard: ReturnType<typeof spawn> | undefined, signal = '', client: CDP | undefined
    let tracking=false,tracker:Promise<void>|undefined
    try {
      report('checking', '检查软件窗口…')
      if(profile.adapter.capability!=='supported')await this.removeUnsupportedBackground(profile).catch(()=>report('partial','背景已禁用；若仍显示旧背景，请正常退出目标软件后重新打开'))
      const checkExpected=(current:WindowState)=>{
        if(expected==='cold'&&current.running)throw Error(`「${profile.name}」仍在运行。请在该软件中保存需要保留的文件并完整退出，再验证冷启动；启幕绑定已保存`)
        if(expected==='warm'&&(!current.running||current.visible||current.minimized))throw Error('请手动关闭目标窗口并保留后台进程，再验证恢复；若关闭窗口会退出软件，则该软件没有后台恢复状态')
        if(expected==='foreground'&&!(current.visible||current.minimized))throw Error('请先打开目标窗口，再验证直接置前')
      }
      const foregroundBackground = async (): Promise<LaunchResult> => {
        await repairCodexTaskbar(profile, await this.inspect(profile), this.resources).catch(error => report('partial', '任务栏图标暂未修复：' + (error as Error).message))
        if (profile.adapter.capability !== 'supported' || !profile.background.enabled) {
          report('done', '窗口已置前，没有重播动画')
          return { action: 'foreground', background: 'skipped' }
        }
        try {
          await this.verifyBackground(profile)
          report('done', '窗口已置前，背景设置已应用')
          return { action: 'foreground', background: 'passed' }
        } catch (error) {
          report('partial', '窗口已置前，背景尚未接入：' + (error as Error).message)
          return { action: 'foreground', background: 'failed' }
        }
      }
      let state = await this.inspect(profile)
      checkExpected(state)
      if (state.visible || state.minimized) { const activated=await this.native('activate', monitored, profile.adapter.title, model,profile.adapter.windowClass);if(expected==='foreground'&&!activated.foreground)throw Error('已找到窗口，但系统没有允许切换到前台；请检查软件权限后重试');return await foregroundBackground() }
      // 关闭主进程后，渲染、GPU 和崩溃处理进程可能仍在退出；只认主进程，并复查退出时序。
      await delay(150); state = await this.inspect(profile)
      checkExpected(state)
      const originalMainIds=state.mainProcessIds
      const historyFile = join(this.store.directory, 'runtime', profile.id + '.launch.json')
      const history = await readFile(historyFile, 'utf8').then(text => JSON.parse(text)).catch(() => null)
      const firstLaunch = history?.executable?.toLowerCase() !== executable.toLowerCase()
      const playerState=(current:WindowState)=>{
        const cached=history?.windowBounds
        if(current.found||firstLaunch||!cached)return current
        const keys=['x','y','width','height','clientX','clientY','clientWidth','clientHeight'] as const
        if(!keys.every(key=>Number.isFinite(cached[key]))||cached.clientWidth<320||cached.clientHeight<200)return current
        return {...current,...Object.fromEntries(keys.map(key=>[key,cached[key]])),found:true} as WindowState
      }
      let slot: Slot = expected==='warm'?'warm':firstLaunch || !state.running ? 'cold' : 'warm'
      report('decision', `主进程 ${state.mainProcessIds.join(',') || '无'}；辅助进程 ${state.helperCount}；首次开场 ${firstLaunch ? '是' : '否'}；动画 ${slot === 'cold' ? '冷启动' : '恢复'}`)
      report('preparing', firstLaunch ? '首次使用此软件组，准备完整开场…' : state.running ? '准备恢复动画…' : '准备启动动画…')
      if (profile[slot].enabled) player = await this.createPlayer(profile, slot, false, playerState(state))
      const preparedState = await this.inspect(profile)
      checkExpected(preparedState)
      if (preparedState.visible || preparedState.minimized) { const activated=await this.native('activate', monitored, profile.adapter.title, model,profile.adapter.windowClass);if(expected==='foreground'&&!activated.foreground)throw Error('系统未允许窗口置前，请检查权限后重试');return await foregroundBackground() }
      if (preparedState.running !== state.running) {
        if (player && !player.window.isDestroyed()) player.window.destroy()
        player = undefined; state = preparedState; slot = firstLaunch || !state.running ? 'cold' : 'warm'
        report('preparing', state.running ? '准备恢复动画…' : '软件已退出，准备冷启动动画…')
        if (profile[slot].enabled) player = await this.createPlayer(profile, slot, false, playerState(state))
      } else state = preparedState
      await mkdir(join(this.store.directory, 'runtime'), { recursive: true })
      signal = join(this.store.directory, 'runtime', randomUUID())
      const ensureGuard = async () => {
        if (guard) return
        guard = spawn(join(this.resources, 'native/WindowHost.exe'), ['guard', monitored, signal, profile.adapter.title, model,profile.adapter.windowClass||''], { windowsHide: true, stdio: 'ignore' })
        await new Promise<void>((resolve, reject) => { guard!.once('spawn', resolve); guard!.once('error', reject) })
        await this.waitMarker(signal, '.armed')
      }
      // 先保护目标窗口，再启动软件；没有真实尺寸前只准备画面，不显示猜测大小的动画。
      if (player) await ensureGuard()
      let session: SessionRecord | null = null, childExit: number | null = null, spawnSerial = 0
      const startTarget = async (cold: boolean) => {
        session = cold ? null : await this.session(profile)
        if (cold) await unlink(join(this.store.directory, 'runtime', profile.id + '.json')).catch(() => {})
        const args = [...profile.adapter.args]
        if (profile.adapter.capability === 'supported') {
          session ??= { port: await this.freePort(), executable:monitored }
          // 恢复请求恰逢旧主进程退出时，新实例也必须带上背景接口参数。
          args.push('--remote-debugging-address=127.0.0.1', '--remote-debugging-port=' + session.port)
        }
        if (profile.adapter.kind === 'codex') args.push('--user-data-dir=' + join(app.getPath('appData'), 'Codex/web/Codex'))
        const child = spawn(executable, args, { cwd: dirname(executable), windowsHide: false, detached: true, stdio: 'ignore' })
        const serial = ++spawnSerial
        childExit = null; child.once('exit', code => { if (serial === spawnSerial) childExit = code })
        await new Promise<void>((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject) }); child.unref()
      }
      await startTarget(!state.running)
      report('launching', state.running ? '恢复原软件窗口，确认窗口大小…' : '软件正在启动，等待实际窗口大小…')
      let visibleState = state
      let deadline = Date.now() + 20000, missing = 0, stable = 0, lastGeometry = ''
      let retried = false
      while (Date.now() < deadline) {
        visibleState = await this.inspect(profile)
        if (visibleState.running && visibleState.found && (visibleState.visible || visibleState.minimized)) {
          const signature=JSON.stringify([visibleState.handle,this.geometry(visibleState)])
          stable = lastGeometry === signature ? stable + 1 : 1; lastGeometry = signature
          if (stable >= 2) break
        } else { stable = 0; lastGeometry = '' }
        missing = visibleState.running ? 0 : missing + 1
        if (missing >= 3 && slot === 'warm' && !retried) {
          if(expected==='warm')throw Error('恢复过程中原主进程已退出，本次不能记为恢复成功')
          retried = true; slot = 'cold'
          report('preparing', '原主进程已退出，改为重新启动软件…')
          const previous = player
          player = profile.cold.enabled ? await this.createPlayer(profile, 'cold', false,playerState(visibleState)) : undefined
          if (player) await ensureGuard()
          if (previous && !previous.window.isDestroyed()) previous.window.destroy()
          await startTarget(true); deadline = Date.now() + 20000; missing = 0
        } else if (missing >= 3 && slot === 'cold' && childExit !== null && childExit !== 0) throw Error('目标软件在主窗口出现前退出，退出代码：' + childExit)
        await delay(180)
      }
      if (stable < 2) throw Error(visibleState.running ? '软件主进程仍在运行，但没有显示主窗口；请稍后重试或正常退出目标软件后再启动' : '目标软件的主进程已经退出，未能打开主窗口；请检查目标软件自身的启动情况')
      // 退出中的旧进程可能与新主进程重叠，不能只用 running 是否出现 false 判断重启。
      // 此时播放器尚未显示；根据真正承载窗口的进程更换开场，避免先播恢复再播冷启动。
      if(slot==='warm'&&!originalMainIds.includes(visibleState.pid)){
        if(expected==='warm')throw Error('原后台进程已退出，当前窗口属于新主进程；请改为验证冷启动')
        report('decision',`窗口主进程由 ${originalMainIds.join(',')||'无'} 变为 ${visibleState.pid}；原实例已退出，切换冷启动动画`)
        const previous=player
        player=profile.cold.enabled?await this.createPlayer(profile,'cold',false,visibleState):undefined
        if(player)await ensureGuard()
        if(previous&&!previous.window.isDestroyed())previous.window.destroy()
        slot='cold'
      }
      report('window-ready',`主窗口进程 ${visibleState.pid}；动画 ${slot==='cold'?'冷启动':'恢复'}`)
      await repairCodexTaskbar(profile, visibleState, this.resources).catch(error => report('partial', '任务栏图标暂未修复：' + (error as Error).message))
      if(player){
        if(visibleState.minimized){await this.native('activate',monitored,profile.adapter.title,model,profile.adapter.windowClass);visibleState=await this.inspect(profile)}
        if(!this.alignPlayer(player,visibleState))throw Error('无法读取目标窗口大小，请稍后重试')
        // 让客户区布局在隐藏状态下先完成，再显示第一帧。
        await delay(40)
        player.window.show();player.window.webContents.send('player:play')
        report('playing','动画已按软件实际窗口大小播放')
        tracking=true
        tracker=(async()=>{while(tracking){await delay(120);if(!tracking)break;try{const current=await this.inspect(profile);if(tracking&&player&&current.visible)this.alignPlayer(player,current)}catch{/* 最终交接前会重新检查窗口；短暂查询失败保留上一帧位置。 */}}})()
      }
      let backgroundNote = ''
      const activeSession = session as SessionRecord | null
      if (profile.adapter.capability === 'supported' && (profile.background.enabled || (activeSession && await this.verifyPort(activeSession.port, monitored)))) {
        if (!activeSession) backgroundNote = '启动动画正常；本次软件没有背景接口，完整退出后从此快捷方式启动即可重试'
        else {
          try {
            const end = Date.now() + 10000
            while (Date.now() < end) {
              if (await this.verifyPort(activeSession.port, monitored)) {
                // 即使本次背景加载失败，也保留经过归属校验的接口，供下次恢复重试。
                await writeFile(join(this.store.directory, 'runtime', profile.id + '.json'), JSON.stringify(activeSession))
                const targets = await (await fetch('http://127.0.0.1:' + activeSession.port + '/json/list', { signal: AbortSignal.timeout(1500) })).json() as Target[]
                const target = selectPage(targets, profile.adapter.pagePrefix)
                if (target) { const url = new URL(target.webSocketDebuggerUrl); if (url.hostname !== '127.0.0.1' || Number(url.port) !== activeSession.port) throw Error('页面接口地址不匹配'); client = await connect(url.href); await applyBackground(client, profile, this.resources, this.store, !!player); break }
              }
              await delay(180)
            }
            if (!client) throw Error('没有找到兼容的应用页面')
          } catch (error) { backgroundNote = '动画已启动，背景尚未接入：' + (error as Error).message }
        }
      }
      if (player) await player.finish
      tracking=false;await tracker
      let finalState = await this.inspect(profile)
      if(expected==='warm'&&!originalMainIds.includes(finalState.pid))throw Error('目标软件重新创建了主进程，本次不能记为原后台实例恢复成功')
      if (!finalState.running || !finalState.found || !(finalState.visible || finalState.minimized)) throw Error('目标软件在启动过程中关闭了主窗口，请稍后重新启动')
      await repairCodexTaskbar(profile, finalState, this.resources).catch(error => report('partial', '任务栏图标暂未修复：' + (error as Error).message))
      if(player){
        if(finalState.minimized){await this.native('activate',monitored,profile.adapter.title,model,profile.adapter.windowClass);finalState=await this.inspect(profile)}
        if(!this.alignPlayer(player,finalState))throw Error('窗口大小已失效，无法完成动画交接')
        await delay(40)
      }
      let handoffBackdrop: string | undefined
      if (player && !player.window.isDestroyed()) {
        const frame = await player.window.webContents.executeJavaScript('window.__launchCanvasPlayerHandoff?.prepare()') as HandoffFrame | undefined
        if (client && frame?.video) {
          try {
            const prepared = await client.call('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: 'window.__launchCanvasBackground?.prepareHandoff(' + JSON.stringify(frame) + ')' }, 9000)
            if (prepared.exceptionDetails) throw Error(prepared.exceptionDetails.exception?.description ?? '背景画面同步失败')
            if (typeof prepared.result?.value?.backdrop === 'string') handoffBackdrop = prepared.result.value.backdrop
            if (profile.background.enabled && !backgroundNote) {
              const expectedVideo = resolveVideoSource(profile.background.source)
              if (prepared.result?.value?.matched) report('handoff', '背景视频已定位到同一播放相位')
              else if (expectedVideo) throw Error('背景视频尚未准备好交接')
              else report('handoff', '当前背景为独立素材，使用柔和过渡')
            }
          } catch (error) { backgroundNote = '软件已打开，背景视频同步失败：' + (error as Error).message }
        }
      }
      if (guard) { await writeFile(signal + '.release', 'release'); await this.waitMarker(signal, '.done') }
      await this.native('activate', monitored, profile.adapter.title, model,profile.adapter.windowClass)
      const resumeAt = Date.now() + 100
      if (client) await client.call('Runtime.evaluate', { expression: 'window.__launchCanvasBackground?.resume(' + resumeAt + ')' }).catch(() => {})
      if (player && !player.window.isDestroyed()) {
        player.window.webContents.send('player:status', '')
        await player.window.webContents.executeJavaScript('window.__launchCanvasPlayerHandoff?.resumeAt(' + resumeAt + ')')
        await delay(Math.max(0, resumeAt - Date.now()))
        const duration = 420
        await player.window.webContents.executeJavaScript('window.__launchCanvasPlayerHandoff?.reveal(' + duration + ',' + JSON.stringify(handoffBackdrop) + ')')
        const started = performance.now()
        while (!player.window.isDestroyed()) {
          const progress = Math.min(1, (performance.now() - started) / duration)
          player.window.setOpacity(1 - progress * progress * (3 - 2 * progress))
          if (progress >= 1) break
          await delay(16)
        }
        if (!player.window.isDestroyed()) player.window.destroy()
      }
      const windowBounds=Object.fromEntries((['x','y','width','height','clientX','clientY','clientWidth','clientHeight'] as const).map(key=>[key,finalState[key]]))
      await writeFile(historyFile, JSON.stringify({ executable, completedAt: new Date().toISOString(),windowBounds }))
      report(backgroundNote ? 'partial' : 'done', backgroundNote || (profile.adapter.capability==='unavailable'?'软件已打开；当前未支持内部背景':!profile.background.enabled?'软件已打开；背景未启用':'软件已打开，背景已加载'))
      return {action:slot as 'cold'|'warm',background:profile.adapter.capability==='unavailable'?'unsupported':!profile.background.enabled?'skipped':client&&!backgroundNote?'passed':'failed'}
    } catch (error) { report('failed', (error as Error).message, true); throw error }
    finally {
      tracking=false;await tracker
      if (guard && signal) { await writeFile(signal + '.release', 'release').catch(() => {}); await this.waitMarker(signal, '.done').catch(() => {}); guard.unref(); for (const suffix of ['.armed', '.release', '.done']) await unlink(signal + suffix).catch(() => {}) }
      if(client)await client.call('Runtime.evaluate',{expression:'window.__launchCanvasBackground?.resume()'}).catch(()=>{})
      client?.close(); if (player && !player.window.isDestroyed()) player.window.destroy(); this.active.delete(key)
    }
  }
}

