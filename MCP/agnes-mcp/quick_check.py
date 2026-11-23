"""SSE quick check"""
import urllib.request
for port, name in [(3000, "weather"), (3001, "agnes")]:
    try:
        req = urllib.request.Request(f"http://localhost:{port}/sse/", headers={"Accept": "text/event-stream"}, method="GET")
        r = urllib.request.urlopen(req, timeout=3)
        print(f"{name}: HTTP {r.status}")
    except Exception as e:
        print(f"{name}: FAIL {type(e).__name__}: {e}")
