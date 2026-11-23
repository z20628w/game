import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch, Mock
from zipfile import ZipFile

from engine import save_without_overwrite, convert_document, ConversionCancelled, export, ensure_engine


class EngineTests(unittest.TestCase):
    def test_embedded_engine_unpacks_once_and_reuses_cache(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder=Path(tmp)
            archive=folder/'engine.zip'
            with ZipFile(archive,'w') as z:
                for name in ['soffice.com','soffice.exe','soffice.bin']:
                    z.writestr('program/'+name,b'test')
            cache=folder/'cache'/'version'
            metadata={'sha256':'abc123','unpacked_bytes':12}
            with patch('engine.bundled_engine',return_value=(archive,cache,metadata)):
                result=ensure_engine(threading.Event(),lambda _:None)
                self.assertEqual(result,cache/'program/soffice.com')
                modified=result.stat().st_mtime_ns
                ensure_engine(threading.Event(),lambda _:None)
                self.assertEqual(modified,result.stat().st_mtime_ns)

    def test_embedded_engine_rejects_traversal(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder=Path(tmp); archive=folder/'engine.zip'
            with ZipFile(archive,'w') as z:
                z.writestr('../escape.txt',b'bad')
            with patch('engine.bundled_engine',return_value=(archive,folder/'cache/version',{'sha256':'abc123','unpacked_bytes':3})):
                with self.assertRaises(ValueError):
                    ensure_engine(threading.Event(),lambda _:None)
            self.assertFalse((folder/'cache/escape.txt').exists())

    def test_collision_does_not_overwrite(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            source = folder/'input.bin'
            source.write_bytes(b'new')
            (folder/'结果.pdf').write_bytes(b'old')
            result = save_without_overwrite(source,folder,'结果.pdf')
            self.assertEqual(result.name,'结果 (1).pdf')
            self.assertEqual((folder/'结果.pdf').read_bytes(),b'old')
            self.assertEqual(result.read_bytes(),b'new')

    def test_pre_cancel_does_not_start_engine(self):
        with tempfile.TemporaryDirectory() as tmp:
            cancel = threading.Event(); cancel.set()
            with patch('engine.launch') as launch:
                with self.assertRaises(ConversionCancelled):
                    export(Path(tmp)/'a.pages',Path(tmp)/'out','pdf',Path(tmp)/'profile',cancel)
                launch.assert_not_called()

    def test_invalid_input_is_not_converted(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp)/'invalid.pages'; path.write_bytes(b'bad')
            with patch('engine.export') as run:
                with self.assertRaises(ValueError):
                    convert_document(path,Path(tmp)/'out',['pdf'])
                run.assert_not_called()

    def test_cancel_during_process_stops_only_that_process(self):
        with tempfile.TemporaryDirectory() as tmp:
            cancel = threading.Event()
            process = Mock()
            def launch(command):
                cancel.set()
                return process
            with patch('engine.engine_path',return_value=Path('fake.exe')), patch('engine.launch',side_effect=launch), patch('engine.terminate') as terminate:
                with self.assertRaises(ConversionCancelled):
                    export(Path(tmp)/'a.pages',Path(tmp)/'out','pdf',Path(tmp)/'profile',cancel)
                terminate.assert_called_once_with(process)


if __name__=='__main__':
    unittest.main()
