"""生成免安装桌面程序，并附带本地转换引擎。"""
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ENGINE = ROOT.parent / 'pages-convert-mcp/.runtime/lo'
DIST = ROOT.parent / 'output/桌面版'

if not (ENGINE / 'program/soffice.com').is_file():
    raise SystemExit('缺少已准备好的 LibreOffice 转换引擎。')
subprocess.run([sys.executable, '-m', 'PyInstaller', '--noconfirm', '--clean', '--onedir', '--windowed',
                '--name', 'Pages文档转换', '--icon', str(ROOT/'app.ico'),
                '--distpath', str(DIST), '--workpath', str(ROOT/'build'),
                str(ROOT/'app.py')], cwd=ROOT, check=True)
package = DIST / 'Pages文档转换'
shutil.copytree(ENGINE, package/'engine', dirs_exist_ok=True, ignore=shutil.ignore_patterns('*.msi'))
shutil.copy2(ROOT/'app.ico', package/'app.ico')
shutil.copy2(ROOT/'使用说明.txt', package/'使用说明.txt')
print('已生成：' + str(package/'Pages文档转换.exe'))
