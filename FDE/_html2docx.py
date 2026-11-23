# -*- coding: utf-8 -*-
"""FDE 指南 HTML -> DOCX 转换器（BeautifulSoup 解析 + python-docx 输出）"""
import io
from bs4 import BeautifulSoup, Tag, NavigableString, Comment
from docx import Document
from docx.shared import Pt, RGBColor
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
from docx.opc.constants import RELATIONSHIP_TYPE as RT

SRC = r"D:\my_code\我的学习\FDE\FDE前沿部署工程师完全指南.html"
OUT = r"D:\my_code\我的学习\FDE\FDE前沿部署工程师完全指南.docx"

soup = BeautifulSoup(io.open(SRC, encoding='utf-8').read(), 'html.parser')
for t in soup(['style', 'script']):
    t.extract()
body = soup.body

# ---------------- docx helpers ----------------
def _shade(cell, rgb):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear'); shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'), '%02X%02X%02X' % rgb)
    tcPr.append(shd)

def _border(cell, rgb):
    tcPr = cell._tc.get_or_add_tcPr()
    b = OxmlElement('w:tcBorders')
    for edge in ('top', 'left', 'bottom', 'right'):
        e = OxmlElement('w:' + edge)
        e.set(qn('w:val'), 'single'); e.set(qn('w:sz'), '6')
        e.set(qn('w:space'), '0'); e.set(qn('w:color'), '%02X%02X%02X' % rgb)
        b.append(e)
    tcPr.append(b)

_bid = [0]
def _next_id():
    _bid[0] += 1; return _bid[0]

def add_bookmark(para, name):
    s = OxmlElement('w:bookmarkStart')
    s.set(qn('w:id'), str(_next_id())); s.set(qn('w:name'), name)
    e = OxmlElement('w:bookmarkEnd'); e.set(qn('w:id'), str(_next_id()))
    para._p.append(s); para._p.append(e)

def add_run(para, text, fmt):
    if not text:
        return
    r = para.add_run(text)
    if fmt['bold']: r.bold = True
    if fmt['italic']: r.italic = True
    if fmt['code']:
        r.font.name = 'Consolas'
        rPr = r._element.get_or_add_rPr()
        rf = rPr.find(qn('w:rFonts'))
        if rf is None:
            rf = OxmlElement('w:rFonts'); rPr.append(rf)
        rf.set(qn('w:ascii'), 'Consolas'); rf.set(qn('w:hAnsi'), 'Consolas')
        rf.set(qn('w:eastAsia'), 'Consolas')
    if fmt['color']:
        r.font.color.rgb = RGBColor(*fmt['color'])
    return r

def add_hyperlink(para, url, text, internal, doc):
    part = para.part
    hyper = OxmlElement('w:hyperlink')
    if internal:
        hyper.set(qn('w:anchor'), url[1:])
    else:
        rid = part.relate_to(url, RT.HYPERLINK, is_external=True)
        hyper.set(qn('r:id'), rid)
    r = OxmlElement('w:r')
    rPr = OxmlElement('w:rPr')
    st = OxmlElement('w:rStyle'); st.set(qn('w:val'), 'Hyperlink'); rPr.append(st)
    r.append(rPr)
    t = OxmlElement('w:t'); t.text = text; r.append(t)
    hyper.append(r)
    para._p.append(hyper)

def collect_text(node):
    if isinstance(node, NavigableString):
        return '' if isinstance(node, Comment) else str(node)
    return ''.join(collect_text(c) for c in node.children)

def add_inline(node, para, doc, fmt):
    if isinstance(node, NavigableString):
        if not isinstance(node, Comment):
            add_run(para, str(node), fmt)
        return
    if not isinstance(node, Tag):
        return
    tag = node.name
    cls = node.get('class') or []
    cl = cls if isinstance(cls, list) else [cls]
    if tag in ('strong', 'b'):
        nf = dict(fmt); nf['bold'] = True; _each(node, para, doc, nf)
    elif tag in ('em', 'i'):
        nf = dict(fmt); nf['italic'] = True; _each(node, para, doc, nf)
    elif tag == 'code':
        nf = dict(fmt); nf['code'] = True; _each(node, para, doc, nf)
    elif tag == 'span' and 'num' in cl:
        nf = dict(fmt); nf['bold'] = True; nf['color'] = (163, 45, 45); _each(node, para, doc, nf)
    elif tag == 'span' and ('en' in cl or 'src' in cl):
        nf = dict(fmt); nf['color'] = (91, 107, 124); _each(node, para, doc, nf)
    elif tag == 'span':
        _each(node, para, doc, fmt)
    elif tag == 'br':
        para.add_run().add_break()
    elif tag == 'a':
        url = node.get('href', '') or ''
        add_hyperlink(para, url, collect_text(node), url.startswith('#'), doc)
    else:
        _each(node, para, doc, fmt)

def _each(node, para, doc, fmt):
    for c in node.children:
        add_inline(c, para, doc, fmt)

def add_runs_children(node, para, doc):
    _each(node, para, doc, {'bold': False, 'italic': False, 'code': False, 'color': None})

# ---------------- block rendering ----------------
def render(node, sink, doc):
    if isinstance(node, NavigableString):
        if not isinstance(node, Comment):
            add_run(sink.add_paragraph(), str(node), {'bold': False, 'italic': False, 'code': False, 'color': None})
        return
    if not isinstance(node, Tag):
        return
    tag = node.name
    cls = node.get('class') or []
    cl = cls if isinstance(cls, list) else [cls]
    child_tags = [c for c in node.children if isinstance(c, Tag)]

    if tag in ('html', 'head', 'body', 'header', 'footer', 'div', 'section', 'article', 'main', 'wrap'):
        for c in node.children:
            render(c, sink, doc)
        return
    if tag == 'h1':
        para = sink.add_paragraph(); para.style = 'Title'; add_runs_children(node, para, doc); return
    if tag == 'h2':
        para = sink.add_paragraph(); para.style = 'Heading 1'; add_runs_children(node, para, doc); _bm(node, para, doc); return
    if tag == 'h3':
        para = sink.add_paragraph(); para.style = 'Heading 2'; add_runs_children(node, para, doc); _bm(node, para, doc); return
    if tag == 'h4':
        para = sink.add_paragraph(); para.style = 'Heading 3'; add_runs_children(node, para, doc); _bm(node, para, doc); return
    if tag in ('p',):
        para = sink.add_paragraph()
        if 'lead' in cl:
            add_runs_children(node, para, doc)
            for rr in para.runs: rr.font.size = Pt(15)
        elif 'meta' in cl:
            add_runs_children(node, para, doc)
            for rr in para.runs: rr.font.size = Pt(10.5); rr.font.color.rgb = RGBColor(91, 107, 124)
        else:
            add_runs_children(node, para, doc)
        return
    if tag == 'ul':
        render_list(node, sink, doc, False); return
    if tag == 'ol':
        render_list(node, sink, doc, True); return
    if tag == 'table':
        render_table(node, sink, doc); return
    if tag == 'blockquote':
        render_quote(node, sink, doc); return
    if tag == 'div' and 'toc' in cl:
        render_toc(node, sink, doc); return
    if tag == 'div' and ('card' in cl or 'note' in cl or 'warn' in cl or 'tip' in cl or 'beginner' in cl):
        render_box(node, sink, doc, cl); return
    if tag == 'div' and 'kv' in cl:
        para = sink.add_paragraph(); add_runs_children(node, para, doc)
        for rr in para.runs: rr.font.color.rgb = RGBColor(91, 107, 124); rr.font.size = Pt(10.5)
        return
    # 其它未知块：递归
    for c in node.children:
        render(c, sink, doc)

def _bm(node, para, doc):
    nid = node.get('id')
    if nid:
        add_bookmark(para, nid)

def render_toc(node, sink, doc):
    h = sink.add_paragraph(); h.add_run('目录').bold = True
    for c in node.children:
        if isinstance(c, Tag) and c.name == 'a':
            url = c.get('href', '') or ''
            para = sink.add_paragraph(style='List Bullet')
            add_hyperlink(para, url, collect_text(c), url.startswith('#'), doc)

def render_box(node, sink, doc, cl):
    if 'note' in cl: fill, border = (255, 248, 230), (169, 120, 31)
    elif 'warn' in cl: fill, border = (252, 235, 235), (163, 45, 45)
    elif 'tip' in cl: fill, border = (230, 241, 251), (24, 95, 165)
    elif 'beginner' in cl: fill, border = (234, 250, 241), (44, 107, 63)
    else: fill, border = (255, 255, 255), (221, 227, 234)   # card
    table = sink.add_table(rows=1, cols=1); table.style = 'Table Grid'
    cell = table.cell(0, 0)
    _shade(cell, fill); _border(cell, border)
    cur = cell.paragraphs[0]
    for c in node.children:
        t = c.name if isinstance(c, Tag) else '#text'
        if t in ('#text', 'strong', 'b', 'em', 'i', 'code', 'span', 'a', 'br'):
            add_inline(c, cur, doc, {'bold': False, 'italic': False, 'code': False, 'color': None})
        else:
            cur = None
            render(c, cell, doc)
            cur = cell.add_paragraph()
    for p in list(cell.paragraphs):
        if not p.text.strip() and not p.runs:
            p._p.getparent().remove(p._p)

def render_quote(node, sink, doc):
    table = sink.add_table(rows=1, cols=1); table.style = 'Table Grid'
    cell = table.cell(0, 0)
    _shade(cell, (240, 244, 248)); _border(cell, (44, 82, 114))
    para = cell.paragraphs[0]; add_runs_children(node, para, doc)

def render_list(node, sink, doc, ordered):
    for li in node.children:
        if not (isinstance(li, Tag) and li.name == 'li'):
            continue
        para = sink.add_paragraph(style='List Number' if ordered else 'List Bullet')
        for c in li.children:
            if isinstance(c, Tag) and c.name in ('p', 'ul', 'ol'):
                if c.name == 'p':
                    np = sink.add_paragraph(); add_runs_children(c, np, doc)
                else:
                    render_list(c, sink, doc, c.name == 'ol')
            else:
                add_inline(c, para, doc, {'bold': False, 'italic': False, 'code': False, 'color': None})

def render_table(node, sink, doc):
    rows = [c for c in node.children if isinstance(c, Tag) and c.name == 'tr']
    if not rows:
        return
    ncols = max(len([cc for cc in r.children if isinstance(cc, Tag) and cc.name in ('td', 'th')]) for r in rows)
    table = sink.add_table(rows=len(rows), cols=ncols); table.style = 'Table Grid'
    for i, r in enumerate(rows):
        cells = [cc for cc in r.children if isinstance(cc, Tag) and cc.name in ('td', 'th')]
        is_head = bool(cells) and cells[0].name == 'th'
        for j, cc in enumerate(cells):
            cell = table.cell(i, j)
            para = cell.paragraphs[0]; add_runs_children(cc, para, doc)
            if is_head:
                _shade(cell, (26, 58, 92))
                for rr in para.runs:
                    rr.font.color.rgb = RGBColor(255, 255, 255); rr.bold = True

# ---------------- run ----------------
doc = Document()
doc.styles['Normal'].font.name = 'Calibri'
doc.styles['Normal'].font.size = Pt(11)
render(body, doc, doc)
doc.save(OUT)
print("SAVED", OUT, "| 段落:", len(doc.paragraphs), "表格:", len(doc.tables))
