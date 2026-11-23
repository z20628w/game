"""测试微信消息发送接口 + SSE 端点 HTTP 状态"""
import json
import urllib.request

# 测试 1：SSE 端点 HTTP 状态（不读取 body，避免阻塞）
try:
    req = urllib.request.Request(
        "http://localhost:3001/sse/",
        headers={"Accept": "text/event-stream"},
        method="GET"
    )
    resp = urllib.request.urlopen(req, timeout=3)
    print(f"SSE HTTP Status: {resp.status}")
    print(f"SSE Content-Type: {resp.headers.get('content-type', '')}")
    print(f"OK: SSE endpoint reachable")
except Exception as e:
    print(f"SSE error: {e}")

print()

# 测试 2：微信消息发送（通过 gateway）
try:
    token = json.loads(open("C:/Users/admin/.qclaw/openclaw.json", encoding="utf-8").read()).get("gateway", {}).get("auth", {}).get("token", "")
    payload = json.dumps({
        "channel": "wechat-access",
        "target": "1308748509",
        "message": "[TEST] Agnes MCP 服务已重启，视频完成后会自动微信通知你！"
    }).encode()

    req = urllib.request.Request(
        "http://localhost:49638/api/messages/send",
        data=payload,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        },
        method="POST"
    )
    with urllib.request.urlopen(req, timeout=10) as r:
        resp = r.read().decode()
        print(f"Wechat notify: HTTP {r.status}")
        print(f"Response: {resp[:200]}")
except urllib.error.HTTPError as e:
    body = e.read().decode()
    print(f"Wechat notify HTTP error {e.code}: {body[:200]}")
except Exception as e:
    print(f"Wechat notify error: {type(e).__name__}: {e}")
