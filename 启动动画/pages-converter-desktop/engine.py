"""桌面端本地转换引擎，支持取消、中文路径及同名另存。"""
import ctypes
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import uuid
from pathlib import Path
from zipfile import ZipFile, BadZipFile

from pypdf import PdfReader
from repair_odt_tables import repair, parse_xml, paragraphs, tables

LAUNCH_LOCK = threading.Lock()


class ConversionCancelled(Exception):
    pass


def app_folder():
    return Path(sys.executable).parent if getattr(sys, 'frozen', False) else Path(__file__).resolve().parent


def bundled_engine():
    resources = Path(getattr(sys, '_MEIPASS', Path(__file__).resolve().parent))
    manifest = resources / 'engine-manifest.json'
    if not manifest.is_file():
        return None
    metadata = json.loads(manifest.read_text(encoding='utf-8'))
    cache_root = Path(os.getenv('PAGES_CONVERTER_CACHE') or Path(os.getenv('LOCALAPPDATA', str(Path.home()))) / 'PagesConverter/engines').resolve()
    cache = cache_root / metadata['sha256'][:20]
    return resources / 'engine.zip', cache, metadata


def ready_engine(cache, metadata):
    try:
        return ((cache / '.ready').read_text(encoding='ascii') == metadata['sha256']
                and all((cache / 'program' / file).is_file() for file in ('soffice.com', 'soffice.exe', 'soffice.bin')))
    except OSError:
        return False


def ensure_engine(cancel, progress):
    bundled = bundled_engine()
    if bundled is None:
        return engine_path()
    archive_path, cache, metadata = bundled
    if ready_engine(cache, metadata):
        return engine_path()
    cache.parent.mkdir(parents=True, exist_ok=True)
    lock_path = cache.parent / (cache.name + '.lock')
    import msvcrt
    with lock_path.open('a+b') as lock:
        if lock_path.stat().st_size == 0:
            lock.write(b'0'); lock.flush()
        deadline = time.monotonic() + 600
        while True:
            check_cancel(cancel)
            try:
                lock.seek(0)
                msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
                break
            except OSError:
                if time.monotonic() > deadline:
                    raise ValueError('另一个窗口正在准备引擎，请稍后重试。')
                progress('另一个窗口正在准备本地引擎，请稍候…')
                time.sleep(0.2)
        staging = cache.parent / ('preparing-' + uuid.uuid4().hex)
        try:
            if ready_engine(cache, metadata):
                return engine_path()
            progress('首次使用：正在准备内置引擎…')
            if shutil.disk_usage(cache.parent).free < metadata['unpacked_bytes'] + 200 * 1024 * 1024:
                raise ValueError('本机缓存磁盘空间不足，请至少预留 2 GB 空间。')
            staging.mkdir()
            completed = 0
            last_percent = -1
            with ZipFile(archive_path) as archive:
                for entry in archive.infolist():
                    check_cancel(cancel)
                    target = (staging / entry.filename).resolve()
                    if not target.is_relative_to(staging):
                        raise ValueError('内置组件路径异常。')
                    if entry.is_dir():
                        target.mkdir(parents=True, exist_ok=True)
                        continue
                    target.parent.mkdir(parents=True, exist_ok=True)
                    with archive.open(entry) as source, target.open('xb') as destination:
                        while chunk := source.read(1024 * 1024):
                            check_cancel(cancel)
                            destination.write(chunk)
                            completed += len(chunk)
                            percent = int(completed * 100 / max(1, metadata['unpacked_bytes']))
                            if percent != last_percent:
                                progress(f'首次使用：正在准备内置引擎 {percent}%')
                                last_percent = percent
            (staging / '.ready').write_text(metadata['sha256'], encoding='ascii')
            if cache.exists():
                if cache.is_symlink() or not cache.resolve().is_relative_to(cache.parent):
                    raise ValueError('缓存路径异常，请更换缓存目录。')
                shutil.rmtree(cache)
            staging.rename(cache)
        finally:
            if staging.exists() and staging.resolve().is_relative_to(cache.parent):
                shutil.rmtree(staging)
            lock.seek(0)
            msvcrt.locking(lock.fileno(), msvcrt.LK_UNLCK, 1)
    return engine_path()


def engine_path():
    bundled = bundled_engine()
    if bundled is not None:
        _, cache, metadata = bundled
        if ready_engine(cache, metadata):
            return cache / 'program/soffice.com'
        raise ValueError('内置转换引擎尚未准备完成，请开始转换以自动准备。')
    candidates = [app_folder() / 'engine/program/soffice.com',
                  app_folder().parent / 'pages-convert-mcp/.runtime/lo/program/soffice.com']
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    raise ValueError('找不到转换引擎。请保留程序旁的 engine 文件夹，或重新解压完整程序包。')


def validate_source(source):
    if not source.is_file() or source.suffix.lower() != '.pages':
        raise ValueError('请选择有效的 .pages 文件。')
    if source.stat().st_size > 100 * 1024 * 1024:
        raise ValueError('暂不支持超过 100 MB 的文档。')
    try:
        with ZipFile(source) as archive:
            entries = archive.infolist()
            names = {entry.filename for entry in entries}
            if not names.intersection({'Index/Document.iwa', 'index.xml', 'index.xml.gz'}):
                raise ValueError('没有找到 Pages 正文，文件可能不完整或格式不受支持。')
            if any(entry.flag_bits & 1 for entry in entries):
                raise ValueError('暂不支持加密文档，请先在 Pages 中移除密码。')
            if len(entries) > 10000 or sum(entry.file_size for entry in entries) > 500 * 1024 * 1024:
                raise ValueError('文档展开后的体积过大，暂不支持转换。')
    except BadZipFile as exc:
        raise ValueError('无法读取文档，请确认它是完整的 Pages 文件。') from exc


def check_cancel(cancel):
    if cancel.is_set():
        raise ConversionCancelled('已取消转换。')


def launch(command):
    # 冻结程序的 DLL 搜索路径不能传给 LibreOffice，否则可能加载错误的同名库。
    environment = os.environ.copy()
    bundle = getattr(sys, '_MEIPASS', '')
    if bundle:
        environment['PATH'] = os.pathsep.join(p for p in environment.get('PATH', '').split(os.pathsep)
                                             if not p.lower().startswith(str(bundle).lower()))
    environment['SAL_DISABLE_OPENCL'] = '1'
    with LAUNCH_LOCK:
        if bundle and os.name == 'nt':
            ctypes.windll.kernel32.SetDllDirectoryW(None)
        try:
            return subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                    env=environment, creationflags=subprocess.CREATE_NO_WINDOW)
        finally:
            if bundle and os.name == 'nt':
                ctypes.windll.kernel32.SetDllDirectoryW(str(bundle))


def terminate(process):
    if process.poll() is None:
        subprocess.run(['taskkill', '/PID', str(process.pid), '/T', '/F'],
                       capture_output=True, creationflags=subprocess.CREATE_NO_WINDOW)
    process.communicate()


def export(source, output_dir, kind, profile, cancel):
    check_cancel(cancel)
    output_dir.mkdir(parents=True, exist_ok=True)
    filters = {'odt': 'odt:writer8', 'pdf': 'pdf:writer_pdf_Export', 'docx': 'docx:Office Open XML Text'}
    command = [str(engine_path()), '-env:UserInstallation=' + profile.resolve().as_uri(),
               '--headless', '--norestore', '--convert-to', filters[kind],
               '--outdir', str(output_dir), str(source)]
    process = launch(command)
    deadline = time.monotonic() + 180
    while True:
        if cancel.is_set():
            terminate(process)
            raise ConversionCancelled('已取消转换。')
        if time.monotonic() > deadline:
            terminate(process)
            raise ValueError('转换超时，文档可能过于复杂。请尝试在 Pages 中另存后重试。')
        try:
            process.communicate(timeout=0.25)
            break
        except subprocess.TimeoutExpired:
            continue
    output = output_dir / (source.stem + '.' + kind)
    if process.returncode != 0 or not output.is_file() or output.stat().st_size < 100:
        raise ValueError('转换引擎未能生成文件，该文档可能不受支持。')
    return output


def save_without_overwrite(source, folder, name):
    """排他创建文件，避免并发或同名文档覆盖已有结果。"""
    desired = Path(name)
    for number in range(10000):
        target = folder / (desired.name if number == 0 else f'{desired.stem} ({number}){desired.suffix}')
        try:
            output = target.open('xb')
        except FileExistsError:
            continue
        try:
            with output, source.open('rb') as input_file:
                shutil.copyfileobj(input_file, output)
            return target
        except BaseException:
            target.unlink(missing_ok=True)
            raise
    raise ValueError('输出目录中同名文件过多，请更换目录。')


def convert_document(source, output_dir, formats, fix_heights=True, cancel=None, progress=None):
    cancel = cancel or threading.Event()
    progress = progress or (lambda message: None)
    source, output_dir = Path(source).resolve(), Path(output_dir).resolve()
    if not formats or any(kind not in ('pdf', 'docx') for kind in formats):
        raise ValueError('请选择 PDF 或 Word 格式。')
    validate_source(source)
    ensure_engine(cancel, progress)
    output_dir.mkdir(parents=True, exist_ok=True)
    check_cancel(cancel)
    with tempfile.TemporaryDirectory(prefix='PagesConverter-') as temporary:
        work = Path(temporary)
        copied = work / 'document.pages'
        shutil.copyfile(source, copied)
        profile = work / 'profile'
        progress('正在读取 Pages 文档…')
        odt = export(copied, work / 'original', 'odt', profile, cancel)
        with ZipFile(odt) as archive:
            root = parse_xml(archive.read('content.xml'))
        text_before = paragraphs(root)
        table_count = len(tables(root))
        if fix_heights:
            progress('正在调整表格行高…')
            repaired = work / 'repaired.odt'
            repair(odt, repaired, [])
            odt = repaired
        artifacts = {}
        for kind in formats:
            progress('正在生成 ' + ('PDF' if kind == 'pdf' else 'Word') + '…')
            artifacts[kind] = export(odt, work / kind, kind, profile, cancel)
        progress('正在检查输出内容…')
        check_pdf = artifacts.get('pdf')
        if check_pdf is None:
            check_pdf = export(artifacts['docx'], work / 'check', 'pdf', profile, cancel)
        reader = PdfReader(check_pdf)
        if not reader.pages:
            raise ValueError('输出文档没有页面，请检查原文件。')
        text_after = '\n'.join(page.extract_text() or '' for page in reader.pages)
        if any(p.strip() for p in text_before) and not text_after.strip():
            raise ValueError('输出正文为空，已停止保存。')
        normalize = lambda text: re.sub(r'[\W_]+', '', text, flags=re.UNICODE)
        normalized = normalize(text_after)
        unmatched = sum(bool(normalize(p)) and normalize(p) not in normalized for p in text_before)
        check_cancel(cancel)
        saved = []
        try:
            for kind, artifact in artifacts.items():
                saved.append(save_without_overwrite(artifact, output_dir, source.stem + '.' + kind))
        except BaseException:
            # 只回收本次排他创建的结果；不会碰用户已有的同名文件。
            for path in saved:
                path.unlink(missing_ok=True)
            raise
        return {'files': [str(path) for path in saved], 'pages': len(reader.pages),
                'table_count': table_count, 'unmatched': unmatched,
                'note': '已完成自动检查。字体、分页和复杂表格可能与原版不同，请打开结果确认。'}
