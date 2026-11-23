"""检查 ODT 表格、调整固定行高，或应用明确指定的纵向合并。"""
import argparse
import json
from pathlib import Path
from zipfile import ZipFile

from lxml import etree as ET

NS = {
    's': 'urn:oasis:names:tc:opendocument:xmlns:style:1.0',
    't': 'urn:oasis:names:tc:opendocument:xmlns:table:1.0',
    'text': 'urn:oasis:names:tc:opendocument:xmlns:text:1.0',
}


def q(prefix, name):
    return '{' + NS[prefix] + '}' + name


def parse_xml(data):
    return ET.fromstring(data, ET.XMLParser(resolve_entities=False, no_network=True))


def tables(root):
    return root.findall('.//' + q('t', 'table'))


def rows(table):
    return table.xpath('./t:table-row|./t:table-header-rows/t:table-row|'
                       './t:table-rows/t:table-row', namespaces=NS)


def paragraphs(root):
    return [''.join(p.itertext()) for p in root.xpath('//text:p|//text:h', namespaces=NS)]


def validate_merge(root, spec):
    try:
        table_no, col, start, end = map(int, spec.split(':'))
    except ValueError as exc:
        raise ValueError('合并参数必须为 表号:列号:起始行:结束行') from exc
    all_tables = tables(root)
    if not (1 <= table_no <= len(all_tables) and col >= 1 and 1 <= start < end):
        raise ValueError('编号须从 1 开始，结束行必须大于起始行')
    table = all_tables[table_no-1]
    if table.xpath('./t:table-row-group|.//t:table', namespaces=NS):
        raise ValueError('此脚本不处理行组或嵌套表格的合并')
    all_rows = rows(table)
    if end > len(all_rows):
        raise ValueError('合并行号超出范围')
    cells_to_merge = []
    for row in all_rows[start-1:end]:
        if row.get(q('t', 'number-rows-repeated'), '1') != '1':
            raise ValueError('不支持重复行')
        cells = list(row)
        if col > len(cells):
            raise ValueError('合并列号超出范围')
        for cell in cells:
            if cell.tag != q('t', 'table-cell') or any(
                cell.get(q('t', attr), '1') != '1' for attr in
                ('number-columns-repeated', 'number-columns-spanned', 'number-rows-spanned')
            ):
                raise ValueError('选中行存在合并、覆盖或重复单元格，请人工核对结构')
        cells_to_merge.append(cells[col-1])
    for cell in cells_to_merge[1:]:
        if (''.join(cell.itertext()).strip()
                or any(e.tag not in (q('text', 'p'), q('text', 'span')) for e in cell.iterdescendants())
                or any(ET.QName(k).localname in
                       ('formula', 'value', 'string-value', 'date-value', 'time-value', 'boolean-value')
                       for k in cell.attrib)):
            raise ValueError('被覆盖单元格含有内容、对象、公式或值，拒绝合并')
    return (table_no, col, start, end), cells_to_merge


def repair(source, target, specs):
    if target.exists() or source.resolve() == target.resolve():
        raise ValueError('输出已存在或等于源文件，拒绝覆盖')
    with ZipFile(source) as archive:
        documents = {name: parse_xml(archive.read(name)) for name in
                     ('content.xml', 'styles.xml') if name in archive.namelist()}
        root = documents['content.xml']
        before = paragraphs(root)
        occupied, pending = set(), []
        # 对原始网格验证全部请求，再执行变更；允许同一组行合并多个相邻列。
        for spec in specs:
            (table_no, col, start, end), cells = validate_merge(root, spec)
            area = {(table_no, col, row) for row in range(start, end+1)}
            if occupied & area:
                raise ValueError('合并区域重叠')
            occupied.update(area)
            pending.append(cells)
        for cells in pending:
            cells[0].set(q('t', 'number-rows-spanned'), str(len(cells)))
            for cell in cells[1:]:
                cell.tag = q('t', 'covered-table-cell')
        changed = 0
        for document in documents.values():
            for props in document.findall('.//' + q('s', 'table-row-properties')):
                height = props.attrib.pop(q('s', 'row-height'), None)
                if height:
                    props.set(q('s', 'min-row-height'), height)
                    props.set(q('s', 'use-optimal-row-height'), 'true')
                    changed += 1
        if before != paragraphs(root):
            raise ValueError('正文发生变化，拒绝保存')
        target.parent.mkdir(parents=True, exist_ok=True)
        with ZipFile(target, 'x') as output:
            for item in archive.infolist():
                data = (ET.tostring(documents[item.filename], xml_declaration=True, encoding='UTF-8')
                        if item.filename in documents else archive.read(item.filename))
                output.writestr(item, data)
    return {'output': str(target.resolve()), 'row_styles_changed': changed, 'merges': specs}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    inspect = sub.add_parser('inspect', help='输出表格及行列文字供人工检查')
    inspect.add_argument('source', type=Path)
    fix = sub.add_parser('repair', help='调整行高，可选明确的纵向合并')
    fix.add_argument('source', type=Path)
    fix.add_argument('target', type=Path)
    fix.add_argument('--merge', action='append', default=[], metavar='表:列:起始行:结束行')
    args = parser.parse_args()
    if args.command == 'inspect':
        with ZipFile(args.source) as archive:
            root = parse_xml(archive.read('content.xml'))
        result = [{'table': i, 'name': t.get(q('t', 'name')), 'rows':
                   [[''.join(c.itertext()) for c in row] for row in rows(t)]}
                  for i, t in enumerate(tables(root), 1)]
    else:
        result = repair(args.source, args.target, args.merge)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
