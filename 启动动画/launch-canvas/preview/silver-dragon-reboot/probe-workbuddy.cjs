const { spawn } = require('node:child_process')
const { homedir } = require('node:os')
const { join } = require('node:path')
const { writeFileSync } = require('node:fs')

// 使用产品自己的配置与认证机制；不读取、复制或打印认证文件。
const install = 'D:/file_address/WorkBuddy/resources/app.asar.unpacked'
const plugins = join(install, 'resources/plugins/workbuddy-builtin')
const checkIndependent = process.argv.includes('--independent')
const checkNative = process.argv.includes('--native')
const independentCli = 'D:/path_address/nvm/v24.18.0/node_modules/@tencent-ai/.codebuddy-code-zu6fNoqh/bin/codebuddy'
const prompt = checkNative
  ? '只读检查：使用ToolSearch加载内置VideoGen工具的定义，报告其真实参数、支持时长、首尾帧或参考图参数、本地路径输入方式、输出保存位置。只能调用ToolSearch，不得实际调用VideoGen或任何其他工具，不得生成、上传、连接或认证，不得读取或输出凭据。找不到就报告找不到；不要混淆miora和内置VideoGen。用简体中文回复。'
  : '这是只读能力检查。只检查你当前会话实际可用工具，必要时仅使用ToolSearch搜索VideoGen、miora_frame_to_video、connect_cloud_service。回复哪些已注册、哪些不可用。不得生成图片或视频，不得上传文件，不得调用连接或认证接口，不得读取或输出任何token、密钥、账号配置，不得修改文件。不要把知道工具名称说成可实际调用。'
const child = spawn(process.execPath, [
  checkIndependent ? independentCli : join(install, 'cli/bin/codebuddy'),
  '--print', '--output-format', 'stream-json', '--verbose',
  '--no-session-persistence', '--model', 'hy3', '--max-turns', '3',
  '--tools', checkNative ? 'ToolSearch,VideoGen' : 'ToolSearch', '--allowedTools', 'ToolSearch',
  '--permission-mode', 'default',
  ...(checkNative ? ['--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}'] : ['--plugin-dir', join(plugins, 'mcps/miora-mcp')]),
  '--', prompt
], {
  cwd: __dirname, windowsHide: true,
  env: {
    ...process.env,
    DISABLE_AUTOUPDATER: '1',
    CODEBUDDY_DISABLE_COMPILE_CACHE: '1',
    ...(checkIndependent ? {} : {
      CODEBUDDY_FORCE_LITE_WB_BUNDLE: '1',
      CODEBUDDY_CONFIG_DIR: join(homedir(), '.workbuddy'),
      WORKBUDDY_CONFIG_DIR: join(homedir(), '.workbuddy'),
      CODEBUDDY_HOST: 'workbuddy-desktop'
    })
  },
  stdio: ['ignore', 'pipe', 'pipe']
})
const report = []
let buffer = '', errors = '', hadError = false
const redact = value => String(value)
  .replace(/Bearer\s+[^\s"\\]+/gi, 'Bearer [已隐藏]')
  .replace(/(?:https?:\/\/)[^\s"<>]+/g, '[网址已隐藏]')
  .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[邮箱已隐藏]')
  .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)?\b/g, '[令牌已隐藏]')
  .replace(/(token|authorization|api.?key|clientTempToken)["\s:=]+[^,\s}\]]+/gi, '$1:[已隐藏]')
function output(item) { report.push(item); console.log(JSON.stringify(item)) }
child.stdout.on('data', chunk => {
  buffer += chunk.toString()
  let newline
  while ((newline = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1)
    let event
    try { event = JSON.parse(line) } catch { if (line.trim()) output({ type: 'cli_notice', text: redact(line).slice(0, 400) }); continue }
    if (event.type === 'system' && event.subtype === 'init') output({ type: 'init', tools: event.tools, mcpServers: event.mcp_servers, model: event.model })
    if (event.type === 'assistant') {
      for (const part of event.message?.content ?? []) {
        if (part.type === 'text') output({ type: 'assistant', text: redact(part.text).slice(0, 5000) })
        if (part.type === 'tool_use') output({ type: 'tool_request', name: part.name })
      }
    }
    if (event.type === 'user' && checkNative) {
      for (const part of event.message?.content ?? []) {
        if (part.type === 'tool_result') output({ type: 'tool_result', text: redact(typeof part.content === 'string' ? part.content : JSON.stringify(part.content)).slice(0, 16000) })
      }
    }
    if (event.type === 'result') {
      hadError ||= !!event.is_error
      output({ type: 'result', isError: event.is_error, subtype: event.subtype, text: redact(event.result ?? event.errors ?? '').slice(0, 5000) })
    }
  }
})
child.stderr.on('data', chunk => { if (errors.length < 16000) errors += chunk.toString() })
const timeout = setTimeout(() => { hadError = true; output({ type: 'timeout', message: '未提交生成任务，结束本次诊断进程' }); child.kill() }, 90000)
child.on('error', error => output({ type: 'spawn_error', code: error.code }))
child.on('exit', code => {
  clearTimeout(timeout)
  output({ type: 'exit', code, diagnostics: redact(errors).split('\n').filter(line => /error|failed|login|auth|permission|EPERM|ENOENT|ENOTFOUND|denied/i.test(line)).slice(0, 10).map(line => line.slice(0, 240)) })
  writeFileSync(join(__dirname, checkNative ? 'native-video-capability-report.json' : checkIndependent ? 'codebuddy-capability-report.json' : 'workbuddy-capability-report.json'), JSON.stringify(report, null, 2))
  process.exitCode = code === 0 && !hadError ? 0 : 1
})
