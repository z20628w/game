import { shell } from 'electron'
import { readdir, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { safeShortcutName } from './domain'
import type { Profile } from './shared'

const samePath = (left: string, right: string) => resolve(left).toLowerCase() === resolve(right).toLowerCase()
const isFile = (file: string) => stat(file).then(value => value.isFile(), () => false)

/** 启动器与窗口程序分离时，使用实际窗口程序携带的应用图标。 */
export async function shortcutIcon(profile: Profile): Promise<string> {
  for (const file of [profile.adapter.windowExecutable, profile.adapter.executable]) {
    if (file && await isFile(file)) return file
  }
  throw Error('目标软件程序不存在，请重新选择安装路径')
}

export async function createSoftwareShortcut(directory: string, target: string, args: string, cwd: string, profile: Profile): Promise<string> {
  const icon = await shortcutIcon(profile), stem = safeShortcutName(profile.name) + ' · 启幕'
  let file = join(directory, stem + '.lnk'), suffix = 0
  while (await isFile(file)) {
    try {
      const old = shell.readShortcutLink(file)
      if (samePath(old.target, target) && old.args === args) break
    } catch { /* 无法读取或不属于本组的同名入口予以保留。 */ }
    suffix++
    file = join(directory, stem + '-' + profile.id.slice(0, 6) + (suffix > 1 ? '-' + suffix : '') + '.lnk')
  }
  if (!shell.writeShortcutLink(file, 'create', {
    target, args, cwd, description: '使用启幕打开 ' + profile.name,
    icon, iconIndex: 0, appUserModelId: 'local.launchcanvas.desktop'
  })) throw Error('无法创建桌面快捷方式')
  return file
}

/** 仅更新本安装创建、且仍对应现有软件组的入口，保留启动参数与自定义名称。 */
export async function refreshSoftwareShortcuts(directory: string, target: string, profiles: Profile[]): Promise<void> {
  for (const name of await readdir(directory)) {
    if (!name.toLowerCase().endsWith('.lnk')) continue
    const file = join(directory, name)
    try {
      const old = shell.readShortcutLink(file)
      if (!samePath(old.target, target)) continue
      const id = /^--launch(?:=|\s+)([a-f0-9-]{36})$/i.exec(old.args || '')?.[1]
      const profile = profiles.find(item => item.id === id)
      if (!profile) continue
      const icon = await shortcutIcon(profile)
      if (samePath(old.icon || target, icon) && old.iconIndex === 0) continue
      if (!shell.writeShortcutLink(file, 'update', { target: old.target, icon, iconIndex: 0 })) console.warn('桌面图标更新失败：', file)
    } catch { /* 目标已卸载、损坏或不可写的快捷方式不阻断启幕启动。 */ }
  }
}
