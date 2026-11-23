"""生成包含全部运行环境与转换引擎的单文件免安装 EXE。"""
import hashlib
import json
import subprocess
import sys
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parent
ENGINE = ROOT.parent / 'pages-convert-mcp/.runtime/lo'
ASSETS = ROOT / 'bundle-assets'
DIST = ROOT.parent / 'output/单文件桌面版'
ASSETS.mkdir(exist_ok=True)
engine_zip = ASSETS / 'engine.zip'
manifest = ASSETS / 'engine-manifest.json'
if not (ENGINE / 'program/soffice.com').is_file():
    raise SystemExit('没有找到可打包的转换引擎。')
if not engine_zip.is_file() or not manifest.is_file():
    files = [p for p in ENGINE.rglob('*') if p.is_file() and p.suffix.lower() != '.msi']
    total = sum(p.stat().st_size for p in files)
    print(f'正在压缩内置引擎：{len(files)} 个文件，{total//1024//1024} MB', flush=True)
    with ZipFile(engine_zip, 'w', ZIP_DEFLATED, compresslevel=6) as archive:
        for path in files:
            archive.write(path, path.relative_to(ENGINE).as_posix())
    digest = hashlib.file_digest(engine_zip.open('rb'), 'sha256').hexdigest()
    manifest.write_text(json.dumps({'sha256': digest, 'unpacked_bytes': total, 'version': '25.8.7'}), encoding='utf-8')
    print(f'引擎压缩后：{engine_zip.stat().st_size//1024//1024} MB', flush=True)
subprocess.run([sys.executable, '-m', 'PyInstaller', '--noconfirm', '--clean', '--onefile', '--windowed',
               '--name', 'Pages文档转换', '--icon', str(ROOT/'app.ico'), '--splash', str(ROOT/'splash.png'),
               '--add-data', str(engine_zip)+';.', '--add-data', str(manifest)+';.',
               '--add-data', str(ROOT/'app.ico')+';.', '--distpath', str(DIST),
               '--workpath', str(ROOT/'build-single'), str(ROOT/'app.py')], cwd=ROOT, check=True)
print('单文件成品：'+str(DIST/'Pages文档转换.exe'), flush=True)
