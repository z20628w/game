"""只使用本机 LibreOffice 的转换引擎；不访问在线转换服务。"""
import os
import re
import shutil
import subprocess
from pathlib import Path
from zipfile import ZipFile, BadZipFile

from lxml import etree as ET
from pypdf import PdfReader

from repair_odt_tables import repair, parse_xml, paragraphs, tables, rows


def find_soffice():
    supplied = os.getenv('SOFFICE_PATH', '')
    candidates = [supplied] if supplied else [
        str(Path(__file__).parent / '.runtime/lo/program/soffice.com'),
        shutil.which('soffice') or '',
        r'C:\Program Files\LibreOffice\program\soffice.com',
    ]
    for candidate in candidates:
        if candidate and Path(candidate).is_file():
            return str(Path(candidate).resolve())
    raise ValueError('未找到本地 LibreOffice，请配置 SOFFICE_PATH。')


def validate_pages(path, max_bytes):
    if path.stat().st_size > max_bytes:
        raise ValueError('文件超过允许大小。')
    try:
        with ZipFile(path) as archive:
            members = archive.infolist()
            if len(members) > 10000 or sum(x.file_size for x in members) > 300 * 1024 * 1024:
                raise ValueError('文档解压后体积过大。')
            names = {x.filename for x in members}
            if not ('Index/Document.iwa' in names or 'index.xml' in names or 'index.xml.gz' in names):
                raise ValueError('文件不是受支持的 Pages 文档包。')
            if any(x.flag_bits & 1 for x in members):
                raise ValueError('暂不支持加密文档。')
    except BadZipFile as exc:
        raise ValueError('文件不是有效的 Pages ZIP 包。') from exc


def export(source, output_dir, kind, profile):
    output_dir.mkdir(parents=True, exist_ok=True)
    filters = {'odt': 'odt:writer8', 'pdf': 'pdf:writer_pdf_Export',
               'docx': 'docx:Office Open XML Text'}
    output = output_dir / (source.stem + '.' + kind)
    if output.exists():
        raise ValueError('输出文件已存在，拒绝覆盖。')
    command = [find_soffice(), '-env:UserInstallation=' + profile.resolve().as_uri(),
               '--headless', '--norestore', '--convert-to', filters[kind],
               '--outdir', str(output_dir.resolve()), str(source.resolve())]
    flags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                               creationflags=flags, start_new_session=os.name != 'nt')
    try:
        process.communicate(timeout=150)
    except subprocess.TimeoutExpired:
        if os.name == 'nt':
            subprocess.run(['taskkill', '/PID', str(process.pid), '/T', '/F'],
                           capture_output=True, creationflags=flags)
        else:
            import signal
            os.killpg(process.pid, signal.SIGKILL)
        process.communicate()
        raise ValueError('本地转换超时，请人工检查文档。')
    if process.returncode != 0 or not output.exists() or output.stat().st_size < 100:
        raise ValueError('LibreOffice 未生成有效输出，可能不支持该文档。')
    return output


def convert(source, job_dir, kind, fix_heights, merges):
    profile = job_dir / 'profile'
    odt = export(source, job_dir / 'intermediate', 'odt', profile)
    with ZipFile(odt) as archive:
        root = parse_xml(archive.read('content.xml'))
    text_before = paragraphs(root)
    preview = [{'table': i, 'rows': [[''.join(c.itertext()) for c in row] for row in rows(t)]}
               for i, t in enumerate(tables(root), 1)]
    (job_dir / 'tables.json').write_text(__import__('json').dumps(preview, ensure_ascii=False), encoding='utf-8')
    if fix_heights or merges:
        repaired = job_dir / 'intermediate/repaired.odt'
        repair(odt, repaired, merges)
        odt = repaired
    output = export(odt, job_dir / 'output', kind, profile)
    # DOCX 重新导出为 PDF 用于机器检查；PDF 是内部预览，不代替 DOCX。
    check_pdf = output if kind == 'pdf' else export(output, job_dir / 'check', 'pdf', profile)
    pdf = PdfReader(check_pdf)
    text_after = '\n'.join(page.extract_text() or '' for page in pdf.pages)
    if not pdf.pages or (any(p.strip() for p in text_before) and not text_after.strip()):
        raise ValueError('输出正文为空，拒绝交付。')
    normalize = lambda text: re.sub(r'[\s\W_]+', '', text, flags=re.UNICODE)
    normalized = normalize(text_after)
    missing = [p for p in text_before if normalize(p) and normalize(p) not in normalized]
    warnings = ['已完成文件解析和正文检查，尚未人工逐页复核；字体与分页可能不同于 Pages 原版。']
    if fix_heights or merges:
        warnings.append('已调整表格行高；只应用明确指定的合并，不根据空格子猜测。')
    if missing:
        warnings.append(f'有 {len(missing)} 个段落无法在 PDF 提取文本中完整匹配，需要人工复核。')
    if tables(root) and not merges:
        warnings.append('文档包含表格，请检查合并关系与跨页布局。')
    return {'output_file': str(output.relative_to(job_dir)), 'page_count': len(pdf.pages),
            'warnings': warnings, 'unmatched_paragraphs': len(missing),
            'review_required': True, 'table_count': len(preview)}
