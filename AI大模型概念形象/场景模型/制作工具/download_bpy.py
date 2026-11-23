"""从 PyPI 官方元数据下载指定 wheel，分段重试并核对 SHA-256。"""
from pathlib import Path
import urllib.request, json, concurrent.futures, hashlib, time

root=Path(__file__).resolve().parent
meta=json.load(urllib.request.urlopen('https://pypi.org/pypi/bpy/5.1.2/json',timeout=30))
asset=next(item for item in meta['urls'] if 'cp313-cp313-win_amd64' in item['filename'])
target=root/asset['filename']
size=asset['size']; chunk=4*1024*1024
print('下载',asset['filename'],'字节',size,flush=True)
with target.open('wb') as f: f.truncate(size)
def download(start):
    end=min(size-1,start+chunk-1)
    for attempt in range(5):
        try:
            req=urllib.request.Request(asset['url'],headers={'Range':f'bytes={start}-{end}'})
            with urllib.request.urlopen(req,timeout=90) as response:
                if response.status!=206: raise RuntimeError('服务器未接受分段请求')
                data=response.read()
            if len(data)!=end-start+1: raise RuntimeError('分段长度不一致')
            with target.open('r+b') as f: f.seek(start); f.write(data)
            return len(data)
        except Exception:
            if attempt==4: raise
            time.sleep(1+attempt)
with concurrent.futures.ThreadPoolExecutor(max_workers=16) as pool:
    done=0
    for f in concurrent.futures.as_completed([pool.submit(download,s) for s in range(0,size,chunk)]):
        done+=f.result()
        print(f'{done/size:.0%}',flush=True)
actual=hashlib.file_digest(target.open('rb'),'sha256').hexdigest()
assert actual==asset['digests']['sha256'], 'SHA-256 校验失败'
print('SHA-256 校验通过',actual,flush=True)
