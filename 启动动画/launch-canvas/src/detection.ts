import { access, readdir, stat } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { Adapter, ScanResult } from './shared'
import { enforceBackgroundPolicy } from './background-policy'
import { currentCodexPath } from './codex-binding'
const run = promisify(execFile)
// 检测安装包本身时绕过 Electron 的 ASAR 虚拟文件系统，不尝试打开第三方归档。
const physicalAccess: typeof access = process.versions.electron ? require('original-fs').promises.access : access
async function physicalExists(path: string) { try { await physicalAccess(path); return true } catch { return false } }
const auxiliaryExecutable = /unins|uninstall|crash|update|elevat|helper|notification|setup|^repair|^maintenan|^diagnostic/i
const normalizedName = (value: string) => value.toLowerCase().replace(/[\s._-]/g, '')
export async function exists(path: string) { try { await access(path); return true } catch { return false } }
async function chromiumRuntime(folder:string){return await exists(join(folder,'resources.pak'))&&await exists(join(folder,'icudtl.dat'))}
// 启动器与实际窗口 EXE 分开识别，仍严格匹配完整路径，不把安装目录中所有进程都当成主进程。
export async function resolveWindowBinding(adapter:Adapter):Promise<Adapter>{
  const copy=structuredClone(adapter)
  if(!adapter.executable||!await exists(adapter.executable))return copy
  if(auxiliaryExecutable.test(basename(adapter.executable))&&!adapter.windowExecutable)return copy
  if(!copy.windowExecutable&&!await chromiumRuntime(dirname(copy.executable))){
    const nested=[]
    for(const sub of ['app','bin']){const file=join(dirname(copy.executable),sub,basename(copy.executable));if(await exists(file)&&await chromiumRuntime(dirname(file)))nested.push(file)}
    if(nested.length===1){
      const literal="'"+copy.executable.replace(/'/g,"''")+"'"
      const script=`[Console]::OutputEncoding=[Text.Encoding]::UTF8;$v=[Diagnostics.FileVersionInfo]::GetVersionInfo(${literal});Write-Output ($v.ProductName+' '+$v.FileDescription+' '+$v.OriginalFilename)`
      const metadata=await run('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,timeout:4000}).then(result=>result.stdout).catch(()=>'')
      if(/launcher|启动器|启动程序/i.test(metadata)){
        copy.windowExecutable=nested[0]
        copy.evidence.push('启动文件标注为启动器；已将同安装目录内的实际窗口程序单独绑定')
        copy.files.push({path:nested[0],purpose:'窗口监测程序',action:'核对主进程与窗口归属，不改写'})
      }
    }
  }
  const target=copy.windowExecutable||copy.executable
  if(copy.kind==='native'&&!copy.processModel&&await chromiumRuntime(dirname(target))){copy.processModel='chromium';copy.evidence.push('发现 Chromium 运行文件；窗口监测排除渲染、GPU 与崩溃处理子进程，背景能力仍需独立适配')}
  return copy
}
export async function discoverCodex(): Promise<string> {
  const script = "$p=Get-AppxPackage -Name OpenAI.Codex | Select-Object -First 1; if($p -and $p.SignatureKind -eq 'Store'){[Console]::OutputEncoding=[Text.Encoding]::UTF8; Write-Output (Join-Path $p.InstallLocation 'app\\ChatGPT.exe')}"
  const result = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true, timeout: 10000 })
  return result.stdout.trim()
}
export async function scanInstallation(input: string, officialCodex = '', presetsDirectory?: string): Promise<ScanResult> {
  const selected = resolve(currentCodexPath(input, officialCodex)), info = await stat(selected), folder = info.isDirectory() ? selected : dirname(selected)
  const candidates: string[] = []
  if (info.isFile()) { if (!/\.exe$/i.test(selected)) throw Error('请选择安装目录或 EXE 文件'); candidates.push(selected) }
  else {
    for (const path of [folder, join(folder, 'app'), join(folder, 'bin')]) {
      const entries = await readdir(path, { withFileTypes: true }).catch(() => [])
      for (const entry of entries) if (entry.isFile() && /\.exe$/i.test(entry.name) && !auxiliaryExecutable.test(entry.name)) candidates.push(join(path, entry.name))
    }
  }
  if (!candidates.length) throw Error('这个目录没有找到主程序，请选择包含 EXE 的安装目录')
  const folderName = normalizedName(basename(folder))
  const score = (file: string) => {
    if (officialCodex && file.toLowerCase() === officialCodex.toLowerCase()) return 10000
    const name = normalizedName(basename(file, '.exe'))
    return (name === folderName ? 1000 : 0) + (name === normalizedName(basename(dirname(file))) ? 500 : 0) + (dirname(file) === folder ? 10 : 0)
  }
  // 名称与安装目录匹配的主程序优先，不能按路径长度挑中更短的修复入口。
  candidates.sort((a, b) => score(b) - score(a) || a.localeCompare(b))
  const executable = candidates[0], root = dirname(executable)
  const asar = join(root, 'resources', 'app.asar'), unpacked = join(root, 'resources', 'app', 'package.json'), pak = join(root, 'resources.pak')
  const isCodex = !!officialCodex && executable.toLowerCase() === officialCodex.toLowerCase()
  const isAuxiliary = auxiliaryExecutable.test(basename(executable))
  const electron = !isAuxiliary && (await physicalExists(asar) || await physicalExists(unpacked)) && (await exists(pak) || await exists(join(root, 'icudtl.dat')))
  const kind = isCodex ? 'codex' : electron ? 'electron' : 'native'
  const adapter: Adapter = { kind, executable, args: [], title: '', pagePrefix: isCodex ? 'app://-/index.html' : '', selectors: ['#root'], capability: 'unavailable', evidence: [], files: [{ path: executable, purpose: '软件主程序', action: '绑定启动目标，不改写' }] }
  if (isCodex) adapter.evidence.push('与当前用户官方 Store Codex 安装记录匹配', '已有主窗口与动态背景适配规则')
  else if (electron) adapter.evidence.push('发现 Electron 应用包与 Chromium 运行文件', '框架识别仅用于启动与窗口监测，不代表内部背景已获启幕适配确认')
  else if (isAuxiliary) adapter.evidence.push('当前明确选择的是修复、更新或辅助程序，请确认是否应改选软件主程序', '同目录的 Electron 资源不代表辅助程序支持内部背景')
  else adapter.evidence.push('可通过 EXE 创建独立启动动画', '未发现可接入的 Electron 页面，当前不支持内部背景')
  for (const file of [asar, unpacked, pak]) if (await physicalExists(file)) adapter.files.push({ path: file, purpose: file.endsWith('asar') ? 'Electron 应用资源包' : '应用框架识别依据', action: '只读识别，不修改' })
  return { folder, candidates, adapter:await enforceBackgroundPolicy(await resolveWindowBinding(adapter),officialCodex), suggestedName: isCodex ? 'Codex' : basename(executable, '.exe') }
}
