import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { config, runCli } from './store-api.mjs'

let previous
try { previous = JSON.parse(await readFile('store.local.json', 'utf8')) } catch (error) { if (error.code !== 'ENOENT') throw error }
const args = ['theme', 'push', '--path', 'theme', '--store', config.store, '--strict', '--json', '--no-input']
if (previous) {
  if (previous.storeDomain !== config.store || !/^\d+$/.test(previous.id)) throw new Error('本地主题记录与目标店铺不一致')
  const { themes } = await runCli(['theme', 'list', '--store', config.store, '--json', '--no-input'])
  const remote = themes.find(theme => theme.id === previous.id)
  // 本地记录可能过期。以店铺当前的主题角色为准，已发布主题拒绝上传。
  if (!remote || remote.role !== 'unpublished') throw new Error('目标主题不存在或已不再是未发布主题，停止上传')
  args.push('--theme', previous.id)
} else args.push('--unpublished', '--theme', config.themeName)
const result = await runCli(args)
await mkdir('reports', { recursive: true })
// 保留 CLI 原始结果，便于排查部分文件上传失败。
await writeFile('reports/deploy.json', JSON.stringify(result, null, 2))
if (result.theme) await writeFile('store.local.json', JSON.stringify(result.theme, null, 2))
if (result.status !== 'success' || !result.theme || result.issues?.some(issue => issue.severity === 'error')) throw new Error(`上传未完全成功，请查看 reports/deploy.json`)
console.log(JSON.stringify(result.theme, null, 2))
