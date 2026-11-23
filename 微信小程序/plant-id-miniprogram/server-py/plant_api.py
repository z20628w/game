"""百度智能云「植物识别」客户端（轻量，仅用标准库，无需额外依赖）。

流程：用 API Key + Secret Key 换取 access_token（缓存于模块内，约 30 天有效），
然后调用植物识别接口，返回置信度最高的物种中文名。

密钥获取：登录 https://ai.baidu.com → 控制台 → 图像识别 → 创建应用 → 拿到 API Key / Secret Key。
启动服务前设置环境变量 BAIDU_API_KEY 和 BAIDU_SECRET_KEY。
"""
import base64
import json
import os
import urllib.parse
import urllib.request

try:
    from config import BAIDU_API_KEY, BAIDU_SECRET_KEY
except Exception:
    BAIDU_API_KEY = os.environ.get("BAIDU_API_KEY", "")
    BAIDU_SECRET_KEY = os.environ.get("BAIDU_SECRET_KEY", "")

TOKEN_URL = "https://aip.baidubce.com/oauth/2.0/token"
PLANT_URL = "https://aip.baidubce.com/rest/2.0/image-classify/v1/plant"

_access_token = None


def get_access_token():
    """获取 access_token，模块内缓存。无密钥时返回 None。"""
    global _access_token
    if _access_token:
        return _access_token
    if not BAIDU_API_KEY or not BAIDU_SECRET_KEY:
        return None
    params = {
        "grant_type": "client_credentials",
        "client_id": BAIDU_API_KEY,
        "client_secret": BAIDU_SECRET_KEY,
    }
    url = TOKEN_URL + "?" + urllib.parse.urlencode(params)
    try:
        req = urllib.request.Request(url, headers={"Content-Type": "application/json"})
        resp = urllib.request.urlopen(req, timeout=8)
        data = json.loads(resp.read().decode("utf-8"))
        _access_token = data.get("access_token")
        if not _access_token:
            print("[plant_api] 获取 access_token 失败：", data)
    except Exception as e:
        print("[plant_api] 获取 access_token 异常：", e)
    return _access_token


def recognize_plant(image_bytes):
    """识别 JPEG 二进制中的植物，返回置信度最高的物种名(中文)或 None。"""
    token = get_access_token()
    if not token:
        return None
    b64 = base64.b64encode(image_bytes).decode("ascii")
    data = urllib.parse.urlencode({"image": b64, "baike_num": 0}).encode("utf-8")
    url = PLANT_URL + "?access_token=" + token
    try:
        req = urllib.request.Request(
            url, data=data,
            headers={"Content-Type": "application/x-www-form-urlencoded"})
        resp = urllib.request.urlopen(req, timeout=8)
        j = json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        print("[plant_api] 识别请求异常：", e)
        return None
    if "error_code" in j:
        print("[plant_api] 接口返回错误：", j.get("error_msg"), j.get("error_code"))
        return None
    if j.get("result"):
        return j["result"][0].get("name")
    return None
