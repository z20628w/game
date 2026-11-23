// 用 gltf-transform + meshoptimizer + sharp 重新压缩模型,替代 Python 版 trimesh 手搓 GLB 的方案。
// 优势: node 变换/材质/贴图引用/UV 全部由 gltf-transform 原生保留,不需要手工重建 GLB 二进制
// (之前 Python 脚本连续踩过 BIN chunk 类型笔误、贴图 bufferView 偏移量算错、白模漏掉 UV、
// 手动补 node 旋转这几个坑,都是因为手工重建 GLTF 结构太底层、太容易出错)。
// simplify() 用 lockBorder:true 保护网格边界,避免减面把源文件本来就有的小破洞进一步撑大。
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const { simplify, textureCompress, weld } = require('@gltf-transform/functions');
const { MeshoptSimplifier } = require('meshoptimizer');

const SRC_FOLDER = 'C:/Users/admin/Desktop/3d模型展示/3d模型';
const OUT_FOLDER = 'C:/Users/admin/Desktop/3d模型展示/3d模型-gltf-transform';
const TARGET_TRIS = 15000;
const TARGET_TEX_SIZE = 1024;

// 动态识别源目录下所有 .glb 模型(不再写死名字)
function listModels(folder) {
  return fs.readdirSync(folder)
    .filter(f => f.toLowerCase().endsWith('.glb'))
    .map(f => path.basename(f, '.glb'));
}

fs.mkdirSync(OUT_FOLDER, { recursive: true });

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

function countTriangles(document) {
  let total = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const indices = prim.getIndices();
      const posAccessor = prim.getAttribute('POSITION');
      const count = indices ? indices.getCount() : (posAccessor ? posAccessor.getCount() : 0);
      total += Math.floor(count / 3);
    }
  }
  return total;
}

async function processModel(name) {
  const srcPath = path.join(SRC_FOLDER, name + '.glb');
  const outPath = path.join(OUT_FOLDER, name + '.glb');
  console.log(`\n${'='.repeat(50)}\nProcessing: ${name}.glb`);

  const document = await io.read(srcPath);
  const originalTris = countTriangles(document);
  console.log(`  Original tris: ${originalTris.toLocaleString()}`);

  await document.transform(weld());

  if (originalTris > TARGET_TRIS) {
    const ratio = TARGET_TRIS / originalTris;
    console.log(`  Simplifying to ratio ${ratio.toFixed(4)} (target ~${TARGET_TRIS.toLocaleString()} tris)...`);
    await document.transform(
      simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.001, lockBorder: true })
    );
  } else {
    console.log(`  Skipping simplify (only ${originalTris.toLocaleString()} tris)`);
  }

  const newTris = countTriangles(document);
  console.log(`  New tris: ${newTris.toLocaleString()}`);

  await document.transform(
    textureCompress({
      encoder: sharp,
      targetFormat: 'jpeg',
      resize: [TARGET_TEX_SIZE, TARGET_TEX_SIZE],
      quality: 90,
    })
  );

  await io.write(outPath, document);

  const oldSize = fs.statSync(srcPath).size / 1024 / 1024;
  const newSize = fs.statSync(outPath).size / 1024 / 1024;
  console.log(`  RESULT: ${oldSize.toFixed(1)}MB -> ${newSize.toFixed(2)}MB [saved ${((1 - newSize / oldSize) * 100).toFixed(1)}%]`);
}

async function main() {
  const all = listModels(SRC_FOLDER);
  const only = process.argv[2];
  const list = only ? [only] : all;
  console.log(`目录识别到 ${all.length} 个模型: ${all.join('、')}`);
  for (const name of list) {
    try {
      await processModel(name);
    } catch (err) {
      console.error(`  [FATAL] ${name}: ${err.stack || err}`);
    }
  }
  console.log('\nALL DONE!');
}

main();
