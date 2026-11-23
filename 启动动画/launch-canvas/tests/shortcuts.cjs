const { _electron: electron } = require('playwright')
const assert = require('node:assert/strict')
const { mkdir, mkdtemp } = require('node:fs/promises')
const { resolve, join } = require('node:path')

;(async () => {
  await mkdir('.test-data', { recursive: true })
  const directory = await mkdtemp(resolve('.test-data/shortcuts-'))
  const env = { ...process.env, LAUNCHCANVAS_DATA_DIR: join(directory, 'profile') }
  delete env.ELECTRON_RUN_AS_NODE
  const executablePath = process.env.LC_TEST_MANAGER_EXE || require('electron')
  const application = await electron.launch({ executablePath, args: process.env.LC_TEST_MANAGER_EXE ? [] : ['.'], cwd: process.cwd(), env })
  try {
    const page = await application.firstWindow()
    await page.waitForFunction(() => !!window.studio)
    assert.equal(await page.title(), '启幕')
    const result = await application.evaluate(async ({ shell }, { directory, helper, icon }) => {
      const require = process.mainModule.require.bind(process.mainModule)
      const { createSoftwareShortcut, refreshSoftwareShortcuts } = require(helper)
      const { join } = require('node:path')
      const target = process.execPath, id = '12345678-1234-1234-1234-123456789012'
      const args = '--launch=' + id
      const profile = { id, name: '快捷方式测试', adapter: { executable: target, windowExecutable: icon } }
      const file = await createSoftwareShortcut(directory, target, args, directory, profile)
      const created = shell.readShortcutLink(file)
      const repeated = await createSoftwareShortcut(directory, target, args, directory, profile)
      // 模拟旧版图标及一个不属于启幕的同参数入口。
      shell.writeShortcutLink(file, 'update', { target, icon: target, iconIndex: 0 })
      const foreign = join(directory, '其他软件.lnk')
      shell.writeShortcutLink(foreign, 'create', { target: icon, args, icon: target, iconIndex: 0 })
      await refreshSoftwareShortcuts(directory, target, [profile])
      const migrated = shell.readShortcutLink(file), untouched = shell.readShortcutLink(foreign)
      // 同名冲突必须另取文件名，不能改写用户原有入口。
      shell.writeShortcutLink(file, 'update', { target: icon, args: '--unrelated' })
      const collision = await createSoftwareShortcut(directory, target, args, directory, profile)
      profile.adapter.windowExecutable = join(directory, '不存在.exe')
      profile.name = '入口回退'
      const fallback = shell.readShortcutLink(await createSoftwareShortcut(directory, target, args, directory, profile))
      return { file, repeated, created, migrated, untouched, collision, original: shell.readShortcutLink(file), fallback, target }
    }, { directory, helper: resolve('dist/shortcuts.js'), icon: resolve('resources/native/WindowHost.exe') })
    assert.equal(result.created.icon.toLowerCase(), resolve('resources/native/WindowHost.exe').toLowerCase())
    assert.equal(result.created.target, result.target)
    assert.equal(result.repeated, result.file)
    assert.equal(result.migrated.icon, result.created.icon)
    assert.equal(result.migrated.args, result.created.args)
    assert.equal(result.untouched.icon, result.target)
    assert.notEqual(result.collision, result.file)
    assert.equal(result.original.args, '--unrelated')
    assert.equal(result.fallback.icon, result.target)
    console.log('通过：目标软件图标、旧入口更新、启动参数保留、同名保护及窗口标题。所有快捷方式均位于隔离测试目录。')
  } finally { await application.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
