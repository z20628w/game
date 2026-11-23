const { _electron: electron } = require('playwright')
const assert = require('node:assert/strict')
const { mkdtemp, readFile, mkdir, writeFile, access } = require('node:fs/promises')
const { resolve, join } = require('node:path')
const { randomUUID } = require('node:crypto')
;(async () => {
  const directory = await mkdtemp(resolve('.test-data/remove-'))
  const env = { ...process.env, LAUNCHCANVAS_DATA_DIR: directory }; delete env.ELECTRON_RUN_AS_NODE
  const packaged = process.argv.includes('--packaged')
  const options = { executablePath: packaged ? resolve('release', require('../package.json').version, 'win-unpacked/LaunchCanvas.exe') : require('electron'), args: packaged ? [] : ['.'], env }
  let application = await electron.launch(options)
  try {
    const page = await application.firstWindow(); await page.waitForSelector('.page-heading')
    const initial = await page.evaluate(() => window.studio.snapshot())
    const first = initial.database.profiles[0]
    const second = structuredClone(first); second.id = randomUUID(); second.name = '保留组'
    await mkdir(join(directory, 'runtime'), { recursive: true })
    for (const profile of [first, second]) await writeFile(join(directory, 'runtime', profile.id + '.json'), JSON.stringify({ port: 12345, executable: profile.adapter.executable }))
    await page.evaluate(profile => window.studio.save(profile), second)
    await page.reload(); await page.waitForSelector('.page-heading [data-remove]')
    await page.screenshot({ path: 'preview/remove-entry.png' })
    // 模拟原生对话框的用户响应，测试仍走真实 IPC、删除持久化和界面更新。
    await application.evaluate(({ dialog }) => {
      globalThis.removeResponse = 0
      dialog.showMessageBox = async (_window, options) => { globalThis.removePrompt = options; return { response: globalThis.removeResponse, checkboxChecked: false } }
    })
    await page.fill('#duration', '2.7')
    await page.click('.page-heading [data-remove]'); await page.waitForFunction(() => !document.body.classList.contains('busy'))
    assert.equal((await page.evaluate(() => window.studio.snapshot())).database.profiles.length, 2)
    assert.equal(await page.inputValue('#duration'), '2.7', '取消应保留未保存的编辑')
    await access(join(directory, 'runtime', first.id + '.json'))
    const prompt = await application.evaluate(() => globalThis.removePrompt)
    assert.equal(prompt.cancelId, 0); assert.equal(prompt.defaultId, 0); assert(prompt.message.includes(first.name))
    await application.evaluate(() => { globalThis.removeResponse = 1 })
    await page.click('.page-heading [data-remove]'); await page.waitForFunction(() => !document.body.classList.contains('busy'))
    let saved = await page.evaluate(() => window.studio.snapshot())
    assert.deepEqual(saved.database.profiles.map(profile => profile.id), [second.id])
    await assert.rejects(access(join(directory, 'runtime', first.id + '.json')))
    await access(join(directory, 'runtime', second.id + '.json'))
    assert.equal(await page.locator('.page-heading h1').textContent(), second.name)
    await page.click('.page-heading [data-remove]'); await page.waitForSelector('.empty-state')
    assert.equal(JSON.parse(await readFile(join(directory, 'profiles.json'), 'utf8')).profiles.length, 0)
    await page.screenshot({ path: 'preview/remove-empty.png' })
    await application.close(); application = await electron.launch(options)
    const restarted = await application.firstWindow(); await restarted.waitForSelector('.empty-state')
    assert.equal((await restarted.evaluate(() => window.studio.snapshot())).database.profiles.length, 0)
    await restarted.click('.empty-state .add-group')
    assert.equal(await restarted.inputValue('#install-path'), '', '重新添加时不得带回旧安装路径')
    assert(await restarted.locator('#create-group').isDisabled(), '重新选择路径并检测前不能创建')
    await restarted.fill('#install-path', first.adapter.executable)
    await restarted.click('#scan-path'); await restarted.waitForSelector('.scan-found')
    await restarted.click('#create-group'); await restarted.waitForSelector('dialog', { state: 'detached' })
    const added = (await restarted.evaluate(() => window.studio.snapshot())).database.profiles[0]
    assert.notEqual(added.id, first.id)
    assert.equal(added.adapter.executable, first.adapter.executable)
    console.log(JSON.stringify({ passed: true, packaged, checks: ['取消保留整组软件', '移除软件条目及连接记录', '重启不恢复已移除软件', '重新添加必须选择安装路径', '重新建立独立软件条目'] }))
  } finally { await application.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
