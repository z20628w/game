/* 每个素材只提交一次；不确定状态必须人工核查，禁止盲目重试扣费。 */
const { spawn, spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '../..')
const arg = name => process.argv.find(value => value.startsWith(`--${name}=`))?.split('=').slice(1).join('=')
const cli = arg('cli') ?? [
  'D:/path_address/nvm/v24.18.0/node_modules/@tencent-ai/codebuddy-code/bin/codebuddy',
  'D:/path_address/nvm/v24.18.0/node_modules/@tencent-ai/.codebuddy-code-zu6fNoqh/bin/codebuddy'
].find(file => fs.existsSync(file))
if (!cli) throw Error('没有找到已安装的CodeBuddy CLI；不会自动下载或安装')
const selected = arg('themes')?.split(',')
const slots = (arg('slots') ?? 'cold,warm,background').split(',')
const workers = Math.max(1, Math.min(4, Number(arg('workers') ?? 2)))
const breakerPath = path.join(__dirname, 'generation-cooldown.json')
const resumeDeferred = process.argv.includes('--resume-deferred')
const directions = JSON.parse(fs.readFileSync(path.join(__dirname, 'theme-directions.json'), 'utf8').replace(/^\uFEFF/, ''))
const themes = Array.isArray(directions) ? directions : directions.themes
const safe = value => String(value).replace(/Bearer\s+[^\s"\\]+/gi, 'Bearer [已隐藏]').replace(/https?:\/\/[^\s"<>]+/g, '[网址已隐藏]').replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)?\b/g, '[令牌已隐藏]')
const durations = { cold: 8, warm: 3, background: 6 }
const jobs = themes.filter(theme => !selected || selected.includes(theme.id)).flatMap(theme => slots.map(slot => ({ theme, slot })))
let cursor = 0
let failures = 0

function coolingDown() {
  if (!fs.existsSync(breakerPath)) return false
  const breaker = JSON.parse(fs.readFileSync(breakerPath, 'utf8'))
  return breaker.blocked === true || Date.now() < Date.parse(breaker.notBefore)
}

function parseResult(value) {
  if (!value) return null
  if (typeof value === 'string') { try { return parseResult(JSON.parse(value)) } catch { return null } }
  if (Array.isArray(value)) { for (const item of value) { const found = parseResult(item); if (found) return found } return null }
  if (value.type === 'video_gen_tool_result') return value
  return parseResult(value.text ?? value.content)
}

async function generate({ theme, slot }) {
  const folder = path.join(__dirname, 'generated', theme.id, slot)
  const stateFile = path.join(folder, 'job.json')
  if (fs.existsSync(stateFile)) {
    const previous = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
    if (previous.status === 'paused_before_submission' && previous.calls === 0 && resumeDeferred) {
      fs.writeFileSync(path.join(folder, 'deferred-before-submission.json'), JSON.stringify(previous, null, 2))
    } else {
      console.log(JSON.stringify({ theme: theme.id, slot, skipped: true, status: previous.status }))
      if (previous.status !== 'completed') failures++
      return
    }
  }
  fs.mkdirSync(folder, { recursive: true })
  const reference = path.join(root, 'resources', theme.reference).replaceAll('\\', '/')
  if (!fs.existsSync(reference)) throw Error(`参考图不存在：${reference}`)
  const parameters = {
    image: reference, last_image: reference,
    seconds: durations[slot], resolution: '1080P', output_dir: folder.replaceAll('\\', '/'),
    prompt: theme[slot === 'background' ? 'idlePrompt' : `${slot}Prompt`]
  }
  if (!parameters.prompt) throw Error(`缺少动作设计：${theme.id}/${slot}`)
  const job = { theme: theme.id, slot, status: 'starting', startedAt: new Date().toISOString(), parameters, calls: 0 }
  const save = () => fs.writeFileSync(stateFile, JSON.stringify(job, null, 2))
  const record = entry => fs.appendFileSync(path.join(folder, 'events.jsonl'), JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n')
  save()
  console.log(JSON.stringify({ theme: theme.id, slot, status: job.status }))
  const prompt = '用户已批准使用现有CodeBuddy积分为启幕重制全部主题视频，已告知VideoGen额外消耗积分（参考5秒50–100积分），积分充足，不需要再问。此进程负责其中一个素材。只调用一次内置VideoGen：先用ToolSearch加载定义，然后用DeferExecuteTool执行VideoGen，参数严格按下方JSON。不要其他工具，不读登录文件，不修改账号或配置，不充值，不订阅。无论成功失败都不得重复生成，不重试、不改变参数。等待此次任务完成后报告真实本地路径和状态即可。不要把请求时长当作实测时长。参数：\n' + JSON.stringify(parameters)
  await new Promise(resolve => {
    const child = spawn(process.execPath, [cli, '--print', '--output-format', 'stream-json', '--verbose', '--no-session-persistence', '--model', 'hy3', '--max-turns', '5', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--tools', 'ToolSearch,DeferExecuteTool,VideoGen', '--allowedTools', 'ToolSearch', 'DeferExecuteTool', 'VideoGen', '--permission-mode', 'default', '--', prompt], {
      cwd: __dirname, windowsHide: true, env: { ...process.env, DISABLE_AUTOUPDATER: '1', CODEBUDDY_DISABLE_COMPILE_CACHE: '1' }, stdio: ['ignore', 'pipe', 'pipe']
    })
    let buffer = '', diagnostics = '', completed = false, explicitlyFailed = false, rateLimited = false, quotaExhausted = false
    child.stdout.on('data', chunk => {
      buffer += chunk.toString()
      let newline
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1)
        let event
        try { event = JSON.parse(line) } catch { continue }
        if (event.type === 'assistant') for (const part of event.message?.content ?? []) {
          if (part.type === 'text') record({ type: 'assistant', text: safe(part.text).slice(0, 6000) })
          if (part.type === 'tool_use') {
            const isVideo = part.name === 'VideoGen' || part.input?.toolName === 'VideoGen'
            if (isVideo) { job.calls++; job.status = 'submitted'; save() }
            record({ type: 'tool_request', name: part.name, input: safe(JSON.stringify(part.input)).slice(0, 10000) })
            if (job.calls > 1) { job.status = 'unknown'; job.reason = '发现多次提交，停止并人工核查'; save(); child.kill() }
          }
        }
        if (event.type === 'user') for (const part of event.message?.content ?? []) if (part.type === 'tool_result') {
          record({ type: 'tool_result', isError: part.is_error, text: safe(JSON.stringify(part.content)).slice(0, 18000) })
          // 此服务的HTTP错误可能被包装为 isError:false 的文本，不能只检查布尔值。
          if (/Error: Request failed with status code 429/.test(JSON.stringify(part.content))) {
            rateLimited = true
            job.providerError = 'HTTP 429'
            const breaker = { reason: '视频服务返回HTTP 429，停止新提交', lastResponseAt: new Date().toISOString(), notBefore: new Date(Date.now() + 10 * 60000).toISOString(), job: theme.id + '/' + slot }
            const previousBreaker = fs.existsSync(breakerPath) ? JSON.parse(fs.readFileSync(breakerPath, 'utf8')) : null
            if (!previousBreaker?.blocked) fs.writeFileSync(breakerPath, JSON.stringify(breaker, null, 2))
            console.log(JSON.stringify({ rateLimited: true, notBefore: breaker.notBefore, note: '立即停止此队列后续任务；已有请求等待结果' }))
          }
          if (/14018/.test(JSON.stringify(part.content)) && /额度已用尽/.test(JSON.stringify(part.content))) {
            quotaExhausted = true
            job.providerError = '额度已用尽'
            job.providerErrorCode = 14018
            fs.writeFileSync(breakerPath, JSON.stringify({ blocked: true, reason: '当前视频服务额度已用尽；不自动重试、不购买加量包', at: new Date().toISOString(), job: theme.id + '/' + slot }, null, 2))
          }
          const result = parseResult(part.content)
          if (result) {
            job.providerStatus = result.status
            if (result.status === 'completed' && result.videos?.[0]?.localPath && fs.existsSync(result.videos[0].localPath)) {
              completed = true
              job.file = result.videos[0].localPath
              const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,size:stream=codec_name,width,height,r_frame_rate,nb_frames', '-of', 'json', job.file], { encoding: 'utf8', windowsHide: true })
              if (probe.status === 0) job.media = JSON.parse(probe.stdout)
              else { completed = false; job.reason = '下载媒体无法解码' }
            } else if (['failed', 'error', 'cancelled'].includes(result.status)) explicitlyFailed = true
            save()
          }
          if (part.is_error) explicitlyFailed = true
        }
        if (event.type === 'result') record({ type: 'result', isError: event.is_error, text: safe(event.result ?? event.errors ?? '').slice(0, 6000) })
      }
    })
    child.stderr.on('data', chunk => { if (diagnostics.length < 16000) diagnostics += chunk.toString() })
    child.on('error', error => { job.reason = error.code; explicitlyFailed = true })
    const timer = setTimeout(() => { job.reason = '超过12分钟尚未确认，不重复提交'; child.kill() }, 12 * 60000)
    child.on('close', code => {
      clearTimeout(timer)
      job.status = completed ? 'completed' : quotaExhausted ? 'quota_exhausted' : rateLimited ? 'rate_limited_unconfirmed' : explicitlyFailed || job.calls === 0 ? 'failed' : 'unknown'
      job.finishedAt = new Date().toISOString(); job.exitCode = code
      job.diagnostics = safe(diagnostics).split('\n').filter(line => /error|failed|denied|auth/i.test(line)).slice(0, 8).map(line => line.slice(0, 320))
      save()
      if (!completed) failures++
      console.log(JSON.stringify({ theme: theme.id, slot, status: job.status, seconds: job.media?.format?.duration, size: job.media?.format?.size, reason: job.reason }))
      resolve()
    })
  })
}

async function worker() {
  while (cursor < jobs.length) {
    if (coolingDown()) { console.log(JSON.stringify({ stopped: '等待服务限流恢复，不再提交后续任务' })); failures++; return }
    await generate(jobs[cursor++])
  }
}
Promise.all(Array.from({ length: workers }, worker)).then(() => { console.log(JSON.stringify({ finished: jobs.length, failures })); process.exitCode = failures ? 1 : 0 }).catch(error => { console.error(safe(error.stack)); process.exitCode = 1 })
