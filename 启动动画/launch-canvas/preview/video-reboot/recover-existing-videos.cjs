/* 默认仅离线检查。--recover=<主题/槽位> 才用原 CLI 恢复该白名单任务。 */
const fs = require('node:fs')
const path = require('node:path')
const { spawn, spawnSync } = require('node:child_process')
const { approvedTasks, installRoot, inspect } = require('./recover-video-hook.cjs')
const key = process.argv.find(value => value.startsWith('--recover='))?.slice(10)
const clean = text => String(text).replace(/https?:\/\/[^\s"<>]+/g, '[网址已隐藏]').replace(/Bearer\s+[^\s"\\]+/gi, '[凭据已隐藏]').replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)?\b/g, '[凭据已隐藏]')

async function main() {
  inspect()
  if (!key) {
    console.log(JSON.stringify({ offlineCheck: 'passed', generation: 'disabled', tasks: Object.keys(approvedTasks), note: '未启动 CLI，未发出网络请求' }))
    return
  }
  if (!Object.hasOwn(approvedTasks, key)) throw Error('任务不在恢复白名单内')
  const folder = path.resolve(__dirname, 'generated', key)
  const jobFile = path.join(folder, 'job.json')
  const job = JSON.parse(fs.readFileSync(jobFile, 'utf8'))
  if (job.status === 'completed' || job.calls !== 1) throw Error('任务已完成或不是单次已提交任务，不执行恢复')
  const resultFile = path.join(folder, 'recovery-result.json')
  if (fs.existsSync(resultFile) && JSON.parse(fs.readFileSync(resultFile, 'utf8')).status === 'downloaded') throw Error('已有下载结果，先人工核验，避免重复下载')
  const parameters = { prompt: '恢复已提交的视频任务，仅查询和下载，禁止生成新视频。', output_dir: folder.replaceAll('\\', '/') }
  const prompt = '执行一次内置 VideoGen。此专用进程已硬禁新建视频，VideoGen 仅恢复既有任务，使用原认证查询和下载。先 ToolSearch 获取定义，再 DeferExecuteTool 调用 VideoGen，参数严格使用下方 JSON。禁止任何其它工具，不读取登录文件，不操作账号，不充值，不订阅，不再次调用。成功或错误都立即结束。\n' + JSON.stringify(parameters)
  const hook = path.join(__dirname, 'recover-video-hook.cjs')
  const cli = path.join(installRoot, 'bin/codebuddy')
  let calls = 0, errors = [], buffer = ''
  const result = await new Promise(resolve => {
    const child = spawn(process.execPath, ['--require', hook, cli, '--print', '--output-format', 'stream-json', '--verbose', '--no-session-persistence', '--model', 'hy3', '--max-turns', '4', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--tools', 'ToolSearch,DeferExecuteTool,VideoGen', '--allowedTools', 'ToolSearch', 'DeferExecuteTool', 'VideoGen', '--permission-mode', 'default', '--', prompt], {
      cwd: __dirname, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, LAUNCHCANVAS_RECOVER_EXISTING: key, DISABLE_AUTOUPDATER: '1', CODEBUDDY_DISABLE_COMPILE_CACHE: '1', CODEBUDDY_FORCE_HEADLESS_BUNDLE: '1' }
    })
    child.stdout.on('data', chunk => {
      buffer += chunk.toString()
      let newline
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1)
        let event
        try { event = JSON.parse(line) } catch { continue }
        if (event.type === 'assistant') for (const part of event.message?.content ?? []) {
          if (part.type === 'tool_use' && (part.name === 'VideoGen' || part.input?.toolName === 'VideoGen') && ++calls > 1) child.kill()
        }
        if (event.type === 'user') for (const part of event.message?.content ?? []) {
          const text = JSON.stringify(part.content)
          if (part.type === 'tool_result' && (part.is_error || /Error:/.test(text))) errors.push(clean(text).slice(0, 600))
        }
        if (event.type === 'result' && event.is_error) errors.push(clean(event.result ?? event.errors ?? 'CLI 返回错误').slice(0, 600))
      }
    })
    // 不保存原始 stdout/stderr，避免无意复制 CLI 的认证诊断信息。
    child.stderr.on('data', chunk => { for (const line of chunk.toString().split('\n')) if (/^Error: (CLI|New video|Recovery|仅允许|任务状态)/.test(line)) errors.push(clean(line).slice(0, 300)) })
    child.on('error', error => errors.push(error.code ?? '启动失败'))
    const timer = setTimeout(() => { errors.push('查询等待超过 12 分钟，已停止；未重新生成'); child.kill() }, 12 * 60000)
    child.on('close', code => { clearTimeout(timer); resolve(code) })
  })
  const receipt = fs.existsSync(resultFile) ? JSON.parse(fs.readFileSync(resultFile, 'utf8')) : null
  let completed = false
  if (receipt?.status === 'downloaded' && receipt.taskId === approvedTasks[key] && receipt.files?.length === 1) {
    const file = path.resolve(receipt.files[0])
    if (path.dirname(file) !== folder || !fs.existsSync(file)) throw Error('恢复文件路径不正确')
    const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,size:stream=codec_name,width,height,r_frame_rate,nb_frames', '-of', 'json', file], { encoding: 'utf8', windowsHide: true })
    if (probe.status === 0) {
      const media = JSON.parse(probe.stdout)
      if (Number(media.format?.duration) > 0 && media.streams?.some(stream => stream.codec_name === 'h264')) {
        job.status = 'completed'; job.file = file; job.media = media; completed = true
      }
    }
    if (!completed) errors.push('已下载的文件未通过基础媒体检查')
  }
  const queryError = receipt?.status === 'query_failed' && receipt.taskId === approvedTasks[key] ? receipt.error : undefined
  job.recovery = { taskId: approvedTasks[key], at: new Date().toISOString(), completed, toolCalls: calls, exitCode: result, errors, queryError }
  fs.writeFileSync(jobFile, JSON.stringify(job, null, 2))
  console.log(JSON.stringify({ key, completed, toolCalls: calls, exitCode: result, seconds: job.media?.format?.duration, errors, queryError }))
  process.exitCode = completed ? 0 : 1
}
main().catch(error => { console.error(clean(error.message)); process.exitCode = 1 })
