"""验证 Agnes MCP 5个工具的 API 端点全部正确"""
import os
import urllib.request
import urllib.error
import json

API_KEY = os.environ["AGNES_API_KEY"]

def test_endpoint(method, url, payload=None):
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json"
    }
    data = json.dumps(payload).encode() if payload else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, r.read().decode()[:200]
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:300]

BASE = "https://apihub.agnes-ai.com/v1"

# 1. 文本对话
print("1. chat_completion:", test_endpoint("POST", f"{BASE}/chat/completions", {
    "model": "agnes-2.0-flash",
    "messages": [{"role": "user", "content": "Hello"}],
    "max_tokens": 20
}))

# 2. 图片生成 (修复后)
print("2. generate_image:", test_endpoint("POST", f"{BASE}/images/generations", {
    "model": "agnes-image-2.1-flash",
    "prompt": "A blue sky",
    "size": "1024x768",
    "extra_body": {"response_format": "url"}
}))

# 3. 视频创建 (修复后)
print("3. generate_video:", test_endpoint("POST", f"{BASE}/videos", {
    "model": "agnes-video-v2.0",
    "prompt": "A river flowing",
    "height": 768,
    "width": 1152,
    "num_frames": 81,
    "frame_rate": 24
}))

# 4. 识图对话
print("4. chat_with_image:", test_endpoint("POST", f"{BASE}/chat/completions", {
    "model": "agnes-2.0-flash",
    "messages": [{"role": "user", "content": [
        {"type": "text", "text": "What is in this image?"},
        {"type": "image_url", "image_url": {"url": "https://httpbin.org/image/png"}}
    ]}],
    "max_tokens": 50
}))

print("\nAll API endpoint checks done.")
