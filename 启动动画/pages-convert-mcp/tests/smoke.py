"""用官方 MCP 客户端验证两个传输协议及真实的文件转换。"""
import argparse
import asyncio
import json
import os
import secrets
import socket
import subprocess
import sys
import time
from pathlib import Path
from zipfile import ZipFile

import httpx
from mcp import ClientSession
from mcp.client.sse import sse_client
from mcp.client.streamable_http import streamablehttp_client
from pypdf import PdfReader


def client_factory(**kwargs):
    return httpx.AsyncClient(trust_env=False, **kwargs)


def unpack(result):
    if result.isError:
        raise RuntimeError(result.content)
    return result.structuredContent or json.loads(result.content[0].text)


async def run(source, base, key, folder):
    headers = {'Authorization': 'Bearer ' + key}
    async with httpx.AsyncClient(base_url=base, trust_env=False, timeout=30) as client:
        assert (await client.post('/mcp', json={})).status_code == 401
        assert (await client.post('/files', content=b'invalid', headers=headers)).status_code == 400
        response = await client.post('/files', content=source.read_bytes(), headers=headers)
        response.raise_for_status()
        file_id = response.json()['file_id']
        async with streamablehttp_client(base+'/mcp', headers=headers, httpx_client_factory=client_factory) as (read, write, _):
            async with ClientSession(read, write) as session:
                await session.initialize()
                found = {tool.name for tool in (await session.list_tools()).tools}
                assert {'submit_conversion', 'conversion_status', 'conversion_capabilities'} <= found
                capabilities = unpack(await session.call_tool('conversion_capabilities', {}))
                assert capabilities['engine_ready'] is True
                invalid = await session.call_tool('submit_conversion', {'file_url': 'https://invalid.example/a.pages'})
                assert invalid.isError
                jobs = []
                for kind in ('pdf', 'docx'):
                    result = unpack(await session.call_tool('submit_conversion', {'file_id': file_id, 'output_format': kind}))
                    jobs.append((kind, result['job_id']))
                deadline = time.monotonic()+360
                report = []
                for kind, job_id in jobs:
                    while True:
                        status = unpack(await session.call_tool('conversion_status', {'job_id': job_id}))
                        if status['status'] == 'failed':
                            raise RuntimeError(status)
                        if status['status'] == 'completed':
                            break
                        if time.monotonic() > deadline:
                            raise RuntimeError('转换测试超时')
                        await asyncio.sleep(1)
                    download = await client.get(status['download_url'])
                    download.raise_for_status()
                    output = folder / ('result.'+kind)
                    output.write_bytes(download.content)
                    if kind == 'pdf':
                        assert len(PdfReader(output).pages) == status['page_count'] > 0
                    else:
                        with ZipFile(output) as archive:
                            assert 'word/document.xml' in archive.namelist()
                    report.append({'format': kind, 'page_count': status['page_count'],
                                   'bytes': len(download.content), 'review_required': status['review_required'],
                                   'unmatched_paragraphs': status['unmatched_paragraphs']})
        async with sse_client(base+'/sse', headers=headers, httpx_client_factory=client_factory) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                capabilities = unpack(await session.call_tool('conversion_capabilities', {}))
                assert capabilities['formats'] == ['pdf', 'docx']
        print(json.dumps({'protocols': ['Streamable HTTP', 'SSE'], 'outputs': report,
                          'output_directory': str(folder)}, ensure_ascii=False, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', required=True, type=Path)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    folder = root / '.runtime/smoke' / secrets.token_hex(6)
    folder.mkdir(parents=True)
    with socket.socket() as probe:
        probe.bind(('127.0.0.1', 0))
        port = probe.getsockname()[1]
    base = f'http://127.0.0.1:{port}'
    key = secrets.token_urlsafe(36)
    environment = dict(os.environ, MCP_API_KEY=key, PUBLIC_BASE_URL=base, BIND_HOST='127.0.0.1',
                       PORT=str(port), DATA_DIR=str(folder/'data'), SOURCE_HOSTS='', PYTHONUTF8='1')
    flags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
    with (folder/'server.log').open('w', encoding='utf-8') as log:
        process = subprocess.Popen([sys.executable, '-X', 'utf8', str(root/'server.py')], cwd=root,
                                   env=environment, stdout=log, stderr=log, creationflags=flags)
        try:
            deadline = time.monotonic()+25
            with httpx.Client(trust_env=False, timeout=1) as client:
                while True:
                    if process.poll() is not None:
                        raise RuntimeError('测试服务启动失败，请查看 '+str(folder/'server.log'))
                    try:
                        if client.get(base+'/health').status_code == 200:
                            break
                    except httpx.HTTPError:
                        pass
                    if time.monotonic() > deadline:
                        raise RuntimeError('测试服务启动超时')
                    time.sleep(0.2)
            asyncio.run(run(args.source.resolve(), base, key, folder))
        finally:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()


if __name__ == '__main__':
    main()
