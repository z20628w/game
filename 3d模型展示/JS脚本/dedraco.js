// 把 3d模型-小程序/白模 里 Draco 压缩的 GLB "解压"回普通(非 Draco)格式,几何体/UV/贴图
// 引用完全不变,只是不再需要 DRACOLoader + Worker 才能解出来——WeChat 小程序的 JS 环境
// 没有标准浏览器 Worker,three-platformize 打包的 DRACOLoader.js 又是走 Worker 解码的,
// 基本走不通;干脆在构建时(Node 环境,draco3dgltf 提供的是能同步跑的解码模块,不需要
// Worker)把 Draco 几何体解开、按普通 float 数组重新写出来,小程序端用普通 GLTFLoader
// 就能读,不用碰 Draco。
const fs = require('fs');
const path = require('path');
const draco3d = require('draco3dgltf');
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');

const SRC_DIR = 'C:/Users/admin/Desktop/3d模型展示/3d模型-小程序/白模';
const OUT_DIR = 'C:/Users/admin/Desktop/3d模型展示/3d模型-小程序/白模-无draco';

fs.mkdirSync(OUT_DIR, { recursive: true });

// 动态识别源目录下所有 .glb(不再写死名字)
function listModels(folder) {
  return fs.readdirSync(folder)
    .filter(f => f.toLowerCase().endsWith('.glb'))
    .map(f => path.basename(f, '.glb'));
}

async function main() {
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      'draco3d.decoder': await draco3d.createDecoderModule(),
    });

  const names = listModels(SRC_DIR);
  console.log(`白模目录识别到 ${names.length} 个模型: ${names.join('、')}`);
  for (const name of names) {
    const srcPath = path.join(SRC_DIR, name + '.glb');
    const outPath = path.join(OUT_DIR, name + '.glb');
    console.log(`\n${'='.repeat(40)}\n${name}.glb`);

    const document = await io.read(srcPath);
    // 读取时 Draco 几何体已经被解码成普通 accessor 了;写出时不带 draco 扩展/不再压缩,
    // 就是个普通 GLB。清掉 KHR_draco_mesh_compression 的 extensionsUsed/Required 标记,
    // 避免残留声明让 GLTFLoader 误以为还需要 DRACOLoader。
    const root = document.getRoot();
    for (const ext of root.listExtensionsUsed()) {
      if (ext.extensionName === 'KHR_draco_mesh_compression') {
        ext.dispose();
      }
    }

    await io.write(outPath, document);

    const oldSize = fs.statSync(srcPath).size / 1024;
    const newSize = fs.statSync(outPath).size / 1024;
    console.log(`  ${oldSize.toFixed(0)}KB -> ${newSize.toFixed(0)}KB`);
  }
  console.log('\nALL DONE');
}

main().catch((err) => {
  console.error(err.stack || err);
  process.exit(1);
});
