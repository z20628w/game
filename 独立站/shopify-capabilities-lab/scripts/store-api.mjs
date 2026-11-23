import { spawn } from 'node:child_process'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

export const root = fileURLToPath(new URL('../', import.meta.url))
export const config = JSON.parse(await readFile(path.join(root, 'config/project.json'), 'utf8'))
const cli = path.join(root, 'node_modules/@shopify/cli/bin/run.js')

export async function runCli(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], { cwd: root, windowsHide: true })
    let output = ''
    let error = ''
    child.stdout.on('data', chunk => { output += chunk })
    child.stderr.on('data', chunk => { error += chunk })
    child.on('error', reject)
    child.on('close', code => {
      if (code !== 0) return reject(new Error(output || error || `CLI 退出码 ${code}`))
      try { resolve(JSON.parse(output)) } catch { reject(new Error(`CLI 返回了非 JSON 内容：${output.slice(0, 500)}`)) }
    })
  })
}

// 用变量文件传数据，避免 Windows 命令行转义破坏 JSON；认证由官方 CLI 管理。
export async function graphql(query, variables = {}, mutation = false) {
  const dir = path.join(root, 'reports')
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, 'operation.graphql'), query)
  await writeFile(path.join(dir, 'variables.json'), JSON.stringify(variables))
  const args = ['store', 'execute', '--store', config.store, '--version', config.apiVersion,
    '--query-file', 'reports/operation.graphql', '--variable-file', 'reports/variables.json', '--json', '--no-input']
  if (mutation) args.push('--allow-mutations')
  const result = await runCli(args)
  if (result.errors?.length) throw new Error(JSON.stringify(result.errors))
  if (!result.data) throw new Error('GraphQL 没有返回数据')
  for (const payload of Object.values(result.data)) {
    if (payload?.userErrors?.length) throw new Error(JSON.stringify(payload.userErrors))
  }
  return result.data
}
