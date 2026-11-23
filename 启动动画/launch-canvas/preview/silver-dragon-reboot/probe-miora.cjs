const { spawn } = require('node:child_process')
const { writeFileSync, mkdirSync } = require('node:fs')
const { join } = require('node:path')

// 仅执行 MCP 握手与工具清单查询，不调用生成、上传或任何账户接口。
const plugin = 'D:/file_address/WorkBuddy/resources/app.asar.unpacked/resources/plugins/workbuddy-builtin/mcps/miora-mcp'
const dataDir = join(__dirname, 'probe-data')
mkdirSync(dataDir, { recursive: true })
const child = spawn(process.execPath, [join(plugin, 'dist/cli.cjs')], {
  cwd: __dirname,
  env: { ...process.env, MIORA_MCP_TRANSPORT: 'stdio', MIORA_DATA_DIR: dataDir },
  windowsHide: true,
  stdio: ['pipe', 'pipe', 'pipe']
})
let buffer = ''
let finished = false
let stderrBytes = 0
function send(message) { child.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...message }) + '\n') }
const timeout = setTimeout(() => {
  console.error('MCP 工具清单查询超时；未提交生成任务')
  child.kill()
  process.exitCode = 1
}, 25000)
child.stderr.on('data', chunk => { stderrBytes += chunk.length })
child.on('error', error => { clearTimeout(timeout); console.error(error.code); process.exitCode = 1 })
child.on('exit', code => {
  clearTimeout(timeout)
  if (!finished) { console.error(JSON.stringify({ status: '未取得清单', exitCode: code, stderrBytes })); process.exitCode = 1 }
})
child.stdout.on('data', chunk => {
  buffer += chunk.toString()
  let newline
  while ((newline = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, newline)
    buffer = buffer.slice(newline + 1)
    let response
    try { response = JSON.parse(line) } catch { continue }
    if (response.error) { console.error(JSON.stringify(response.error)); child.kill(); continue }
    if (response.id === 1) {
      console.log(JSON.stringify({ server: response.result.serverInfo, protocol: response.result.protocolVersion }))
      send({ method: 'notifications/initialized' })
      send({ id: 2, method: 'tools/list', params: {} })
    }
    if (response.id === 2) {
      const tools = response.result.tools ?? []
      writeFileSync(join(__dirname, 'miora-tool-catalog.json'), JSON.stringify(tools, null, 2))
      console.log(JSON.stringify(tools.map(tool => ({ name: tool.name, description: tool.description?.slice(0, 180), parameters: Object.keys(tool.inputSchema?.properties ?? {}) })), null, 2))
      finished = true
      clearTimeout(timeout)
      child.stdin.end()
      child.kill()
    }
  }
})
send({ id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'launchcanvas-capability-probe', version: '0.1.0' } } })
