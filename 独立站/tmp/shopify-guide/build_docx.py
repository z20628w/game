from pathlib import Path
import json
import re
from docx import Document
from docx.shared import Cm, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.opc.constants import RELATIONSHIP_TYPE as RT

BASE = Path(__file__).resolve().parent
OUT = BASE.parents[1] / 'output' / 'Shopify开店上线手册'
OUT.mkdir(parents=True, exist_ok=True)
doc = Document()
sec = doc.sections[0]
sec.page_width = Cm(21)
sec.page_height = Cm(29.7)
sec.top_margin = Cm(1.9)
sec.bottom_margin = Cm(1.9)
sec.left_margin = Cm(2)
sec.right_margin = Cm(2)
sec.footer_distance = Cm(0.9)

def font_style(st, size, east='微软雅黑', latin='Calibri', bold=False):
    st.font.name = latin
    st.font.size = Pt(size)
    st.font.bold = bold
    st.font.italic = False
    st.font.color.rgb = RGBColor(0, 0, 0)
    rf = st.element.get_or_add_rPr().get_or_add_rFonts()
    rf.set(qn('w:eastAsia'), east)
    rf.set(qn('w:ascii'), latin)
    rf.set(qn('w:hAnsi'), latin)
    for key in list(rf.attrib):
        if 'Theme' in key or 'theme' in key:
            del rf.attrib[key]
    for el in list(st.element.xpath('./w:pPr/w:pBdr')):
        el.getparent().remove(el)

font_style(doc.styles['Normal'], 10.5)
normal = doc.styles['Normal'].paragraph_format
normal.line_spacing = 1.22
normal.space_after = Pt(6)
normal.widow_control = True
font_style(doc.styles['Title'], 27, bold=True)
doc.styles['Title'].paragraph_format.space_after = Pt(18)
for name, size in [('Heading 1',17), ('Heading 2',12.5)]:
    font_style(doc.styles[name],size,bold=True)
    fmt = doc.styles[name].paragraph_format
    fmt.space_before = Pt(16)
    fmt.space_after = Pt(8)
    fmt.keep_with_next = True
    fmt.keep_together = True
font_style(doc.styles['Subtitle'],12)
font_style(doc.styles['Caption'],9)
from docx.enum.style import WD_STYLE_TYPE
code = doc.styles.add_style('Code', WD_STYLE_TYPE.PARAGRAPH)
font_style(code,8.5,latin='Consolas')
code.paragraph_format.space_before = Pt(0)
code.paragraph_format.space_after = Pt(0)
code.paragraph_format.line_spacing = Pt(11)
code.paragraph_format.left_indent = Cm(.25)
code.paragraph_format.widow_control = False
code.paragraph_format.keep_with_next = False
for name in ['TOC 1','TOC 2']:
    if name not in doc.styles:
        doc.styles.add_style(name, WD_STYLE_TYPE.PARAGRAPH)
    font_style(doc.styles[name],10.5)
    doc.styles[name].paragraph_format.space_after = Pt(6)

def add_bookmark(p, name, n):
    start = OxmlElement('w:bookmarkStart')
    start.set(qn('w:id'),str(n))
    start.set(qn('w:name'),name)
    end = OxmlElement('w:bookmarkEnd')
    end.set(qn('w:id'),str(n))
    p._p.insert(0,start)
    p._p.append(end)

def hyperlink(p,text,url=None,anchor=None):
    h = OxmlElement('w:hyperlink')
    if url:
        rid=p.part.relate_to(url,RT.HYPERLINK,is_external=True)
        h.set(qn('r:id'),rid)
    if anchor:
        h.set(qn('w:anchor'),anchor)
    r = OxmlElement('w:r')
    rp = OxmlElement('w:rPr')
    color = OxmlElement('w:color'); color.set(qn('w:val'),'1F4E79');rp.append(color)
    fonts=OxmlElement('w:rFonts')
    fonts.set(qn('w:ascii'),'Calibri');fonts.set(qn('w:eastAsia'),'微软雅黑');rp.append(fonts)
    r.append(rp)
    t=OxmlElement('w:t');t.text=text;r.append(t);h.append(r);p._p.append(h)

def add_body(text,style=None):
    p=doc.add_paragraph(style=style)
    for part in re.split(r'(\[S\d+\])',text):
        if re.fullmatch(r'\[S\d+\]',part or ''):
            hyperlink(p,part,anchor=part[1:-1])
        else:
            p.add_run(part)
    if text.startswith('完成标准：'):
        for r in p.runs:r.bold=True
    return p

def make_table(rows):
    n=len(rows[0]); table=doc.add_table(rows=1,cols=n)
    table.alignment=WD_TABLE_ALIGNMENT.CENTER
    table.autofit=False
    if n==2: widths=[4.5,12.5]
    elif n==3: widths=[3.3,7.6,6.1]
    else: widths=[17/n]*n
    if rows[0][0]=='顺序': widths=[1.4,4.2,11.4]
    if rows[0][0]=='记录类型': widths=[3.3,3,10.7]
    if rows[0][0]=='文件':widths=[7,10]
    for col,w in zip(table.columns,widths):col.width=Cm(w)
    for i, row in enumerate(rows):
        cells=table.rows[0].cells if i==0 else table.add_row().cells
        trPr=table.rows[i]._tr.get_or_add_trPr()
        cant=OxmlElement('w:cantSplit');trPr.append(cant)
        if i==0:
            repeat=OxmlElement('w:tblHeader');trPr.append(repeat)
        for j, val in enumerate(row):
            c=cells[j];c.width=Cm(widths[j]);c.vertical_alignment=WD_CELL_VERTICAL_ALIGNMENT.CENTER
            tcPr=c._tc.get_or_add_tcPr()
            margins=OxmlElement('w:tcMar')
            for edge,v in [('top',85),('bottom',85),('left',100),('right',100)]:
                el=OxmlElement('w:'+edge);el.set(qn('w:w'),str(v));el.set(qn('w:type'),'dxa');margins.append(el)
            tcPr.append(margins)
            shd=OxmlElement('w:shd');shd.set(qn('w:fill'),'DCE6F1' if i==0 else 'FFFFFF');tcPr.append(shd)
            p=c.paragraphs[0];p.paragraph_format.space_after=Pt(0);p.paragraph_format.line_spacing=1.13
            if len(rows)<=7:
                p.paragraph_format.keep_with_next = i<len(rows)-1
            if j==0 and (rows[0][0]=='顺序' or rows[0][0]=='记录类型'):p.alignment=WD_ALIGN_PARAGRAPH.CENTER
            r=p.add_run(val);r.font.size=Pt(9.5);r.bold=i==0
    borders=OxmlElement('w:tblBorders')
    for edge in ['top','left','bottom','right','insideH','insideV']:
        el=OxmlElement('w:'+edge);el.set(qn('w:val'),'single');el.set(qn('w:sz'),'4');el.set(qn('w:color'),'D9D9D9');borders.append(el)
    table._tbl.tblPr.append(borders)
    p=doc.add_paragraph();p.paragraph_format.space_after=Pt(3);p.paragraph_format.space_before=Pt(0);p.paragraph_format.line_spacing=Pt(3);p.add_run().font.size=Pt(3)

lines=(BASE/'content.txt').read_text(encoding='utf-8').splitlines()
title=lines[0][2:]
doc.add_paragraph(title,style='Title')
doc.add_paragraph('拖拽装修  全代码主题开发  交易测试  正式发布',style='Subtitle')
intro_end=next(i for i,l in enumerate(lines) if l.startswith('## '))
for l in lines[1:intro_end]:
    if l.strip():add_body(l)
doc.add_paragraph('如何使用',style='Heading 2')
add_body('第 1 至 7 章完成共用开店配置；第 8 章完成拖拽装修；第 9 至 13 章完成代码开发与同步；第 14 至 18 章完成域名、测试、上线与日常排查。可以先做拖拽装修，再逐步加入代码定制。')
add_body('每次完成一章，检查该章完成标准。最后使用第 18 章验收清单和操作记录表核验上线结果。代码示例可从 Word 复制，命令中的店铺地址和主题 ID 必须替换。')
doc.add_page_break()
p=doc.add_paragraph('目录',style='Title')
toc=doc.add_paragraph()
field=OxmlElement('w:fldSimple');field.set(qn('w:instr'),'TOC \\o "1-1" \\h \\z \\u')
run=OxmlElement('w:r');text=OxmlElement('w:t');text.text='目录将在打开文档后更新';run.append(text);field.append(run);toc._p.append(field)
doc.add_page_break()
i=intro_end
in_code=False
while i<len(lines):
    l=lines[i]
    if l.startswith('```'):
        j=i+1
        while j<len(lines) and not lines[j].startswith('```'):
            j+=1
        for k,line in enumerate(lines[i+1:j]):
            p=doc.add_paragraph(style='Code');p.add_run(line)
            p.paragraph_format.keep_with_next=k<j-i-2
            if k==0:p.paragraph_format.space_before=Pt(5)
            if k==j-i-2:p.paragraph_format.space_after=Pt(7)
        i=j+1;continue
    if not l.strip():i+=1;continue
    if l.startswith('### '):doc.add_paragraph(l[4:],style='Heading 2')
    elif l.startswith('## '):doc.add_paragraph(l[3:],style='Heading 1')
    elif l.startswith('|'):
        rows=[]
        while i<len(lines) and lines[i].startswith('|'):
            rows.append([v.strip() for v in lines[i].strip('|').split('|')]);i+=1
        make_table(rows);continue
    elif l.startswith('- '):
        p=add_body('• '+l[2:]);p.paragraph_format.left_indent=Cm(.25)
    elif l.startswith('[ ] '):
        p=add_body('□  '+l[4:]);p.paragraph_format.space_after=Pt(7)
    else:add_body(l)
    i+=1

sources=json.loads((BASE/'sources.json').read_text(encoding='utf-8'))
for n,(sid,label,url) in enumerate(sources,1):
    p=doc.add_paragraph();p.paragraph_format.space_after=Pt(1);p.paragraph_format.keep_with_next=True
    add_bookmark(p,sid,1000+n)
    p.add_run(f'[{sid}] {label}').bold=True
    p=doc.add_paragraph();p.paragraph_format.space_after=Pt(7)
    hyperlink(p,url,url=url)
    for el in p._p.xpath('.//w:rPr'):
        sz=OxmlElement('w:sz');sz.set(qn('w:val'),'16');el.append(sz)

footer=sec.footer.paragraphs[0]
footer.alignment=WD_ALIGN_PARAGRAPH.CENTER
for s in ['PAGE','NUMPAGES']:
    if s=='NUMPAGES':footer.add_run(' / ')
    f=OxmlElement('w:fldSimple');f.set(qn('w:instr'),s);footer._p.append(f)
doc.core_properties.title=title
doc.core_properties.subject='Shopify 开店配置 拖拽装修 全代码主题开发 测试与上线'
doc.core_properties.author=''
doc.core_properties.keywords='Shopify,主题开发,开店,上线'
for el in list(doc.styles.element.xpath('.//w:pBdr')):
    el.getparent().remove(el)
for el in list(doc.settings.element.xpath('./w:updateStyles')):
    el.getparent().remove(el)
path=OUT/'Shopify从开店到上线操作手册.docx'
doc.save(path)
print(path)
print('chapters',sum(l.startswith('## ') for l in lines),'sources',len(sources))
