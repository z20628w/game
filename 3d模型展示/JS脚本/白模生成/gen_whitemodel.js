// gen_whitemodel.js — 白模生成工具 (gltf-transform 管线)
// 重建自 2026-07-13 工作记录中的 _tmp/process.mjs（原脚本在清理 _tmp/ 时随目录一起丢失，此处恢复）。
// 流程：读源GLB → dedup → weld(保UV缝) → simplify(减到6万面) → 抽取纹理(可选) → 剥离纹理引用
//       → prune({keepAttributes:true}) → Draco压缩 → 输出白模GLB
//
// ⚠️ 关键坑点（来自记录）：prune() 必须带 keepAttributes:true，否则剥离纹理材质引用后，
//    three.js 会把 UV 当作未使用 accessor 删掉，导致运行时贴图全黑。
//
// 用法：
//   node JS脚本/gen_whitemodel.js                 # 动态扫描 3d模型/ 下全部 .glb，仅生成白模（不抽纹理）
//   node JS脚本/gen_whitemodel.js --model 碗       # 只处理单个模型
//   node JS脚本/gen_whitemodel.js --tex           # 同时从原始GLB重新抽取4K纹理（会覆盖 3d模型-小程序/纹理 下现有贴图！）
//   node JS脚本/gen_whitemodel.js --out <dir>      # 输出到指定基目录（测试用，避免动到正式目录）
//
// 默认 --tex 关闭：因为当前 3d模型-小程序/纹理 下是后来用 ImageGen 重做的高质量贴图，
// 从原始GLB抽出来的反而是较差的贴图，故默认不抽，避免误覆盖。

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const { dedup, weld, simplify, prune, draco } = require('@gltf-transform/functions');
const { MeshoptSimplifier } = require('meshoptimizer');
const draco3d = require('draco3dgltf');

const PROJECT = 'C:/Users/admin/Desktop/3d模型展示';
const SRC_FOLDER = path.join(PROJECT, '3d模型');
const TARGET_TRIS = 60000;

function listModels(folder) {
  if (!fs.existsSync(folder)) return [];
  return fs.readdirSync(folder)
    .filter(f => f.toLowerCase().endsWith('.glb'))
    .map(f => path.basename(f, '.glb'));
}

function countTris(doc) {
  let t = 0;
  for (const m of doc.getRoot().listMeshes())
    for (const p of m.listPrimitives()) {
      const idx = p.getIndices();
      const pos = p.getAttribute('POSITION');
      t += Math.floor((idx ? idx.getCount() : pos.getCount()) / 3);
    }
  return t;
}

function parseArgs() {
  const a = { model: null, tex: false, out: path.join(PROJECT, '3d模型-小程序') };
  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i] === '--model') a.model = process.argv[++i];
    else if (process.argv[i] === '--tex') a.tex = true;
    else if (process.argv[i] === '--out') a.out = path.resolve(process.argv[++i]);
  }
  return a;
}

async function buildIO() {
  return new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      'draco3d.decoder': await draco3d.createDecoderModule(),
      'draco3d.encoder': await draco3d.createEncoderModule(),
    });
}

// 从材质槽位抽取纹理（仅在 --tex 时调用）。baseColor→2048、normal/metalRough→1024，输出 WebP(q82)。
async function extractTextures(doc, name, texDir) {
  const root = doc.getRoot();
  const outDir = path.join(texDir, name);
  fs.mkdirSync(outDir, { recursive: true });
  const slots = { baseColor: null, normal: null, metalRough: null };
  for (const mat of root.listMaterials()) {
    if (!slots.baseColor) slots.baseColor = mat.getBaseColorTexture();
    if (!slots.normal) slots.normal = mat.getNormalTexture();
    if (!slots.metalRough) slots.metalRough = mat.getMetallicRoughnessTexture();
  }
  const target = { baseColor: 2048, normal: 1024, metalRough: 1024 };
  const jobs = [];
  for (const [k, tex] of Object.entries(slots)) {
    if (!tex) continue;
    const img = tex.getImage();
    const mime = tex.getMimeType();
    const ext = mime.includes('png') ? 'png' : 'jpeg';
    const tmp = path.join(outDir, '_src_' + k + '.' + ext);
    fs.writeFileSync(tmp, Buffer.from(img));
    jobs.push(
      sharp(tmp)
        .resize(target[k], target[k], { fit: 'fill' })
        .webp({ quality: 82 })
        .toFile(path.join(outDir, k + '.webp'))
        .then(() => fs.unlinkSync(tmp))
        .catch(e => console.log('  [纹理抽取失败] ' + k + ': ' + e.message))
    );
  }
  await Promise.all(jobs);
}

async function main() {
  const args = parseArgs();
  const io = await buildIO();
  const models = args.model ? [args.model] : listModels(SRC_FOLDER);
  if (models.length === 0) { console.log('未找到任何源模型于: ' + SRC_FOLDER); return; }

  const whiteDir = path.join(args.out, '白模');
  const texDir = path.join(args.out, '纹理');
  fs.mkdirSync(whiteDir, { recursive: true });

  const manifest = [];
  for (const name of models) {
    const src = path.join(SRC_FOLDER, name + '.glb');
    if (!fs.existsSync(src)) { console.log('  跳过(无源文件): ' + name); continue; }
    console.log('处理: ' + name);
    const doc = await io.read(src);

    let tris = countTris(doc);
    console.log('  原始面数: ' + tris);

    // dedup + weld + simplify 必须在同一次 transform 调用里链式执行，
    // 拆成多次 doc.transform() 会丢失中间状态，导致 simplify 达不到目标面数。
    const transforms = [dedup(), weld({ tolerance: 0 })];
    if (tris > TARGET_TRIS) {
      const ratio = TARGET_TRIS / tris;
      console.log('  simplify ratio=' + ratio.toFixed(3));
      transforms.push(simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.01, lockBorder: true }));
    }
    await doc.transform(...transforms);

    // 抽取纹理必须在剥离材质引用之前做（否则拿不到材质槽位的贴图指针）
    if (args.tex) {
      await extractTextures(doc, name, texDir);
      console.log('  纹理已抽取至 ' + path.join(texDir, name));
    }

    // 剥离所有纹理引用
    for (const mat of doc.getRoot().listMaterials()) {
      mat.setBaseColorTexture(null)
         .setNormalTexture(null)
         .setMetallicRoughnessTexture(null)
         .setEmissiveTexture(null)
         .setOcclusionTexture(null);
    }

    // 关键：keepAttributes:true 保留 UV，否则贴图会全黑
    await doc.transform(prune({ keepAttributes: true }));
    await doc.transform(draco());

    const outGlb = path.join(whiteDir, name + '.glb');
    await io.write(outGlb, doc);
    const sz = fs.statSync(outGlb).size / 1024 / 1024;
    console.log('  白模输出: ' + outGlb + ' (' + sz.toFixed(2) + ' MB)');
    manifest.push({ base: name, whiteSize: parseFloat(sz.toFixed(2)) });
  }

  // 合并式写 manifest：保留现有 manifest 的顺序 / textures / newTris，
  // 只更新 whiteSize；新增的模型(如小怪兽-2)若无贴图目录则 textures 置空对象，避免预览页崩溃。
  const outManifestPath = path.join(args.out, 'manifest.json');
  let existingArr = [];
  if (fs.existsSync(outManifestPath)) {
    try {
      const p = JSON.parse(fs.readFileSync(outManifestPath, 'utf8'));
      if (Array.isArray(p)) existingArr = p;
    } catch (e) { /* 损坏则重建 */ }
  }
  const newMap = Object.fromEntries(manifest.map(m => [m.base, m]));
  const texBase = path.join(args.out, '纹理');
  const merged = [];
  for (const e of existingArr) {
    if (newMap[e.base]) e.whiteSize = newMap[e.base].whiteSize;
    merged.push(e);
  }
  for (const m of manifest) {
    if (!existingArr.some(e => e.base === m.base)) {
      const hasTex = fs.existsSync(path.join(texBase, m.base, 'baseColor.webp'));
      const textures = hasTex
        ? { baseColor: 'baseColor.webp', normal: 'normal.webp', metalRough: 'metalRough.webp' }
        : { baseColor: null, normal: null, metalRough: null };
      merged.push({ base: m.base, whiteSize: m.whiteSize, newTris: 60000, textures });
    }
  }
  fs.writeFileSync(outManifestPath, JSON.stringify(merged, null, 2));
  console.log('完成。manifest 已写至 ' + outManifestPath + ' (' + merged.length + ' 个模型)');
}

main().catch(e => { console.error(e); process.exit(1); });
