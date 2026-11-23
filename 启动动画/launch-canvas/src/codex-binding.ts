import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { Adapter } from './shared'

const packageName = /^OpenAI\.Codex_\d+\.\d+\.\d+\.\d+_(x64|arm64)__2p2nqsd0c76g0$/i
const same = (left: string, right: string) => resolve(left).toLowerCase() === resolve(right).toLowerCase()

/** official 只能来自当前用户的官方 Store 安装记录；旧包仍存在时也跟随更新。 */
export function currentCodexPath(input: string, official: string): string {
  if (!input || !official) return input
  const currentRoot = dirname(dirname(official)), parent = dirname(currentRoot)
  if (!packageName.test(basename(currentRoot)) || basename(parent).toLowerCase() !== 'windowsapps' || !same(official, join(currentRoot, 'app', 'ChatGPT.exe'))) return input
  const parts = relative(parent, resolve(input)).split(sep)
  if (!packageName.test(parts[0]) || !['', 'app', 'app/chatgpt.exe'].includes(parts.slice(1).join('/').toLowerCase())) return input
  return join(currentRoot, ...parts.slice(1))
}

export function rebindCodexAdapter(adapter: Adapter, official: string): Adapter {
  const copy = structuredClone(adapter), next = currentCodexPath(copy.executable, official)
  if (!next || same(next, copy.executable)) return copy
  // 人工绑定到另一个程序的窗口不能随 Codex 更新一并改写。
  if (copy.windowExecutable && !same(copy.windowExecutable, copy.executable) && !same(copy.windowExecutable, next)) return copy
  const oldRoot = dirname(dirname(copy.executable)), newRoot = dirname(dirname(next))
  copy.executable = next
  if (copy.windowExecutable) copy.windowExecutable = next
  copy.files = copy.files.map(file => {
    const suffix = relative(oldRoot, file.path)
    return !isAbsolute(suffix) && suffix !== '..' && !suffix.startsWith('..' + sep) ? { ...file, path: join(newRoot, suffix) } : file
  })
  copy.evidence = [...copy.evidence.filter(line => !line.startsWith('安装更新：')), '安装更新：已跟随当前用户官方 Store Codex 安装记录更新启动与窗口路径']
  return copy
}
