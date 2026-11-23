const { test } = require('node:test')
const assert = require('node:assert/strict')
const vm = require('node:vm')
const { resolve } = require('node:path')
const { build } = require('esbuild')

const launcherBundle = build({
  entryPoints: ['src/launcher.ts'], bundle: true, write: false, platform: 'node', format: 'cjs', external: ['electron', 'original-fs'],
  plugins: [{ name: 'legacy-media-fixture', setup(builder) {
    builder.onResolve({ filter: /^\.\/video-catalog$/ }, () => ({ path: 'empty-video-catalog', namespace: 'test' }))
    builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: 'export function resolveVideoSource(){return null} export function getVideoTheme(){return null}', loader: 'js' }))
  } }]
})

async function fixture() {
  let windows = 0
  const electron = { BrowserWindow: class { constructor() { windows++ } }, app: {}, screen: { getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1200, height: 800 } }) } }
  const module = { exports: {} }
  vm.runInNewContext((await launcherBundle).outputFiles[0].text, { module, require: name => name === 'electron' ? electron : require(name), process, console, Buffer, URL, setTimeout, clearTimeout, structuredClone, __dirname: resolve('dist') })
  const launcher = new module.exports.Launcher({ data: { assets: [] } }, resolve('.test-data/missing-player-media'), () => {})
  return { launcher, windows: () => windows }
}

test('缺失旧主题素材时不留下隐藏窗口或就绪计时器', async () => {
  const { launcher, windows } = await fixture()
  const profile = { name: '缺失素材', cold: { source: 'gallery:claude-anime:cold', durationMs: 8000, fit: 'cover' }, background: { enabled: false } }
  await assert.rejects(launcher.createPlayer(profile, 'cold', true), /ENOENT/)
  assert.equal(windows(), 0)
  assert.equal(launcher.players.size, 0)
})

test('预览播放中断仍然关闭播放器窗口', async () => {
  const { launcher } = await fixture()
  let closed = false
  launcher.createPlayer = async () => ({ window: { show() {}, webContents: { send() {} }, isDestroyed: () => false, close: () => { closed = true } }, finish: Promise.reject(Error('解码中断')) })
  await assert.rejects(launcher.preview({}, 'cold'), /解码中断/)
  assert.equal(closed, true)
})
