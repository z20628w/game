const { spawn } = require('node:child_process')
const { mkdirSync, writeFileSync, existsSync } = require('node:fs')
const { join } = require('node:path')

const cli = 'D:/path_address/nvm/v24.18.0/node_modules/@tencent-ai/.codebuddy-code-zu6fNoqh/bin/codebuddy'
const outputDir = join(__dirname, 'cold-sample').replaceAll('\\', '/')
const reportPath = join(__dirname, 'cold-generation-report.json')
if (existsSync(reportPath)) throw Error('已有生成记录。先检查原任务结果，不重复提交。')
mkdirSync(outputDir, { recursive: true })
const reference = join(__dirname, 'identity-reference.jpg').replaceAll('\\', '/')
const parameters = {
  image: reference, last_image: reference, seconds: 8, resolution: '720P', output_dir: outputDir,
  prompt: '固定镜头、一镜到底、连续自然的日系精美动画。严格保持参考图中的成年银白龙娘同一面容、银白长发、紫瞳、龙角、龙翼、白色服饰和坐姿，深绿星庭场景与人物画面位置保持不变。人物从原图托腮姿态开始，先移动视线，随后自然抬起托腮的手，轻轻托起手边一枚细致的银色星环。星环环绕手腕附近一小段弧线，人物目光和微小头部动作跟随，体现前后遮挡和纵深。随后星环回到远处轨道，人物收手、回眸微笑，自然回到参考图托腮姿态。发丝、袖口、耳饰有动作带来的柔和滞后并逐渐收稳，最后约一秒维持轻微呼吸和发丝流动。柔和体积月光和细腻材质受光，人物脸和手的解剖稳定，不改变服装。整个过程必须是真正连续的角色动作，禁止静态图片平移缩放、拉扯变形、幻灯片、碎屑重组、人物消失或遮罩擦出；镜头不推拉、不晃动、不切换，最后画面与尾帧构图吻合。没有字幕，没有旁白。'
}
writeFileSync(join(__dirname, 'cold-generation-request.json'), JSON.stringify(parameters, null, 2))
const prompt = '用户授权使用现有积分生成一条银白龙娘冷启动样片，已告知视频会额外消耗积分（参考5秒50–100积分），不需要再次询问。只调用一次内置VideoGen；先用ToolSearch加载真实定义，然后用DeferExecuteTool执行VideoGen，参数严格使用下方JSON。不要调用其他工具，不读取账号文件，不修改配置，不充值，不生成第二条；如遇错误直接报告，不重试、不更改参数。等待这一次调用完成，报告实际本地文件路径、任务ID（如有）和真实状态，用简体中文。不把提示词时长当成实际媒体信息。参数：\n' + JSON.stringify(parameters)
const child = spawn(process.execPath, [cli, '--print', '--output-format', 'stream-json', '--verbose', '--no-session-persistence', '--model', 'hy3', '--max-turns', '5', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--tools', 'ToolSearch,DeferExecuteTool,VideoGen', '--allowedTools', 'ToolSearch', 'DeferExecuteTool', 'VideoGen', '--permission-mode', 'default', '--', prompt], {
  cwd: __dirname, windowsHide: true, env: { ...process.env, DISABLE_AUTOUPDATER: '1', CODEBUDDY_DISABLE_COMPILE_CACHE: '1' }, stdio: ['ignore', 'pipe', 'pipe']
})
const report = []
let buffer = '', errors = '', hadError = false
const redact = text => String(text).replace(/Bearer\s+[^\s"\\]+/gi, 'Bearer [已隐藏]').replace(/https?:\/\/[^\s"<>]+/g, '[网址已隐藏]').replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)?\b/g, '[令牌已隐藏]')
function record(event) { const entry = { at: new Date().toISOString(), ...event }; report.push(entry); writeFileSync(reportPath, JSON.stringify(report, null, 2)); console.log(JSON.stringify(entry)) }
record({ type: 'started', note: '单次生成；未完成时不得重新提交' })
child.stdout.on('data', chunk => {
  buffer += chunk.toString()
  let newline
  while ((newline = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1)
    let event
    try { event = JSON.parse(line) } catch { continue }
    if (event.type === 'assistant') for (const part of event.message?.content ?? []) {
      if (part.type === 'text') record({ type: 'assistant', text: redact(part.text).slice(0, 4000) })
      if (part.type === 'tool_use') record({ type: 'tool_request', name: part.name, input: redact(JSON.stringify(part.input)).slice(0, 6000) })
    }
    if (event.type === 'user') for (const part of event.message?.content ?? []) if (part.type === 'tool_result') record({ type: 'tool_result', isError: part.is_error, text: redact(typeof part.content === 'string' ? part.content : JSON.stringify(part.content)).slice(0, 14000) })
    if (event.type === 'result') { hadError ||= !!event.is_error; record({ type: 'result', isError: event.is_error, subtype: event.subtype, text: redact(event.result ?? event.errors ?? '').slice(0, 5000) }) }
  }
})
child.stderr.on('data', chunk => { if (errors.length < 12000) errors += chunk.toString() })
const timeout = setTimeout(() => { hadError = true; record({ type: 'timeout', note: '结果未确认，禁止重复提交' }); child.kill() }, 12 * 60000)
child.on('error', error => { hadError = true; record({ type: 'spawn_error', code: error.code }) })
child.on('exit', code => {
  clearTimeout(timeout)
  record({ type: 'exit', code, diagnostics: redact(errors).split('\n').filter(line => /error|failed|denied|auth/i.test(line)).slice(0, 8).map(line => line.slice(0, 240)) })
  process.exitCode = code === 0 && !hadError ? 0 : 1
})
