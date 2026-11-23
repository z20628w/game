"""测试微信通知"""
import json, urllib.request

token = json.loads(open("C:/Users/admin/.qclaw/openclaw.json", encoding="utf-8").read()).get("gateway", {}).get("auth", {}).get("token", "")
print(f"Token: {token[:8]}...")

url = f"http://localhost:49638/tools/invoke"
payload = json.dumps({
    "tool": "message",
    "action": "send",
    "args": {
        "action": "send",
        "channel": "wechat-access",
        "target": "1308748509",
        "message": "[TEST] Agnes MCP 服务已重启，生成视频后会自动微信通知你！"
    },
    "sessionKey": "main"
}).encode()

req = urllib.request.Request(url, data=payload, headers={
    "Authorization": f"Bearer {token}",
    "Content-Type": "application/json"
}, method="POST")

try:
    with urllib.request.urlopen(req, timeout=15) as r:
        body = r.read().decode("utf-8", errors="replace")
        print(f"HTTP {r.status}")
        print(f"Response: {body[:400]}")
except urllib.error.HTTPError as e:
    print(f"HTTP {e.code}: {e.read().decode()[:400]}")
except Exception as e:
    print(f"Error: {type(e).__name__}: {e}")
