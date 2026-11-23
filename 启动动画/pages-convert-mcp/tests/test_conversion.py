import tempfile
import unittest
from pathlib import Path
from zipfile import ZipFile
from unittest.mock import patch

import converter
from repair_odt_tables import repair, parse_xml, paragraphs


class ConversionTests(unittest.TestCase):
    def test_rejects_non_pages_and_expanded_oversize(self):
        with tempfile.TemporaryDirectory() as temp:
            source = Path(temp) / 'bad.pages'
            with ZipFile(source, 'w') as archive:
                archive.writestr('preview.jpg', b'not a full document')
            with self.assertRaises(ValueError):
                converter.validate_pages(source, 1024 * 1024)
            with self.assertRaises(ValueError):
                converter.validate_pages(source, 1)

    def test_table_repair_preserves_text_and_rejects_content_loss(self):
        xml = b'''<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
        xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"
        xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"><office:automatic-styles><style:style style:name="row">
        <style:table-row-properties style:row-height="0.5cm"/></style:style></office:automatic-styles><office:body><office:text>
        <table:table><table:table-row><table:table-cell><text:p>A</text:p></table:table-cell><table:table-cell><text:p>B</text:p></table:table-cell></table:table-row>
        <table:table-row><table:table-cell><text:p/></table:table-cell><table:table-cell><text:p>C</text:p></table:table-cell></table:table-row>
        </table:table></office:text></office:body></office:document-content>'''
        with tempfile.TemporaryDirectory() as temp:
            source, target = Path(temp) / 'source.odt', Path(temp) / 'result.odt'
            with ZipFile(source, 'w') as archive:
                archive.writestr('content.xml', xml)
                archive.writestr('Pictures/test.bin', b'keep this resource')
            result = repair(source, target, ['1:1:1:2'])
            self.assertEqual(result['row_styles_changed'], 1)
            with ZipFile(target) as archive:
                self.assertEqual(paragraphs(parse_xml(xml)), paragraphs(parse_xml(archive.read('content.xml'))))
                self.assertEqual(archive.read('Pictures/test.bin'), b'keep this resource')
            with self.assertRaises(ValueError):
                repair(source, Path(temp) / 'loss.odt', ['1:2:1:2'])
            with self.assertRaises(ValueError):
                repair(source, target, [])

    def test_export_checks_real_output_not_just_exit_code(self):
        with tempfile.TemporaryDirectory() as temp:
            source = Path(temp) / 'source.pages'
            source.write_bytes(b'placeholder')
            with patch('converter.find_soffice', return_value='fake'), patch('converter.subprocess.Popen') as process:
                process.return_value.returncode = 0
                process.return_value.communicate.return_value = (b'', b'')
                with self.assertRaises(ValueError):
                    converter.export(source, Path(temp) / 'out', 'pdf', Path(temp) / 'profile')


if __name__ == '__main__':
    unittest.main()
