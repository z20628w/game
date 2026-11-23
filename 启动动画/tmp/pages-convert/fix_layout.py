from pathlib import Path
from zipfile import ZipFile
from lxml import etree as E

base = Path(__file__).parent
source = next(base.glob('2026*.odt'))
ns = {
    's': 'urn:oasis:names:tc:opendocument:xmlns:style:1.0',
    't': 'urn:oasis:names:tc:opendocument:xmlns:table:1.0',
    'fo': 'urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0',
    'text': 'urn:oasis:names:tc:opendocument:xmlns:text:1.0',
}
def key(prefix, name):
    return '{' + ns[prefix] + '}' + name

with ZipFile(source) as original:
    root = E.fromstring(original.read('content.xml'))
    before = [''.join(p.itertext()) for p in root.findall('.//' + key('text', 'p'))]
    for row in root.findall('.//' + key('s', 'table-row-properties')):
        height = row.attrib.pop(key('s', 'row-height'), None)
        if height:
            row.set(key('s', 'min-row-height'), height)
        row.set(key('s', 'use-optimal-row-height'), 'true')
    tables = root.findall('.//' + key('t', 'table'))
    for style in root.findall('.//' + key('s', 'style')):
        if style.get(key('s', 'name'), '').startswith(('Table0.', 'Table1.')):
            props = style.find(key('s', 'table-cell-properties'))
            if props is not None:
                for side in ('top', 'bottom', 'left', 'right'):
                    props.attrib.pop(key('fo', 'border-' + side), None)
                props.set(key('fo', 'border'), '0.5pt solid #777777')
    for table_index, columns in ((0, [0, 1]), (1, [0, 1, 2])):
        rows = tables[table_index].xpath('./t:table-row|./t:table-header-rows/t:table-row', namespaces=ns)
        for column in columns:
            i = 1
            while i < len(rows):
                first = rows[i][column]
                if not ''.join(first.itertext()).strip():
                    i += 1
                    continue
                end = i + 1
                while end < len(rows) and not ''.join(rows[end][column].itertext()).strip():
                    end += 1
                if end - i > 1:
                    first.set(key('t', 'number-rows-spanned'), str(end-i))
                    for j in range(i+1, end):
                        rows[j][column].tag = key('t', 'covered-table-cell')
                i = end
    after = [''.join(p.itertext()) for p in root.findall('.//' + key('text', 'p'))]
    assert before == after, 'Text must remain unchanged'
    target = base / 'layout-fixed.odt'
    with ZipFile(target, 'w') as output:
        for item in original.infolist():
            data = E.tostring(root, xml_declaration=True, encoding='UTF-8') if item.filename == 'content.xml' else original.read(item.filename)
            output.writestr(item, data)
    print(target)
