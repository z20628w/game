"""企业微信可接入的本地文档转换 MCP，兼容 HTTP 与 SSE。"""
import asyncio
import hashlib
import hmac
import http.client
import ipaddress
import json
import logging
import os
import secrets
import shutil
import socket
import ssl
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

from dotenv import load_dotenv
from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse, FileResponse
from starlette.routing import Route, Mount

from converter import convert, validate_pages, find_soffice

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT / '.env')
DATA = Path(os.getenv('DATA_DIR', str(ROOT / 'data'))).resolve()
KEY = os.getenv('MCP_API_KEY', '')
BASE = os.getenv('PUBLIC_BASE_URL', 'http://127.0.0.1:8765').rstrip('/')
MAX_BYTES = int(os.getenv('MAX_FILE_MB', '30')) * 1024 * 1024
RETENTION = int(os.getenv('RETENTION_HOURS', '24')) * 3600
SOURCE_HOSTS = {x.strip().lower() for x in os.getenv('SOURCE_HOSTS', '').split(',') if x.strip()}
logging.getLogger('httpx').setLevel(logging.WARNING)
logging.getLogger('httpcore').setLevel(logging.WARNING)
POOL = ThreadPoolExecutor(max_workers=2, thread_name_prefix='pages')
SLOTS = threading.BoundedSemaphore(6)
LOCK = threading.Lock()


def identifier(value):
    try:
        return uuid.UUID(value).hex
    except (ValueError, AttributeError) as exc:
        raise ValueError('文件或任务编号无效。') from exc


def write_state(folder, state):
    with LOCK:
        pending = folder / 'state.pending'
        pending.write_text(json.dumps(state, ensure_ascii=False), encoding='utf-8')
        pending.replace(folder / 'state.json')


def load_state(job_id):
    folder = DATA / 'jobs' / identifier(job_id)
    try:
        with LOCK:
            state = json.loads((folder / 'state.json').read_text(encoding='utf-8'))
    except FileNotFoundError as exc:
        raise ValueError('任务不存在或已过期。') from exc
    if time.time() > state['expires_at']:
        raise ValueError('任务已过期，请重新提交。')
    return folder, state


def signature(job_id, expires):
    return hmac.new(KEY.encode(), f'{job_id}:{expires}'.encode(), hashlib.sha256).hexdigest()


def public_state(job_id):
    _, state = load_state(job_id)
    result = {k: v for k, v in state.items() if k != 'output_file'}
    if state['status'] == 'completed':
        expiry = min(int(time.time()) + 3600, int(state['expires_at']))
        result['download_url'] = f'{BASE}/download/{job_id}?expires={expiry}&signature={signature(job_id, expiry)}'
        result['download_expires_at'] = expiry
    return result


def check_source_url(value):
    parsed = urlsplit(value)
    if (parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password
            or parsed.port not in (None, 443) or parsed.hostname.lower() not in SOURCE_HOSTS):
        raise ValueError('附件地址必须为管理员已允许的 HTTPS 域名；不能传本机路径。')
    addresses = socket.getaddrinfo(parsed.hostname, 443, type=socket.SOCK_STREAM)
    if not addresses or any(not ipaddress.ip_address(item[4][0]).is_global for item in addresses):
        raise ValueError('附件地址不能指向本机、内网或保留地址。')
    return parsed, addresses[0][4][0]


class PinnedHTTPSConnection(http.client.HTTPSConnection):
    """实际连接校验过的 IP，同时用原主机名验证 TLS，防止 DNS 重绑定。"""
    def __init__(self, host, address):
        super().__init__(host, timeout=30, context=ssl.create_default_context())
        self.address = address

    def connect(self):
        sock = socket.create_connection((self.address, 443), timeout=self.timeout)
        try:
            self.sock = self._context.wrap_socket(sock, server_hostname=self.host)
        except BaseException:
            sock.close()
            raise


def fetch_file(url, destination):
    parsed, address = check_source_url(url)
    size = 0
    # 不跟随跳转，不发送服务密钥，不使用系统代理；网络请求只用于获取明确的附件。
    connection = PinnedHTTPSConnection(parsed.hostname, address)
    deadline = time.monotonic() + 120
    try:
        path = (parsed.path or '/') + ('?' + parsed.query if parsed.query else '')
        connection.request('GET', path, headers={'Accept-Encoding': 'identity'})
        response = connection.getresponse()
        if response.status != 200:
            raise ValueError('附件下载失败或地址发生跳转，请提供可直接访问的附件地址。')
        with destination.open('xb') as stream:
            while chunk := response.read(64 * 1024):
                size += len(chunk)
                if size > MAX_BYTES or time.monotonic() > deadline:
                    raise ValueError('附件超过允许大小或下载超时。')
                stream.write(chunk)
    finally:
        connection.close()


def worker(job_id, file_id, file_url, fix_heights, merges):
    folder = DATA / 'jobs' / identifier(job_id)
    with LOCK:
        state = json.loads((folder / 'state.json').read_text(encoding='utf-8'))
    source = folder / 'source.pages'
    try:
        state['status'] = 'running'
        write_state(folder, state)
        if file_id:
            upload = DATA / 'uploads' / (identifier(file_id) + '.pages')
            if not upload.is_file() or time.time() - upload.stat().st_mtime > RETENTION:
                raise ValueError('上传文件不存在或已过期。')
            shutil.copyfile(upload, source)
        else:
            fetch_file(file_url, source)
        validate_pages(source, MAX_BYTES)
        state.update(convert(source, folder, state['format'], fix_heights, merges))
        state['status'] = 'completed'
    except Exception as exc:
        state['status'] = 'failed'
        # 不把含临时下载令牌的 URL 或底层异常全文写入返回值。
        state['error'] = str(exc) if isinstance(exc, ValueError) else '处理失败，请检查引擎安装或服务器日志。'
    finally:
        write_state(folder, state)
        SLOTS.release()


host = urlsplit(BASE).hostname or '127.0.0.1'
mcp = FastMCP('Pages 本地转换', stateless_http=True, json_response=True,
              transport_security=TransportSecuritySettings(
                  enable_dns_rebinding_protection=True,
                  allowed_hosts=[host, host + ':*', '127.0.0.1:*', 'localhost:*'],
                  allowed_origins=[BASE]))


@mcp.tool()
def conversion_capabilities() -> dict:
    """查询支持的格式、最大文件大小与附件接入方式。转换不调用第三方转换网站或 AI API。"""
    try:
        find_soffice()
        available = True
    except ValueError:
        available = False
    return {'formats': ['pdf', 'docx'], 'engine_ready': available,
            'max_file_mb': MAX_BYTES // 1024 // 1024,
            'allowed_source_hosts': sorted(SOURCE_HOSTS),
            'upload_endpoint': BASE + '/files',
            'note': '使用真实附件下载 URL，或上传后得到的 file_id；不接受用户电脑的路径，也不要编造下载地址。'}


@mcp.tool()
def submit_conversion(output_format: Literal['pdf', 'docx'] = 'pdf', file_url: str = '',
                      file_id: str = '', fix_table_heights: bool = True,
                      confirmed_merges: list[str] | None = None) -> dict:
    """提交 Pages 转换，返回任务编号，随后调用 conversion_status。

    file_url 与 file_id 二选一。URL 必须来自用户真实附件且属于允许的域名。
    confirmed_merges 只接受已有预览或源结构证实的纵向合并，格式为 表:列:首行:末行，编号从1开始。
    不能根据空单元格猜测合并；转换完成也不代表已人工检查版式。
    """
    if bool(file_url) == bool(file_id):
        raise ValueError('请仅提供 file_url 或 file_id 中的一项。')
    if len(file_url) > 8192 or len(confirmed_merges or []) > 200:
        raise ValueError('附件地址或合并参数过长。')
    if file_id:
        identifier(file_id)
    if file_url:
        check_source_url(file_url)
    find_soffice()
    if not SLOTS.acquire(blocking=False):
        raise ValueError('转换队列已满，请稍后重试。')
    job_id = uuid.uuid4().hex
    folder = DATA / 'jobs' / job_id
    try:
        folder.mkdir(parents=True)
        state = {'job_id': job_id, 'status': 'queued', 'format': output_format,
                 'created_at': int(time.time()), 'expires_at': int(time.time()) + RETENTION}
        write_state(folder, state)
        POOL.submit(worker, job_id, file_id, file_url, fix_table_heights, confirmed_merges or [])
    except Exception:
        SLOTS.release()
        raise
    return {'job_id': job_id, 'status': 'queued', 'poll_after_seconds': 3}


@mcp.tool()
def conversion_status(job_id: str) -> dict:
    """查询转换任务；完成后返回有效期1小时以内的下载链接及必须告知用户的检查提示。"""
    return public_state(identifier(job_id))


@mcp.tool()
def inspect_converted_tables(job_id: str) -> dict:
    """读取已完成任务的表格文字以辅助人工复核；空格子本身不能证明需要合并。"""
    folder, state = load_state(job_id)
    if state['status'] != 'completed':
        raise ValueError('任务尚未完成。')
    content = (folder / 'tables.json').read_text(encoding='utf-8')
    if len(content) > 50000:
        return {'message': '表格内容过多，请下载结果人工复核。'}
    return {'tables': json.loads(content)}


async def upload(request: Request):
    file_id = uuid.uuid4().hex
    target = DATA / 'uploads' / (file_id + '.pages')
    size = 0
    try:
        with target.open('xb') as stream:
            async for chunk in request.stream():
                size += len(chunk)
                if size > MAX_BYTES:
                    raise ValueError('文件超过允许大小。')
                stream.write(chunk)
        validate_pages(target, MAX_BYTES)
        return JSONResponse({'file_id': file_id, 'bytes': size})
    except Exception as exc:
        target.unlink(missing_ok=True)
        return JSONResponse({'error': str(exc) if isinstance(exc, ValueError) else '上传失败。'}, status_code=400)


async def download(request: Request):
    try:
        job_id = identifier(request.path_params['job_id'])
        expiry = int(request.query_params.get('expires', '0'))
        token = request.query_params.get('signature', '')
        if expiry < time.time() or not hmac.compare_digest(token, signature(job_id, expiry)):
            raise ValueError('下载链接无效或已过期。')
        folder, state = load_state(job_id)
        if state['status'] != 'completed':
            raise ValueError('结果尚未生成。')
        result = (folder / state['output_file']).resolve()
        if not result.is_relative_to(folder) or not result.is_file():
            raise ValueError('结果不存在。')
        return FileResponse(result, filename='转换结果.' + state['format'],
                            headers={'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer'})
    except (ValueError, KeyError):
        return JSONResponse({'error': '结果不存在、尚未完成或链接已过期。'}, status_code=404)


async def health(request):
    return JSONResponse({'status': 'ok'})


def cleanup():
    now = time.time()
    for file in (DATA / 'uploads').glob('*.pages'):
        if now - file.stat().st_mtime > RETENTION:
            file.unlink(missing_ok=True)
    for folder in (DATA / 'jobs').iterdir():
        if folder.is_symlink() or not folder.is_dir():
            continue
        try:
            with LOCK:
                state = json.loads((folder / 'state.json').read_text(encoding='utf-8'))
            if state['status'] not in ('queued', 'running') and now > state['expires_at']:
                if folder.resolve().is_relative_to(DATA / 'jobs'):
                    shutil.rmtree(folder)
        except (OSError, ValueError, KeyError):
            continue


async def reaper():
    while True:
        await asyncio.sleep(300)
        await asyncio.to_thread(cleanup)


@asynccontextmanager
async def lifespan(app):
    if len(KEY) < 32:
        raise RuntimeError('MCP_API_KEY 必须至少32字符。')
    if MAX_BYTES <= 0 or RETENTION < 3600:
        raise RuntimeError('文件大小必须大于0，保留时间至少1小时。')
    for name in ['jobs', 'uploads']:
        (DATA / name).mkdir(parents=True, exist_ok=True)
    for file in (DATA / 'jobs').glob('*/state.json'):
        state = json.loads(file.read_text(encoding='utf-8'))
        if state['status'] in ('queued', 'running'):
            state.update(status='failed', error='服务在任务完成前重启，请重新提交。')
            write_state(file.parent, state)
    cleanup()
    task = asyncio.create_task(reaper())
    async with mcp.session_manager.run():
        try:
            yield
        finally:
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
            await asyncio.to_thread(POOL.shutdown, wait=True)


class BearerAuth:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope['type'] == 'http' and scope['path'] != '/health' and not scope['path'].startswith('/download/'):
            headers = dict(scope['headers'])
            supplied = headers.get(b'authorization', b'').decode('latin1')
            if not KEY or not secrets.compare_digest(supplied, 'Bearer ' + KEY):
                await JSONResponse({'error': '需要有效的 Bearer 凭证。'}, status_code=401)(scope, receive, send)
                return
        await self.app(scope, receive, send)


http_app = mcp.streamable_http_app()
sse_app = mcp.sse_app()
application = Starlette(routes=[Route('/health', health), Route('/files', upload, methods=['POST']),
                               Route('/download/{job_id}', download),
                               *sse_app.routes, Mount('/', app=http_app)], lifespan=lifespan)
app = BearerAuth(application)

if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host=os.getenv('BIND_HOST', '127.0.0.1'), port=int(os.getenv('PORT', '8765')),
                access_log=False)
