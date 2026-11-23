const test = require('node:test')
const assert = require('node:assert/strict')
const { mkdtemp, writeFile, mkdir, readFile } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { randomUUID } = require('node:crypto')
const { validateProfile, parseManifest, safeShortcutName } = require('../dist/domain.js')
const { scanInstallation } = require('../dist/detection.js')
const { Store } = require('../dist/store.js')
const { galleryThemes, gallerySource } = require('../dist/catalog.js')
test('启动入口与窗口监测路径独立，导入时解析相对路径并验证进程模型',()=>{
  const file=join('D:\\Apps','bridge.launchcanvas.json')
  const {adapter}=parseManifest({version:1,name:'桥接软件',executable:'Bridge.exe',windowExecutable:'app/Bridge.exe',processModel:'chromium'},file)
  assert.equal(adapter.executable,join('D:\\Apps','Bridge.exe'));assert.equal(adapter.windowExecutable,join('D:\\Apps','app','Bridge.exe'));assert.equal(adapter.kind,'native');assert.equal(adapter.capability,'unavailable');assert.equal(adapter.processModel,'chromium')
  assert.throws(()=>parseManifest({version:1,name:'错误',executable:'Bridge.exe',windowExecutable:12},file))
  assert.throws(()=>parseManifest({version:1,name:'错误',executable:'Bridge.exe',processModel:'anything'},file))
})
test('33 套图库独立绑定三个槽，未知主题与跨槽素材被拒绝', () => {
  assert.equal(galleryThemes.length, 33)
  assert.equal(new Set(galleryThemes.map(theme=>theme.id)).size, 33)
  assert.equal(galleryThemes.filter(theme=>theme.group==='AI 拟人').length,25)
  for(const theme of galleryThemes){const p=profile();for(const slot of ['cold','warm','background'])p[slot].source=gallerySource(theme.id,slot);assert.equal(validateProfile(p,{version:1,profiles:[],assets:[]}).cold.source,p.cold.source)}
  assert.deepEqual(['cold','warm','background'].map(slot=>gallerySource('silver-dragon-classic',slot)),['builtin:cold','builtin:eye','builtin:background'])
  const p=profile();p.warm.source='gallery:../../oops:warm';assert.throws(()=>validateProfile(p,{version:1,profiles:[],assets:[]}))
  p.warm.source='gallery:chatgpt-art:cold';assert.throws(()=>validateProfile(p,{version:1,profiles:[],assets:[]}))
})
function profile() {
  const media = { source: 'builtin:eye', durationMs: 1500, enabled: true, opacity: 30, fit: 'cover' }
  return { id: randomUUID(), name: '我的软件', createdAt: '', updatedAt: '', adapter: { kind: 'electron', executable: 'C:\\Apps\\Demo.exe', args: [], title: '', pagePrefix: 'file://', selectors: ['#root'], capability: 'candidate', evidence: [], files: [] }, cold: { ...media }, warm: { ...media }, background: { ...media } }
}
test('三个媒体槽独立保存，非法时长与端口参数被拒绝', () => {
  const p = profile(), database = { version: 1, profiles: [], assets: [] }
  p.cold.durationMs = 6000
  assert.equal(validateProfile(p, database).warm.durationMs, 1500)
  p.warm.durationMs = 0; assert.throws(() => validateProfile(p, database))
  p.warm.durationMs = 1500; p.adapter.args = ['--remote-debugging-port=9222']; assert.throws(() => validateProfile(p, database))
})
test('原生软件不能误标为支持背景', () => {
  const p = profile(); p.adapter.kind = 'native'; p.adapter.capability = 'unavailable'
  assert.equal(validateProfile(p, { version: 1, profiles: [], assets: [] }).background.enabled, false)
})
test('适配文件解析相对 EXE，拒绝不合法页面规则', () => {
  const parsed = parseManifest({ version: 1, name: 'Demo', executable: './app/Demo.exe', framework: 'electron', pagePrefix: 'file://', background: { selectors: ['#root'] } }, 'C:\\Apps\\demo.launchcanvas.json')
  assert.match(parsed.adapter.executable, /app\\Demo.exe$/)
  assert.equal(parsed.adapter.capability, 'unavailable')
  assert.throws(() => parseManifest({ version: 1, name: 'X', executable: 'x.exe', framework: 'electron', pagePrefix: 'https://example.com' }, 'C:\\Apps\\a.json'))
  assert.equal(safeShortcutName('A/B:*?'), 'A_B___')
})
test('目录检测区分 Electron 与普通 EXE，并列出只读依据', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'lc-detect-test-'))
  await writeFile(join(folder, 'Demo.exe'), 'fixture')
  let result = await scanInstallation(folder)
  assert.equal(result.adapter.capability, 'unavailable')
  await mkdir(join(folder, 'resources')); await writeFile(join(folder, 'resources/app.asar'), 'fixture'); await writeFile(join(folder, 'icudtl.dat'), 'fixture')
  result = await scanInstallation(folder)
  assert.equal(result.adapter.kind, 'electron'); assert.equal(result.adapter.capability, 'unavailable')
  assert(result.adapter.files.some(file => file.path.endsWith('app.asar') && file.action.includes('不修改')))
})
test('配置持久化，导入素材独立复制，损坏配置不被覆盖', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'lc-store-test-')), store = new Store(folder)
  await store.load(); const p = profile(); await store.save(p)
  const file = join(folder, 'sample.png'); await writeFile(file, 'fixture')
  const asset = await store.importAsset(file); assert.notEqual(store.assetPath(asset.id), file)
  const loaded = new Store(folder); await loaded.load(); assert.equal(loaded.data.profiles[0].id, p.id); assert.equal(loaded.data.assets[0].id, asset.id)
  await writeFile(join(folder, 'profiles.json'), 'broken')
  await assert.rejects(new Store(folder).load()); assert.equal(await readFile(join(folder, 'profiles.json'), 'utf8'), 'broken')
})

test('目录扫描避开修复工具并优先匹配软件名称，显式 EXE 选择仍被尊重', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lc-entry-test-')), folder = join(root, 'WorkBuddy')
  await mkdir(join(folder, 'resources'), { recursive: true })
  for (const file of ['RepairApp.exe', 'WorkBuddy.exe', 'A.exe', 'Uninstall WorkBuddy.exe', 'icudtl.dat', 'resources/app.asar']) await writeFile(join(folder, file), 'fixture')
  const result = await scanInstallation(folder, '', require('node:path').resolve('resources/adapters'))
  assert.equal(result.adapter.executable, join(folder, 'WorkBuddy.exe'))
  assert.equal(result.adapter.kind, 'electron'); assert.equal(result.adapter.capability, 'unavailable')
  assert(!result.candidates.some(file => /repair|uninstall/i.test(file)))
  assert.equal(result.adapter.pagePrefix,'')
  assert(!result.adapter.selectors.includes('.conversation-shell'),'仅同名 EXE 不能获得已确认的背景规则')
  const explicit = await scanInstallation(join(folder, 'RepairApp.exe'))
  assert.equal(explicit.adapter.executable, join(folder, 'RepairApp.exe'))
  assert.equal(explicit.adapter.kind, 'native'); assert.equal(explicit.adapter.capability, 'unavailable')
})
