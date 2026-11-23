# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['D:\\my_code\\我的学习\\启动动画\\pages-converter-desktop\\app.py'],
    pathex=[],
    binaries=[],
    datas=[('D:\\my_code\\我的学习\\启动动画\\pages-converter-desktop\\bundle-assets\\engine.zip', '.'), ('D:\\my_code\\我的学习\\启动动画\\pages-converter-desktop\\bundle-assets\\engine-manifest.json', '.'), ('D:\\my_code\\我的学习\\启动动画\\pages-converter-desktop\\app.ico', '.')],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)
splash = Splash(
    'D:\\my_code\\我的学习\\启动动画\\pages-converter-desktop\\splash.png',
    binaries=a.binaries,
    datas=a.datas,
    text_pos=None,
    text_size=12,
    minify_script=True,
    always_on_top=True,
)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    splash,
    splash.binaries,
    [],
    name='Pages文档转换',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=['D:\\my_code\\我的学习\\启动动画\\pages-converter-desktop\\app.ico'],
)
