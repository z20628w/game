const fs = require('node:fs')
const path = require('node:path')
const validator = require('gltf-validator')
const ts = require('typescript')

async function main() {
  const root = path.resolve(__dirname, '../云栖藏书阁')
  const bytes = fs.readFileSync(path.join(root, '模型/yunqi-library.glb'))
  const result = await validator.validateBytes(new Uint8Array(bytes), { maxIssues: 100 })
  fs.writeFileSync(path.join(root, 'glTF格式验收.json'), JSON.stringify(result, null, 2))
  const scripts = ['YunqiColliders.ts', 'YunqiWalkthrough.ts']
  const syntax = scripts.map(name => {
    const source = fs.readFileSync(path.join(root, '接入脚本', name), 'utf8')
    const result = ts.transpileModule(source, {
      fileName: name,
      reportDiagnostics: true,
      compilerOptions: {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.ESNext,
        experimentalDecorators: true
      }
    })
    return { name, errors: (result.diagnostics ?? []).map(item => ts.flattenDiagnosticMessageText(item.messageText, '\n')) }
  })
  fs.writeFileSync(path.join(root, '脚本语法验收.json'), JSON.stringify({
    scope: 'TypeScript 语法与转译检查；没有加载 Cocos 类型声明，不等同于引擎类型检查或运行测试',
    scripts: syntax
  }, null, 2))
  console.log(JSON.stringify({
    gltf: { errors: result.issues.numErrors, warnings: result.issues.numWarnings, infos: result.issues.numInfos },
    typescript: syntax
  }, null, 2))
  if (result.issues.numErrors || syntax.some(item => item.errors.length)) process.exitCode = 1
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
