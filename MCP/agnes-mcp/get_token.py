import json

try:
    with open("C:/Users/admin/.qclaw/openclaw.json", "r", encoding="utf-8") as f:
        raw = f.read()
    config = json.loads(raw)
    token = config.get("gateway", {}).get("auth", {}).get("token", "NOT_FOUND")
    print(f"Token: {token}")
except Exception as e:
    print(f"Error: {e}")
