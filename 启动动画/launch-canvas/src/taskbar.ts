import { app } from 'electron'
import { readFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { enforceBackgroundPolicy } from './background-policy'
import type { Profile } from './shared'
const run = promisify(execFile)
const repaired = new Map<string, string>()

/** 直接启动 Store EXE 不会取得包身份，按官方清单补齐窗口级任务栏信息。 */
export async function repairCodexTaskbar(profile: Profile, window: { handle: string; pid: number; found: boolean }, resources: string) {
  if (!window.found || profile.adapter.kind !== 'codex') return
  const adapter = await enforceBackgroundPolicy(profile.adapter)
  if (adapter.kind !== 'codex' || adapter.capability !== 'supported') return
  const executable = adapter.windowExecutable || adapter.executable
  const key = [window.pid, executable, profile.id].join('|')
  if (repaired.get(window.handle) === key) return
  const root = dirname(dirname(executable)), packageName = /^(.+)_\d+\.\d+\.\d+\.\d+_(?:x64|arm64)__(\w+)$/.exec(basename(root))
  if (!packageName) throw Error('无法读取 Codex 官方任务栏身份')
  const manifest = await readFile(join(root, 'AppxManifest.xml'), 'utf8')
  let applicationId = ''
  for (const match of manifest.matchAll(/<Application\b([^>]+)>/g)) {
    const file = /\bExecutable="([^"]+)"/.exec(match[1])?.[1]
    if (file?.replaceAll('\\', '/').toLowerCase() === 'app/chatgpt.exe') applicationId = /\bId="([a-zA-Z0-9.]+)"/.exec(match[1])?.[1] || ''
  }
  if (!applicationId) throw Error('官方安装清单没有 Codex 主程序身份')
  const appId = packageName[1] + '_' + packageName[2] + '!' + applicationId
  const target = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath
  const command = '"' + target + '" ' + (app.isPackaged ? '' : '"' + app.getAppPath() + '" ') + '--launch=' + profile.id
  await run(join(resources, 'native/TaskbarIcon.exe'), ['repair', executable, window.handle, join(dirname(executable), 'resources/icon-chatgpt.ico'), appId, command], { windowsHide: true, timeout: 4000 })
  repaired.set(window.handle, key)
  if (repaired.size > 128) { repaired.clear(); repaired.set(window.handle, key) }
}
