# -*- coding: utf-8 -*-
"""把 doubao-book-writer 合并出的 final.md 转换为符合 word skill
learning-and-training 规范的 .docx。只在本任务使用。"""
import re
from pathlib import Path
from docx import Document
from docx.shared import Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_ALIGN_VERTICAL
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

SRC = Path(r'D:\my_code\我的学习\3D游戏\deliverables\final.md')
OUT = Path(r'D:\my_code\我的学习\3D游戏\deliverables\从零开始的Web3D游戏开发手册.docx')

HEI = '黑体'
SONG = '宋体'
TNR = 'Times New Roman'
MONO = 'Consolas'

INLINE_RE = re.compile(r'(\*\*.+?\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))')
TABLE_SEP_RE = re.compile(r'^:?-{3,}:?$')


def set_run_font(run, east, ascii_font=TNR, size=None, bold=None):
    run.font.name = ascii_font
    rPr = run._element.get_or_add_rPr()
    rFonts = rPr.find(qn('w:rFonts'))
    if rFonts is None:
        rFonts = OxmlElement('w:rFonts')
        rPr.append(rFonts)
    rFonts.set(qn('w:ascii'), ascii_font)
    rFonts.set(qn('w:hAnsi'), ascii_font)
    rFonts.set(qn('w:eastAsia'), east)
    if size is not None:
        run.font.size = Pt(size)
    if bold is not None:
        run.font.bold = bold
    run.font.color.rgb = RGBColor(0, 0, 0)


def set_first_line_chars(p, chars):
    pPr = p._p.get_or_add_pPr()
    ind = pPr.find(qn('w:ind'))
    if ind is None:
        ind = OxmlElement('w:ind')
        pPr.append(ind)
    if chars:
        ind.set(qn('w:firstLineChars'), str(chars))
        ind.set(qn('w:firstLine'), str(int(chars / 100 * 240)))
    else:
        ind.set(qn('w:firstLineChars'), '0')
        ind.set(qn('w:firstLine'), '0')


def para_shading(p, fill):
    pPr = p._p.get_or_add_pPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear')
    shd.set(qn('w:fill'), fill)
    pPr.append(shd)


def add_inline(p, text, east=SONG, size=12, ascii_font=TNR):
    for tok in INLINE_RE.split(text):
        if not tok:
            continue
        if tok.startswith('**') and tok.endswith('**') and len(tok) > 4:
            r = p.add_run(tok[2:-2])
            set_run_font(r, east, ascii_font, size, bold=True)
        elif tok.startswith('`') and tok.endswith('`') and len(tok) > 2:
            r = p.add_run(tok[1:-1])
            set_run_font(r, east, MONO, size, bold=False)
        elif tok.startswith('[') and '](' in tok:
            m = re.match(r'\[([^\]]+)\]\(([^)]+)\)', tok)
            r = p.add_run(m.group(1))
            set_run_font(r, east, ascii_font, size)
        else:
            r = p.add_run(tok)
            set_run_font(r, east, ascii_font, size)


def style_setup(doc):
    styles = doc.styles
    normal = styles['Normal']
    normal.font.name = TNR
    normal.font.size = Pt(12)
    rpr = normal.element.get_or_add_rPr()
    rf = OxmlElement('w:rFonts')
    rf.set(qn('w:ascii'), TNR)
    rf.set(qn('w:hAnsi'), TNR)
    rf.set(qn('w:eastAsia'), SONG)
    rpr.append(rf)
    pf = normal.paragraph_format
    pf.line_spacing = 1.5
    pf.space_after = Pt(4)
    pf.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY

    def style_font(name, east, size, bold, before, after, align=None):
        st = styles[name]
        st.font.name = TNR
        st.font.size = Pt(size)
        st.font.bold = bold
        st.font.color.rgb = RGBColor(0, 0, 0)
        rpr = st.element.get_or_add_rPr()
        rf = OxmlElement('w:rFonts')
        rf.set(qn('w:ascii'), TNR)
        rf.set(qn('w:hAnsi'), TNR)
        rf.set(qn('w:eastAsia'), east)
        rpr.append(rf)
        pf = st.paragraph_format
        pf.space_before = Pt(before)
        pf.space_after = Pt(after)
        pf.keep_with_next = True
        if align is not None:
            pf.alignment = align
        return st

    style_font('Title', HEI, 18, True, 0, 12, WD_ALIGN_PARAGRAPH.CENTER)
    style_font('Heading 1', HEI, 14, True, 10, 5)
    style_font('Heading 2', HEI, 12, True, 8, 4)
    if 'CodeText' not in [s.name for s in styles]:
        code = styles.add_style('CodeText', 1)
        code.font.name = MONO
        code.font.size = Pt(10)
        pf = code.paragraph_format
        pf.line_spacing = 1.15
        pf.space_after = Pt(0)
        pf.alignment = WD_ALIGN_PARAGRAPH.LEFT


def set_table_borders(table):
    tblPr = table._tbl.tblPr
    borders = OxmlElement('w:tblBorders')
    for edge, sz in (('top', '8'), ('bottom', '8'), ('left', '8'), ('right', '8'),
                     ('insideH', '4'), ('insideV', '4')):
        el = OxmlElement('w:' + edge)
        el.set(qn('w:val'), 'single')
        el.set(qn('w:sz'), sz)
        el.set(qn('w:color'), '000000')
        borders.append(el)
    layout = tblPr.find(qn('w:tblLayout'))
    look = tblPr.find(qn('w:tblLook'))
    if layout is not None:
        layout.addprevious(borders)
    elif look is not None:
        look.addprevious(borders)
    else:
        tblPr.append(borders)


def row_cant_split(row):
    trPr = row._tr.get_or_add_trPr()
    trPr.append(OxmlElement('w:cantSplit'))


def row_repeat_header(row):
    trPr = row._tr.get_or_add_trPr()
    trPr.append(OxmlElement('w:tblHeader'))


def cell_shade(cell, fill):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear')
    shd.set(qn('w:fill'), fill)
    valign = tcPr.find(qn('w:vAlign'))
    if valign is not None:
        valign.addprevious(shd)
    else:
        tcPr.append(shd)


def add_table(doc, rows):
    ncols = len(rows[0])
    table = doc.add_table(rows=len(rows), cols=ncols)
    set_table_borders(table)
    table.autofit = False
    usable_cm = 21 - 2.5 * 2
    usable_twips = int(usable_cm * 567)
    col_w = int(usable_twips / ncols)
    # 显式声明表格总宽与网格列宽（twips），避免 Word 按极窄 tcW 将中文竖排
    tblPr = table._tbl.tblPr
    tblW = tblPr.find(qn('w:tblW'))
    if tblW is None:
        tblW = OxmlElement('w:tblW')
        tblPr.insert(0, tblW)
    tblW.set(qn('w:type'), 'dxa')
    tblW.set(qn('w:w'), str(usable_twips))
    grid = table._tbl.tblGrid
    if grid is not None:
        for gc in grid.findall(qn('w:gridCol')):
            gc.set(qn('w:w'), str(col_w))
    for r_idx, row_data in enumerate(rows):
        row = table.rows[r_idx]
        row_cant_split(row)
        if r_idx == 0:
            row_repeat_header(row)
        for c_idx, cell_text in enumerate(row_data):
            cell = row.cells[c_idx]
            tcPr = cell._tc.get_or_add_tcPr()
            tcW = tcPr.find(qn('w:tcW'))
            if tcW is None:
                tcW = OxmlElement('w:tcW')
                tcPr.insert(0, tcW)
            tcW.set(qn('w:type'), 'dxa')
            tcW.set(qn('w:w'), str(col_w))
            cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
            if r_idx == 0:
                cell_shade(cell, 'D9D9D9')
            p = cell.paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER if (r_idx == 0 or len(cell_text) <= 12) else WD_ALIGN_PARAGRAPH.LEFT
            p.paragraph_format.line_spacing = 1.0
            p.paragraph_format.space_after = Pt(3)
            set_first_line_chars(p, 0)
            add_inline(p, cell_text, SONG, 10.5)


def add_footer_page_number(doc):
    footer = doc.sections[0].footer
    p = footer.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run()
    set_run_font(run, SONG, TNR, 10.5)
    fld1 = OxmlElement('w:fldChar')
    fld1.set(qn('w:fldCharType'), 'begin')
    instr = OxmlElement('w:instrText')
    instr.set(qn('xml:space'), 'preserve')
    instr.text = ' PAGE '
    fld2 = OxmlElement('w:fldChar')
    fld2.set(qn('w:fldCharType'), 'end')
    run._r.append(fld1)
    run._r.append(instr)
    run._r.append(fld2)


def main():
    text = SRC.read_text(encoding='utf-8').replace('\ufeff', '')
    lines = text.split('\n')
    doc = Document()
    sec = doc.sections[0]
    sec.page_width = Cm(21)
    sec.page_height = Cm(29.7)
    sec.top_margin = sec.bottom_margin = sec.left_margin = sec.right_margin = Cm(2.5)
    style_setup(doc)
    add_footer_page_number(doc)

    title = None
    m = re.search(r'<!--\s*title:\s*(.+?)\s*-->', text)
    if m:
        title = m.group(1).strip()

    if title:
        p = doc.add_paragraph(style='Title')
        add_inline(p, title, HEI, 18, TNR)

    i = 0
    n = len(lines)
    while i < n:
        line = lines[i].rstrip('\n')
        stripped = line.strip()
        if stripped.startswith('<!--') or stripped == '---':
            i += 1
            continue
        if not stripped:
            i += 1
            continue
        if stripped.startswith('```'):
            i += 1
            while i < n and not lines[i].strip().startswith('```'):
                p = doc.add_paragraph(style='CodeText')
                set_first_line_chars(p, 0)
                r = p.add_run(lines[i].rstrip('\n'))
                set_run_font(r, SONG, MONO, 10)
                para_shading(p, 'F2F2F2')
                i += 1
            i += 1
            continue
        if stripped.startswith('|'):
            block = []
            while i < n and lines[i].strip().startswith('|'):
                cells = [c.strip() for c in lines[i].strip().strip('|').split('|')]
                if not all(TABLE_SEP_RE.match(c or '') for c in cells):
                    block.append(cells)
                i += 1
            if block:
                add_table(doc, block)
            continue
        if stripped.startswith('# '):
            p = doc.add_heading(level=1)
            add_inline(p, stripped[2:], HEI, 14, TNR)
            i += 1
            continue
        if stripped.startswith('## '):
            p = doc.add_heading(level=2)
            add_inline(p, stripped[3:], HEI, 12, TNR)
            i += 1
            continue
        if stripped.startswith('### '):
            p = doc.add_heading(level=3)
            add_inline(p, stripped[4:], HEI, 12, TNR)
            i += 1
            continue
        if stripped.startswith('- '):
            p = doc.add_paragraph(style='List Bullet')
            p.paragraph_format.line_spacing = 1.5
            p.paragraph_format.space_after = Pt(4)
            set_first_line_chars(p, 0)
            add_inline(p, stripped[2:], SONG, 12)
            i += 1
            continue
        p = doc.add_paragraph()
        set_first_line_chars(p, 200)
        add_inline(p, stripped, SONG, 12)
        i += 1

    props = doc.core_properties
    props.title = title or '从零开始的 Web 3D 游戏开发手册'
    props.language = 'zh-CN'
    OUT.parent.mkdir(parents=True, exist_ok=True)
    doc.save(str(OUT))
    print('saved:', OUT)


if __name__ == '__main__':
    main()
