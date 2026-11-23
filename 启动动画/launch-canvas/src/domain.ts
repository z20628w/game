import { isAbsolute, resolve, dirname } from 'node:path'
import type { Profile, Adapter, Database } from './shared'
import { parseGallerySource } from './catalog'
const uuid = /^[a-f0-9-]{36}$/i
function text(value: unknown, max: number): value is string { return typeof value === 'string' && value.length <= max && !value.includes('\0') }
export function validateAdapter(value: Adapter): Adapter {
  if (!value || !['codex', 'electron', 'native'].includes(value.kind) || !text(value.executable, 4096) || (value.executable && (!isAbsolute(value.executable) || !/\.exe$/i.test(value.executable)))) throw Error('目标程序必须是完整的 EXE 路径')
  if(value.windowExecutable!==undefined&&(!text(value.windowExecutable,4096)||!isAbsolute(value.windowExecutable)||!/\.exe$/i.test(value.windowExecutable)))throw Error('窗口监测程序必须是完整的 EXE 路径')
  if(value.processModel!==undefined&&value.processModel!=='chromium')throw Error('进程模型无效')
  if(value.windowClass!==undefined&&!text(value.windowClass,256))throw Error('窗口类型无效')
  if (!Array.isArray(value.args) || value.args.length > 32 || !value.args.every(arg => text(arg, 4096))) throw Error('启动参数格式无效')
  if (value.args.some(arg => /^--(?:remote-debugging|user-data-dir|inspect)/i.test(arg))) throw Error('调试端口与用户目录由适配器管理，请勿在参数中重复设置')
  if (!text(value.title, 160) || !text(value.pagePrefix, 1024) || (value.pagePrefix && !/^(app|file):\/\//.test(value.pagePrefix))) throw Error('主窗口规则无效，仅支持本地应用页面')
  if (!Array.isArray(value.selectors) || value.selectors.length > 20 || !value.selectors.every(selector => text(selector, 256) && !/[{}<>]/.test(selector))) throw Error('背景区域选择器无效')
  if (!['supported', 'candidate', 'unavailable'].includes(value.capability)) throw Error('适配能力无效')
  return structuredClone(value)
}
export function validateProfile(profile: Profile, database: Database): Profile {
  if (!profile || !uuid.test(profile.id) || !text(profile.name, 64) || !profile.name.trim()) throw Error('请填写 1–64 字的软件组名称')
  const copy = structuredClone(profile)
  copy.adapter = validateAdapter(profile.adapter)
  for (const slot of ['cold', 'warm', 'background'] as const) {
    const media = copy[slot]
    if (!media || !['cover', 'contain'].includes(media.fit) || typeof media.enabled !== 'boolean' || !Number.isFinite(media.opacity) || media.opacity < 0 || media.opacity > 100) throw Error('媒体设置无效')
    const gallery = parseGallerySource(media.source)
    const known = ['builtin:cold', 'builtin:eye', 'builtin:background'].includes(media.source) || (gallery && gallery.slot === slot) || database.assets.some(asset => media.source === 'asset:' + asset.id)
    if (!known || (slot === 'background' && media.source === 'builtin:cold')) throw Error('请选择有效的媒体素材')
    if (!Number.isFinite(media.durationMs) || (slot !== 'background' && (media.durationMs < 500 || media.durationMs > 60000))) throw Error('动画时长应为 0.5–60 秒')
  }
  if (copy.adapter.capability !== 'supported') copy.background.enabled = false
  copy.name = copy.name.trim(); copy.updatedAt = new Date().toISOString()
  return copy
}
export function parseManifest(raw: unknown, file: string): { adapter: Adapter; name: string } {
  const value = raw as Record<string, unknown>
  if (!value || value.version !== 1 || !text(value.name, 64) || !text(value.executable, 4096) || !value.executable) throw Error('适配配置需要 version: 1、name 和 executable')
  const background = (value.background ?? {}) as Record<string, unknown>
  const kind = value.framework === 'electron' ? 'electron' : 'native'
  const adapter: Adapter = { kind, executable: resolve(dirname(file), value.executable), args: (value.arguments ?? []) as string[], title: (value.windowTitle ?? '') as string, pagePrefix: (value.pagePrefix ?? '') as string, selectors: (background.selectors ?? ['#root']) as string[], capability:'unavailable', evidence: ['已导入启动与窗口规则；内部背景权限由启幕内置确认适配决定'], files: [{ path: file, purpose: '适配配置', action: '读取并复制规则到启幕' }] }
  if(value.windowExecutable!==undefined){if(!text(value.windowExecutable,4096)||!value.windowExecutable)throw Error('窗口监测程序无效');adapter.windowExecutable=resolve(dirname(file),value.windowExecutable)}
  if(value.processModel!==undefined)adapter.processModel=value.processModel as Adapter['processModel']
  if(value.windowClass!==undefined)adapter.windowClass=value.windowClass as string
  return { adapter: validateAdapter(adapter), name: value.name }
}
export function safeShortcutName(name: string): string { return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/, '').slice(0, 72) || '启动动画' }
