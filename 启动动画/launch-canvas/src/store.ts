import { readFile, writeFile, rename, mkdir, copyFile, stat, unlink } from 'node:fs/promises'
import { join, extname, basename } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Database, Profile, Asset } from './shared'
import { validateProfile } from './domain'
import { enforceProfileBackground } from './background-policy'
import { synchronizeVideoDurations } from './video-catalog'
export class Store {
  data: Database = { version: 1, profiles: [], assets: [] }
  private queue: Promise<void> = Promise.resolve()
  constructor(readonly directory: string) {}
  async load() {
    await mkdir(join(this.directory, 'assets'), { recursive: true })
    try {
      const parsed = JSON.parse(await readFile(join(this.directory, 'profiles.json'), 'utf8')) as Database
      if (parsed.version !== 1 || !Array.isArray(parsed.profiles) || !Array.isArray(parsed.assets)) throw Error('配置格式不兼容')
      this.data = parsed
      let migrated = false
      for (const profile of this.data.profiles) migrated = synchronizeVideoDurations(profile) || migrated
      if (migrated) await this.persist()
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw Error('无法读取配置，请保留 profiles.json 后检查：' + String(error)) }
  }
  async persist() {
    const contents = JSON.stringify(this.data, null, 2)
    const operation = this.queue.catch(() => {}).then(async () => {
      const file = join(this.directory, 'profiles.json'), temporary = file + '.' + randomUUID() + '.tmp'
      await writeFile(temporary, contents, 'utf8'); await rename(temporary, file)
    })
    this.queue = operation; return operation
  }
  async save(profile: Profile) {
    const normalized = structuredClone(profile)
    synchronizeVideoDurations(normalized)
    const value = await enforceProfileBackground(validateProfile(normalized, this.data)), index = this.data.profiles.findIndex(item => item.id === value.id)
    if (index < 0) this.data.profiles.push(value); else this.data.profiles[index] = value
    await this.persist()
  }
  async remove(id: string) {
    if (!/^[a-f0-9-]{36}$/i.test(id)) throw Error('软件标识无效')
    await unlink(join(this.directory, 'runtime', id + '.json')).catch(error => { if (error.code !== 'ENOENT') throw error })
    await unlink(join(this.directory, 'runtime', id + '.launch.json')).catch(error => { if (error.code !== 'ENOENT') throw error })
    await unlink(join(this.directory, 'runtime', id + '.calibration.json')).catch(error => { if (error.code !== 'ENOENT') throw error })
    const previous = this.data.profiles
    this.data.profiles = previous.filter(profile => profile.id !== id)
    try { await this.persist() } catch (error) { this.data.profiles = previous; throw error }
  }
  async importAsset(file: string): Promise<Asset> {
    const extension = extname(file).toLowerCase(), info = await stat(file)
    if (!['.png', '.jpg', '.jpeg', '.webp', '.gif', '.mp4', '.webm'].includes(extension)) throw Error('支持 PNG、JPG、WebP、GIF、MP4 和 WebM')
    if (!info.isFile() || info.size > 64 * 1024 * 1024) throw Error('素材需要是小于 64 MB 的文件')
    const asset: Asset = { id: randomUUID(), name: basename(file), extension, size: info.size, kind: ['.mp4', '.webm'].includes(extension) ? 'video' : 'image' }
    await copyFile(file, join(this.directory, 'assets', asset.id + extension)); this.data.assets.push(asset); await this.persist(); return asset
  }
  assetPath(id: string) { const asset = this.data.assets.find(asset => asset.id === id); if (!asset) throw Error('素材不存在'); return join(this.directory, 'assets', asset.id + asset.extension) }
}
