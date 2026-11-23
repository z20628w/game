"""快速测试 Agnes 图片生成模型名修复"""
import os
import urllib.request
import urllib.error
import json

api_key = os.environ["AGNES_API_KEY"]
url = "https://apihub.agnes-ai.com/v1/images/generations"

payload = {
    "model": "agnes-image-2.1-flash",
    "prompt": "A red apple on a wooden table, photorealistic",
    "size": "1024x1024",
    "n": 1,
    "extra_body": {"response_format": "url"}
}

data = json.dumps(payload).encode()
req = urllib.request.Request(
    url,
    data=data,
    headers={
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    },
    method="POST"
)

try:
    with urllib.request.urlopen(req, timeout=30) as r:
        print(f"Status: {r.status}")
        result = json.loads(r.read())
        print(f"Image URL: {result['data'][0]['url']}")
except urllib.error.HTTPError as e:
    body = e.read().decode()
    print(f"HTTP {e.code}: {body[:300]}")
except Exception as e:
    print(f"Error: {e}")
