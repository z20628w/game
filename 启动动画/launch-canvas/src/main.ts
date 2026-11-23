import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, protocol, shell, Tray } from 'electron'
import { readFile, writeFile, appendFile } from 'node:fs/promises'
import { join, resolve, sep, extname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Store } from './store'
import { createSoftwareShortcut, refreshSoftwareShortcuts } from './shortcuts'
import { Launcher } from './launcher'
import { discoverCodex, scanInstallation, exists, resolveWindowBinding } from './detection'
import { parseManifest, safeShortcutName } from './domain'
import { sourcePath, mimeTypes } from './background'
import { newProfile, type Profile, type Snapshot, type Slot, type LaunchEvent } from './shared'
import { galleryThemes, gallerySource, galleryDuration } from './catalog'
import { classicStartupHTML } from './classic-startup'
import { Calibration } from './calibration'
import { configureBackgroundPolicy, enforceBackgroundPolicy, enforceProfileBackground } from './background-policy'
import { localMediaResponse } from './media-response'
import { getVideoTheme } from './video-catalog'

app.setName('LaunchCanvas')
if (process.env.LAUNCHCANVAS_DATA_DIR) app.setPath('userData', resolve(process.env.LAUNCHCANVAS_DATA_DIR))
protocol.registerSchemesAsPrivileged([{ scheme: 'lc-media', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }])
const resources = app.isPackaged ? join(process.resourcesPath, 'studio') : resolve(__dirname, '../resources')
let manager: BrowserWindow | null = null, tray: Tray | null = null, store: Store, launcher: Launcher, quitting = false, official = ''
let startupReady: Promise<void>
let calibration:Calibration
const startId = (argv: string[]) => {
  const inline = argv.find(arg => arg.startsWith('--launch='))?.slice(9)
  if (inline && /^[a-f0-9-]{36}$/i.test(inline)) return inline
  // Electron 会在第二实例参数之间插入 Chromium 开关，兼容旧的分离参数形式。
  return argv.includes('--launch') ? argv.find(arg => /^[a-f0-9-]{36}$/i.test(arg)) ?? '' : ''
}
function snapshot(): Snapshot { return { database: structuredClone(store.data), dataDirectory: store.directory, packaged: app.isPackaged, version: app.getVersion(),verification:calibration?.all() } }
function getProfile(id: string) { const profile = store.data.profiles.find(profile => profile.id === id); if (!profile) throw Error('软件组不存在'); return profile }
async function refreshCodexInstallation() {
  const current = await discoverCodex().catch(() => '')
  if (!current) return
  official = current; configureBackgroundPolicy(current)
  for (const profile of [...store.data.profiles]) {
    if (profile.adapter.kind !== 'codex') continue
    const repaired = await enforceProfileBackground(profile)
    if (JSON.stringify(repaired) !== JSON.stringify(profile)) await store.save(repaired)
  }
}
function emit(event: LaunchEvent) {
  if (manager && !manager.isDestroyed()) manager.webContents.send('studio:launch-event', event)
  void appendFile(join(store.directory, 'launch.log'), JSON.stringify({ time: new Date().toISOString(), ...event }) + '\n').catch(() => {})
}
function showManager() {
  if (manager && !manager.isDestroyed()) { manager.show(); manager.focus(); return }
  manager = new BrowserWindow({ width: 1320, height: 900, minWidth: 1080, minHeight: 720, show: false, title: '启幕', backgroundColor: '#101319', icon: join(resources, 'icon.ico'), autoHideMenuBar: true, webPreferences: { preload: join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } })
  manager.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  manager.webContents.on('will-navigate', (event, url) => { if (url !== pathToFileURL(join(__dirname, 'index.html')).href) event.preventDefault() })
  manager.once('ready-to-show', () => manager?.show())
  manager.on('close', event => { if (!quitting) { event.preventDefault(); manager?.hide() } })
  void manager.loadFile(join(__dirname, 'index.html'))
}
async function handleLaunch(id: string) { try { if(calibration.busy(id))throw Error('窗口校准正在操作此软件，请等待完成');await launcher.launch(getProfile(id)) } catch (error) { showManager(); await dialog.showMessageBox(manager!, { type: 'error', title: '启动未完成', message: (error as Error).message }) } }
function registerIPC() {
  const handle = (channel: string, operation: (...args: any[]) => unknown) => ipcMain.handle('studio:' + channel, (event, ...args) => {
    if (!manager || event.sender.id !== manager.webContents.id) throw Error('无效的界面请求')
    return operation(...args)
  })
  handle('snapshot', async () => { await refreshCodexInstallation(); return snapshot() })
  handle('calibration-begin',(id:string)=>calibration.begin(id))
  handle('calibration-refresh',(id:string)=>calibration.refresh(id))
  handle('calibration-launch',(id:string)=>calibration.launch(id))
  handle('calibration-bind',(id:string,handle:string,title:string)=>calibration.bind(id,handle,title))
  handle('calibration-test',(id:string,check:any)=>calibration.test(id,check))
  handle('calibration-end',(id:string)=>calibration.end(id))
  handle('scan', async (path?: string) => {
    let selected = path?.trim().replace(/^"|"$/g, '')
    if (selected && (typeof selected !== 'string' || selected.length > 4096)) throw Error('安装路径无效')
    if (!selected) { const result = await dialog.showOpenDialog(manager!, { title: '选择软件安装目录', properties: ['openDirectory'] }); if (result.canceled) return null; selected = result.filePaths[0] }
    await refreshCodexInstallation()
    return scanInstallation(selected, official, join(resources, 'adapters'))
  })
  handle('choose-executable', async () => { const result = await dialog.showOpenDialog(manager!, { title: '选择软件主程序', filters: [{ name: 'Windows 应用', extensions: ['exe'] }], properties: ['openFile'] }); if(result.canceled)return null;await refreshCodexInstallation();return scanInstallation(result.filePaths[0], official, join(resources, 'adapters')) })
  handle('import-adapter', async () => {
    const result = await dialog.showOpenDialog(manager!, { title: '导入适配配置', filters: [{ name: '适配配置 JSON', extensions: ['json'] }], properties: ['openFile'] })
    if (result.canceled) return null
    const file = result.filePaths[0], contents = await readFile(file, 'utf8')
    if (contents.length > 65536) throw Error('配置文件过大')
    const parsed = parseManifest(JSON.parse(contents.replace(/^\uFEFF/, '')), file)
    if (!await exists(parsed.adapter.executable)) throw Error('配置引用的 EXE 不存在：' + parsed.adapter.executable)
    if(parsed.adapter.windowExecutable&&!await exists(parsed.adapter.windowExecutable))throw Error('窗口监测 EXE 不存在：'+parsed.adapter.windowExecutable)
    parsed.adapter=await resolveWindowBinding(parsed.adapter)
    parsed.adapter=await enforceBackgroundPolicy(parsed.adapter)
    return { folder: resolve(file, '..'), candidates: [parsed.adapter.executable], adapter: parsed.adapter, suggestedName: parsed.name }
  })
  handle('save', async (profile: Profile) => { if(calibration.busy(profile.id))throw Error('请等待校准操作完成后修改配置');if ([profile.adapter.executable,profile.adapter.windowExecutable].some(file=>file?.toLowerCase()===process.execPath.toLowerCase())) throw Error('不能绑定启幕自身'); await store.save(profile); return snapshot() })
  handle('remove', async (id: string) => {
    if(calibration.busy(id))throw Error('请等待校准操作完成后移除软件')
    const profile = getProfile(id)
    const result = await dialog.showMessageBox(manager!, {
      type: 'warning', title: '从启幕移除软件', message: `从启幕中移除「${profile.name}」？`,
      detail: '此软件条目将从列表消失，同时移除安装路径绑定、两套启动动画、背景设置和连接记录。再次配置需要点击「添加软件」，重新选择安装路径。\n\n不会卸载电脑上的软件或删除原始素材。已有的启幕桌面快捷方式将失效，可手动删除。此操作无法撤销。',
      buttons: ['取消', '移除软件'], defaultId: 0, cancelId: 0, noLink: true
    })
    if (result.response === 1) {
      if (launcher.isLaunching(id)) throw Error('软件正在启动，请等待动画结束后再移除')
      await store.remove(id)
    }
    return snapshot()
  })
  handle('import-media', async () => { const result = await dialog.showOpenDialog(manager!, { title: '导入动画或背景素材', filters: [{ name: '图片与视频（最大 64 MB）', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'mp4', 'webm'] }], properties: ['openFile'] }); return result.canceled ? null : store.importAsset(result.filePaths[0]) })
  handle('shortcut', async (id: string) => {
    const target = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath
    const args = app.isPackaged ? '--launch=' + id : '"' + app.getAppPath() + '" --launch=' + id
    return createSoftwareShortcut(app.getPath('desktop'), target, args, app.getPath('home'), getProfile(id))
  })
  handle('export-adapter', async (id: string) => {
    const profile = getProfile(id), result = await dialog.showSaveDialog(manager!, { title: '导出可复用适配配置', defaultPath: safeShortcutName(profile.name) + '.launchcanvas.json', filters: [{ name: 'JSON', extensions: ['json'] }] })
    if (result.canceled || !result.filePath) return null
    await writeFile(result.filePath, JSON.stringify({ version: 1, name: profile.name, executable: profile.adapter.executable, windowExecutable:profile.adapter.windowExecutable, windowClass:profile.adapter.windowClass, processModel:profile.adapter.processModel, framework: profile.adapter.kind === 'native' ? 'native' : 'electron', arguments: profile.adapter.args, windowTitle: profile.adapter.title, pagePrefix: profile.adapter.pagePrefix, background: { selectors: profile.adapter.selectors } }, null, 2))
    return result.filePath
  })
  handle('launch', async (id: string) => { if(calibration.busy(id))throw Error('请等待校准操作完成');await launcher.launch(getProfile(id)) })
  handle('preview', async (id: string, slot: Slot) => { if (!['cold', 'warm', 'background'].includes(slot)) throw Error('预览类型无效'); await launcher.preview(getProfile(id), slot) })
  handle('preview-theme', async (id: string, themeId: string, slot: Slot) => {
    if (!galleryThemes.some(theme => theme.id === themeId) || !['cold','warm','background'].includes(slot)) throw Error('图库主题无效')
    const profile = structuredClone(getProfile(id)); profile[slot].source = gallerySource(themeId, slot)
    profile[slot].durationMs = galleryDuration(themeId,slot)
    // 图库预览使用所选主题整套衔接，避免片尾混入软件当前绑定的另一角色。
    profile.background.source = gallerySource(themeId, 'background')
    profile.background.durationMs = galleryDuration(themeId, 'background')
    profile.background.fit = profile[slot].fit
    await launcher.preview(profile, slot)
  })
  handle('open-data', () => shell.openPath(store.directory))
  ipcMain.handle('player:data', event => { const player = launcher.players.get(event.sender.id); if (!player) throw Error('播放器不存在'); return player.data })
  ipcMain.on('player:ready', (event, error?: string) => launcher.players.get(event.sender.id)?.acknowledge(error))
  ipcMain.on('player:finished', event => launcher.players.get(event.sender.id)?.complete())
}
async function initialize() {
  store = new Store(app.getPath('userData'))
  const firstRun = !await exists(join(store.directory, 'profiles.json'))
  await store.load(); official = await discoverCodex().catch(() => '')
  configureBackgroundPolicy(official)
  // 旧软件组只修正窗口绑定，不重建组 ID、快捷方式或动画设置。
  let repaired=false
  for(const profile of store.data.profiles){try{const adapter=await resolveWindowBinding(profile.adapter);if(JSON.stringify(adapter)!==JSON.stringify(profile.adapter)){profile.adapter=adapter;repaired=true}}catch{/* 暂时不可读的安装目录保持原配置，允许用户之后重新绑定。 */}}
  for(let index=0;index<store.data.profiles.length;index++){const previous=store.data.profiles[index],current=await enforceProfileBackground(previous);if(JSON.stringify(previous)!==JSON.stringify(current)){store.data.profiles[index]=current;repaired=true}}
  if(repaired)await store.persist()
  // 用户主动清空配置后保持空列表，仅首次使用时创建默认组。
  if (firstRun && official) { const scan = await scanInstallation(official, official); await store.save(newProfile(scan.adapter, 'Codex · 银白龙娘')) }
  launcher = new Launcher(store, resources, emit)
  for(const profile of store.data.profiles.filter(profile=>profile.adapter.capability!=='supported'))await launcher.removeUnsupportedBackground(profile).catch(()=>emit({profileId:profile.id,stage:'partial',message:'背景已禁用；若仍显示旧背景，请正常退出目标软件后重新打开'}))
  calibration=new Calibration(store,launcher,resources,official);await calibration.load()
  protocol.handle('lc-media', async request => {
    try {
      const url = new URL(request.url)
      if (url.hostname === 'gallery') {
        const name = decodeURIComponent(url.pathname.slice(1))
        if (!galleryThemes.some(theme => name === (theme.image || theme.id + '-thumb.png') || (theme.group === '场景' && getVideoTheme(theme.id) && name === `video-reference/${theme.id}.png`))) return new Response('Not found', { status: 404 })
        return new Response(await readFile(join(resources, 'gallery', name)), { headers: { 'content-type': 'image/png' } })
      }
      if (url.hostname === 'asset') { const path = sourcePath(decodeURIComponent(url.pathname.slice(1)), resources, store); return await localMediaResponse(path, request, mimeTypes[extname(path)] || 'application/octet-stream') }
      if (url.hostname !== 'legacy') return new Response('Not found', { status: 404 })
      const root = resolve(resources, 'legacy'), path = resolve(root, decodeURIComponent(url.pathname.slice(1)))
      if (!path.startsWith(root + sep)) return new Response('Forbidden', { status: 403 })
      if (url.pathname === '/index.html') {
        const themeId = url.searchParams.get('theme')
        const theme = themeId ? galleryThemes.find(item => item.id === themeId && !item.preset) : undefined
        if (themeId && !theme) return new Response('Unknown theme', { status: 404 })
        const html = classicStartupHTML(await readFile(path, 'utf8'), theme)
        return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'none'" } })
      }
      const type = mimeTypes[extname(path)] || ({ '.js': 'text/javascript', '.css': 'text/css' } as Record<string, string>)[extname(path)] || 'application/octet-stream'
      return new Response(await readFile(path), { headers: { 'content-type': type } })
    } catch { return new Response('Media unavailable', { status: 404 }) }
  })
  if (app.isPackaged && !process.env.LAUNCHCANVAS_DATA_DIR) {
    await refreshSoftwareShortcuts(app.getPath('desktop'), process.env.PORTABLE_EXECUTABLE_FILE || process.execPath, store.data.profiles).catch(error => console.warn('桌面图标更新失败：', error))
  }
  registerIPC()
  tray = new Tray(nativeImage.createFromPath(join(resources, 'icon.ico')))
  tray.setToolTip('启幕')
  tray.setContextMenu(Menu.buildFromTemplate([{ label: '打开启幕', click: showManager }, { type: 'separator' }, { label: '退出启幕', click: () => { quitting = true; app.quit() } }]))
  tray.on('double-click', showManager)
  app.setAppUserModelId('local.launchcanvas.desktop')
  if (startId(process.argv)) void handleLaunch(startId(process.argv)); else showManager()
}
if (!app.requestSingleInstanceLock({ launchId: startId(process.argv) })) app.quit()
else {
  app.on('second-instance', (_event, argv, _directory, data) => { void startupReady.then(() => { const payload = data as { launchId?: unknown }; const id = typeof payload?.launchId === 'string' ? payload.launchId : startId(argv); if (id) void handleLaunch(id); else showManager() }) })
  app.on('window-all-closed', () => {})
  app.on('before-quit', () => { quitting = true })
  startupReady = app.whenReady().then(initialize).catch(error => { dialog.showErrorBox('启幕无法启动', error.message); app.quit() })
}
