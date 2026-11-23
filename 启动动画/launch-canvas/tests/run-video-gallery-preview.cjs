// 独立测试包只使用已验收子集，不写正式清单、不安装、不替换用户配置。
const { build } = require('esbuild')
const { mkdir, mkdtemp, readFile, writeFile, copyFile, symlink } = require('node:fs/promises')
const { createHash } = require('node:crypto')
const { resolve, join } = require('node:path')
const { spawn } = require('node:child_process')

;(async () => {
  const project = resolve('.'), production = join(project, 'preview/video-reboot/generated')
  const directions = JSON.parse((await readFile('preview/video-reboot/theme-directions.json', 'utf8')).replace(/^\uFEFF/, ''))
  const manifest = { version: 1, themes: {} }
  for (const theme of directions) {
    let review, assembly
    try { review = JSON.parse(await readFile(join(production, theme.id, 'visual-review.json'), 'utf8')); assembly = JSON.parse(await readFile(join(production, theme.id, 'assembly-qa.json'), 'utf8')) } catch { continue }
    if (review.rawVisualReview !== 'pass' || review.finalVisualReview !== 'pass' || !review.verifiedRecommended || !assembly.technicalPassed) continue
    const value = { verified: true, handoffSeconds: assembly.handoffSeconds, coldLabel: review.labels?.cold || theme.coldLabel, warmLabel: review.labels?.warm || theme.warmLabel }
    for (const slot of ['cold', 'warm', 'background']) {
      const file = `gallery/video/${theme.id}/${slot}.mp4`
      const hash = createHash('sha256').update(await readFile(join(project, 'resources', file))).digest('hex')
      if (hash !== review.reviewedFiles?.[slot]) throw Error('终片已改变，测试子集也不能冒用旧验收：' + theme.id + '/' + slot)
      value[slot] = { file, durationMs: assembly.clips[slot].durationMs }
    }
    manifest.themes[theme.id] = value
  }
  if (!Object.keys(manifest.themes).length) throw Error('目前没有完整验收的视频，无法进行真实视频图库测试')
  await mkdir('.test-data', { recursive: true })
  const appRoot = await mkdtemp(resolve('.test-data/video-preview-app-')), output = join(appRoot, 'dist')
  await mkdir(output)
  await writeFile(join(appRoot, 'package.json'), JSON.stringify({ name: 'launch-canvas-video-preview-test', version: require('../package.json').version, main: 'dist/main.js' }))
  await symlink(join(project, 'resources'), join(appRoot, 'resources'), 'junction')
  const plugins = [{ name: 'reviewed-video-test-manifest', setup(builder) { builder.onLoad({ filter: /[\\/]video-manifest\.json$/ }, () => ({ contents: JSON.stringify(manifest), loader: 'json' })) } }]
  await build({ entryPoints: ['src/main.ts', 'src/preload.ts', 'src/player-preload.ts', 'src/catalog.ts', 'src/video-catalog.ts'], bundle: true, platform: 'node', format: 'cjs', target: 'node22', external: ['electron', 'original-fs'], outdir: output, plugins })
  await build({ entryPoints: ['src/renderer.ts', 'src/player.ts'], bundle: true, platform: 'browser', format: 'iife', target: 'chrome130', outdir: output, plugins })
  for (const name of ['index.html', 'styles.css', 'player.html', 'player.css']) await copyFile(join(project, 'src', name), join(output, name))
  console.log('临时视频测试主题：' + Object.keys(manifest.themes).join(', '))
  await new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, ['tests/video-gallery.cjs'], { cwd: project, env: { ...process.env, LAUNCHCANVAS_TEST_APP_DIR: appRoot }, stdio: 'inherit', windowsHide: true })
    child.on('error', reject); child.on('exit', code => code === 0 ? resolveResult() : reject(Error('视频图库测试失败，退出代码：' + code)))
  })
})().catch(error => { console.error(error); process.exitCode = 1 })
