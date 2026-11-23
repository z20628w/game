import tempfile
import time
import unittest
import uuid
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

import httpx
import server


class EndpointTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.key = 'test-' + 'x' * 40
        self.patches = [patch.object(server, 'KEY', self.key),
                        patch.object(server, 'DATA', Path(self.temp.name))]
        for item in self.patches:
            item.start()
        (server.DATA / 'uploads').mkdir()
        (server.DATA / 'jobs').mkdir()
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=server.app), base_url='http://127.0.0.1:8765')

    async def asyncTearDown(self):
        await self.client.aclose()
        for item in reversed(self.patches):
            item.stop()
        self.temp.cleanup()

    async def test_auth_and_invalid_upload(self):
        for endpoint in ['/files', '/mcp', '/messages/']:
            response = await self.client.post(endpoint, content=b'anything')
            self.assertEqual(response.status_code, 401)
        response = await self.client.post('/files', content=b'not pages', headers={'Authorization': 'Bearer ' + self.key})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(list((server.DATA / 'uploads').iterdir()), [])

    async def test_signed_download_expiry_and_tampering(self):
        job_id = uuid.uuid4().hex
        folder = server.DATA / 'jobs' / job_id
        folder.mkdir()
        (folder / 'result.pdf').write_bytes(b'%PDF-test')
        server.write_state(folder, {'status': 'completed', 'format': 'pdf', 'output_file': 'result.pdf', 'expires_at': time.time()+1000})
        expiry = int(time.time()+100)
        token = server.signature(job_id, expiry)
        endpoint = f'/download/{job_id}?expires={expiry}&signature={token}'
        response = await self.client.get(endpoint)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, b'%PDF-test')
        self.assertEqual((await self.client.get(endpoint + 'bad')).status_code, 404)
        expired = int(time.time()-1)
        self.assertEqual((await self.client.get(f'/download/{job_id}?expires={expired}&signature={server.signature(job_id,expired)}')).status_code, 404)

    async def test_source_allowlist_and_private_addresses(self):
        with patch.object(server, 'SOURCE_HOSTS', {'files.example.com'}):
            for url in ['file:///etc/passwd', 'http://files.example.com/a', 'https://evil.example.com/a', 'https://files.example.com:8443/a']:
                with self.assertRaises(ValueError):
                    server.check_source_url(url)
            with patch('server.socket.getaddrinfo', return_value=[(2, 1, 6, '', ('127.0.0.1', 443))]):
                with self.assertRaises(ValueError):
                    server.check_source_url('https://files.example.com/a')

    async def test_download_pins_validated_address_and_refuses_redirect(self):
        from urllib.parse import urlsplit
        destination = server.DATA / 'download.pages'
        with patch('server.check_source_url', return_value=(urlsplit('https://files.example.com/a?token=test'), '8.8.8.8')), \
                patch('server.PinnedHTTPSConnection') as connection:
            response = connection.return_value.getresponse.return_value
            response.status = 200
            response.read.side_effect = [b'document', b'']
            server.fetch_file('https://files.example.com/a?token=test', destination)
            connection.assert_called_once_with('files.example.com', '8.8.8.8')
            self.assertEqual(destination.read_bytes(), b'document')
            response.status = 302
            with self.assertRaises(ValueError):
                server.fetch_file('https://files.example.com/a?token=test', server.DATA/'redirect.pages')
            self.assertFalse((server.DATA/'redirect.pages').exists())


if __name__ == '__main__':
    unittest.main()
