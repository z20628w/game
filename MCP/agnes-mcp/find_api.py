"""探测 OpenClaw gateway API 端点"""
import json, urllib.request

token = json.loads(open("C:/Users/admin/.qclaw/openclaw.json", encoding="utf-8").read()).get("gateway", {}).get("auth", {}).get("token", "")

endpoints = [
    "/",
    "/__openclaw__/",
    "/__openclaw__/api/",
    "/api/",
    "/api/channels/",
    "/__openclaw__/gateway/",
    "/v1/",
    "/v1/channels/send",
]

for ep in endpoints:
    req = urllib.request.Request(
        f"http://localhost:49638{ep}",
        headers={"Authorization": f"Bearer {token}", "User-Agent": " Agnes-MCP/1.0"}
    )
    try:
        with urllib.request.urlopen(req, timeout=3) as r:
            body = r.read(300).decode("utf-8", errors="replace")
            print(f"{ep} => {r.status} | {body[:150]}")
    except urllib.error.HTTPError as e:
        print(f"{ep} => HTTP {e.code}")
    except Exception as e:
        print(f"{ep} => ERR: {type(e).__name__}: {e}")
