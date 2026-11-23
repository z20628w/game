/* 只恢复已提交的视频；在内存中适配原 CLI，不修改安装文件或接触登录凭据。 */
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const vm = require('node:vm')

const installRoot = 'D:/path_address/nvm/v24.18.0/node_modules/@tencent-ai/codebuddy-code'
const bundlePath = path.join(installRoot, 'dist/codebuddy-headless.js')
const approvedTasks = Object.freeze({
  'sakura/cold': '1312831544-WandVideo-c293e62441034249a246aca47caf0c49',
  'sakura/warm': '1312831544-WandVideo-f2f2c89e50654fbeabf293ba833a5e3e',
  'gemini-art/cold': '1312831544-WandVideo-5de42f2253904551be436ebc38d9f14b',
  'gemini-art/warm': '1312831544-WandVideo-01c136884f7c4267a0559bef62a9f1cf',
  'gemini-art/background': '1312831544-WandVideo-7a155b1a71a04c03a4a898aa59180b4a',
  'claude-anime/background': '1312831544-WandVideo-e88cac9c3056437aab41ab535caf9160'
})

function replaceOnce(source, from, to) {
  const first = source.indexOf(from)
  if (first < 0 || source.indexOf(from, first + from.length) >= 0) throw Error('CLI 代码契约发生变化，停止恢复')
  return source.slice(0, first) + to + source.slice(first + from.length)
}

function replaceMethod(source, start, next, replacement) {
  const first = source.indexOf(start)
  const end = source.indexOf(next, first)
  if (first < 0 || end < 0 || source.indexOf(start, first + start.length) >= 0) throw Error('CLI 方法契约发生变化，停止恢复')
  return replaceOnce(source, source.slice(first, end), replacement)
}

function transform(source) {
  source = replaceOnce(source, 'async initializeOutputDir(eA){this.outputDir=eA?oJ.PathUtils.resolveFilePathToWorkDir(eA):ac.join(oJ.PathUtils.getWorkDir(),"generated-videos"),await (0,sj.A0)(this.outputDir)}', 'async initializeOutputDir(){this.outputDir=globalThis.__launchCanvasVideoRecovery.outputDir;await (0,sj.A0)(this.outputDir)}')
  // 认证和请求均留在原 VideoService 内；这里不读取或导出 auth 对象。
  const recovery = 'async generateVideo(eA,el,ec){const r=globalThis.__launchCanvasVideoRecovery;if(!r)throw Error("Recovery context missing");r.begin();await this.initializeOutputDir(r.outputDir);const ed=el.context,eg=ed.abortSignal,{auth:ep,endpoint:eh}=await this.prepareRequest();let ey;try{ey=await this.pollTask(eh,ep.accessToken,r.taskId,ed,eg)}catch(error){r.queryError(error);throw Error("Existing video task query failed; sanitized details saved")}const files=await this.downloadVideos(ey,"recovered_existing_video",eg);r.complete(files);return{localPaths:files,warnings:["Recovered existing task; generation disabled"]}}'
  source = replaceMethod(source, 'async generateVideo(eA,el,ec){', 'async submitTask(eA,el,ec,ed,eu,ep){', recovery)
  source = replaceMethod(source, 'async submitTask(eA,el,ec,ed,eu,ep){', 'buildConfiguredRequest(eA,el,ec){', 'async submitTask(){throw Error("New video generation is disabled during recovery")}')
  source = replaceOnce(source, 'await this.sleep(hY,eu)', 'await this.sleep(30000,eu)')
  if (source.includes('/v2/videos/generations')) throw Error('恢复代码仍含视频生成请求，拒绝运行')
  new vm.Script(source, { filename: bundlePath }) // 只编译检查，不运行代码。
  return source
}

function inspect() {
  const version = JSON.parse(fs.readFileSync(path.join(installRoot, 'package.json'), 'utf8')).version
  if (version !== '2.179.3') throw Error('CLI 版本变化，需要重新审查恢复适配')
  return transform(fs.readFileSync(bundlePath, 'utf8'))
}

function summarizeQueryError(error) {
  const data = error?.response?.data?.error?.data
  const safeText = value => typeof value === 'string' || typeof value === 'number'
    ? String(value).replace(/https?:\/\/[^\s"<>]+/g, '[网址已隐藏]').replace(/Bearer\s+[^\s"\\]+/gi, '[凭据已隐藏]').replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)?\b/g, '[凭据已隐藏]').slice(0, 320)
    : undefined
  const status = error?.response?.status
  const retryValue = error?.response?.headers?.['retry-after']
  const retryText = typeof retryValue === 'string' || typeof retryValue === 'number' ? String(retryValue).slice(0, 100) : ''
  const retryAfter = /^\d+(?:\.\d+)?$/.test(retryText) ? retryText : Number.isFinite(Date.parse(retryText)) ? new Date(retryText).toUTCString() : undefined
  return {
    httpStatus: Number.isInteger(status) && status >= 100 && status <= 599 ? status : undefined,
    providerCode: safeText(data?.code),
    providerMessage: safeText(data?.msg),
    retryAfter
  }
}

function activate() {
  const key = process.env.LAUNCHCANVAS_RECOVER_EXISTING
  if (!Object.hasOwn(approvedTasks, key)) throw Error('仅允许恢复已确认的 6 个任务')
  const outputDir = path.resolve(__dirname, 'generated', key)
  const job = JSON.parse(fs.readFileSync(path.join(outputDir, 'job.json'), 'utf8'))
  if (job.status === 'completed' || job.calls !== 1) throw Error('任务状态不符合单次已提交恢复条件')
  const source = inspect()
  let started = false
  const write = value => fs.writeFileSync(path.join(outputDir, 'recovery-result.json'), JSON.stringify({ key, taskId: approvedTasks[key], ...value }, null, 2))
  const context = Object.freeze({
    taskId: approvedTasks[key], outputDir,
    begin() {
      if (started) throw Error('同一恢复进程只允许查询一次任务')
      started = true
      write({ status: 'querying', at: new Date().toISOString() })
    },
    queryError(error) {
      write({ status: 'query_failed', at: new Date().toISOString(), error: summarizeQueryError(error) })
    },
    complete(files) {
      if (!files.length || files.some(file => path.dirname(path.resolve(file)) !== outputDir || path.extname(file).toLowerCase() !== '.mp4')) throw Error('恢复产物路径异常')
      write({ status: 'downloaded', at: new Date().toISOString(), files })
    }
  })
  Object.defineProperty(globalThis, '__launchCanvasVideoRecovery', { value: context, writable: false, configurable: false })
  const originalLoader = Module._extensions['.js']
  Module._extensions['.js'] = function (module, filename) {
    const resolved = path.resolve(filename).toLowerCase()
    const dist = path.resolve(installRoot, 'dist').toLowerCase() + path.sep
    if (resolved.startsWith(dist) && /^codebuddy(?:-lite-wb)?\.js$/.test(path.basename(resolved))) throw Error('禁止回退到未禁用生成的 CLI 入口')
    if (resolved !== path.resolve(bundlePath).toLowerCase()) return originalLoader(module, filename)
    return module._compile(source, filename)
  }
}

if (process.env.LAUNCHCANVAS_RECOVER_EXISTING) activate()
module.exports = { approvedTasks, installRoot, inspect, transform, summarizeQueryError }
