"""快速验证 SSE 端点 HTTP 状态"""
import urllib.request

for port, name in [(3000, "weather"), (3001, "agnes")]:
    try:
        req = urllib.request.Request(
            f"http://localhost:{port}/sse/",
            headers={"Accept": "text/event-stream"},
            method="GET"
        )
        resp = urllib.request.urlopen(req, timeout=3)
        # SSE is streaming - close immediately after getting status
        print(f"{name} (port {port}): HTTP {resp.status}, Content-Type: {resp.headers.get('content-type','')}")
    except Exception as e:
        print(f"{name} (port {port}): FAIL - {type(e).__name__}: {e}")
