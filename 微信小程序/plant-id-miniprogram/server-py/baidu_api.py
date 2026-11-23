"""百度智能云图像识别多接口客户端。

支持：植物、动物、果蔬、菜品、车型、Logo、地标、通用物体识别。
统一返回格式：{"name","confidence","category","description","baike_url","image_url"}。

密钥获取：https://ai.baidu.com → 控制台 → 图像识别 → 创建应用。
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

URLS = {
    "plant": "https://aip.baidubce.com/rest/2.0/image-classify/v1/plant",
    "animal": "https://aip.baidubce.com/rest/2.0/image-classify/v1/animal",
    "ingredient": "https://aip.baidubce.com/rest/2.0/image-classify/v1/classify/ingredient",
    "dish": "https://aip.baidubce.com/rest/2.0/image-classify/v2/dish",
    "car": "https://aip.baidubce.com/rest/2.0/image-classify/v1/car",
    "logo": "https://aip.baidubce.com/rest/2.0/image-classify/v2/logo",
    "landmark": "https://aip.baidubce.com/rest/2.0/image-classify/v1/landmark",
    "advanced_general": "https://aip.baidubce.com/rest/2.0/image-classify/v2/advanced_general",
}

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
            print("[baidu_api] 获取 access_token 失败：", data)
    except Exception as e:
        print("[baidu_api] 获取 access_token 异常：", e)
    return _access_token


def _post(url, image_bytes, extra_params=None, timeout=10):
    """通用 POST 识别请求。返回原始 JSON 字典或 None。"""
    token = get_access_token()
    if not token:
        return None
    b64 = base64.b64encode(image_bytes).decode("ascii")
    payload = {"image": b64, "baike_num": 1}
    if extra_params:
        payload.update(extra_params)
    data = urllib.parse.urlencode(payload).encode("utf-8")
    full_url = url + "?access_token=" + token
    try:
        req = urllib.request.Request(
            full_url, data=data,
            headers={"Content-Type": "application/x-www-form-urlencoded"})
        resp = urllib.request.urlopen(req, timeout=timeout)
        return json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        print(f"[baidu_api] 请求异常 {url}: {e}")
        return None


def _pick_first(result_json):
    """从百度返回 JSON 的 result 数组里取第一个结果。"""
    if not result_json:
        return None
    if "error_code" in result_json:
        print("[baidu_api] 接口返回错误：", result_json.get("error_msg"))
        return None
    results = result_json.get("result") or result_json.get("result_num")
    if not results:
        return None
    if isinstance(results, list) and len(results) > 0:
        return results[0]
    return None


def _make_answer(item, category, use_score=True):
    """把百度结果条目统一成内部格式。"""
    if not item:
        return None
    name = item.get("name") or item.get("keyword")
    if not name:
        return None
    confidence = 0.0
    if use_score:
        confidence = item.get("score", 0.0)
    else:
        confidence = item.get("probability", 0.0)
    confidence = round(float(confidence) * 100, 1)

    baike = item.get("baike_info") or {}
    desc = baike.get("description") or baike.get("baike_summary") or baike.get("abstract_plain") or ""
    return {
        "name": name,
        "confidence": confidence,
        "category": category,
        "description": desc.strip(),
        "baike_url": baike.get("baike_url", ""),
        "image_url": baike.get("image_url") or baike.get("square_image_url", ""),
    }


# ---------- 各垂类识别入口 ----------

def recognize_plant(image_bytes):
    j = _post(URLS["plant"], image_bytes)
    return _make_answer(_pick_first(j), "plant")


def recognize_animal(image_bytes):
    j = _post(URLS["animal"], image_bytes)
    return _make_answer(_pick_first(j), "animal")


def recognize_ingredient(image_bytes):
    j = _post(URLS["ingredient"], image_bytes)
    item = _pick_first(j)
    # 果蔬接口可能返回 "非果蔬食材"，过滤掉
    if item and "非果蔬" in item.get("name", ""):
        return None
    return _make_answer(item, "ingredient")


def recognize_dish(image_bytes):
    j = _post(URLS["dish"], image_bytes, extra_params={"filter_threshold": "0.95"})
    return _make_answer(_pick_first(j), "dish")


def recognize_car(image_bytes):
    j = _post(URLS["car"], image_bytes, extra_params={"top_num": "1", "output_brand": "true"})
    item = _pick_first(j)
    if item:
        year = item.get("year", "")
        color = item.get("color", "")
        brand = item.get("brand", "")
        name = item.get("name", "")
        # 拼接更友好的名称
        parts = [p for p in [brand, name, year, color] if p]
        if parts:
            item["name"] = " ".join(parts)
    return _make_answer(item, "car", use_score=True)


def recognize_logo(image_bytes):
    j = _post(URLS["logo"], image_bytes)
    item = _pick_first(j)
    return _make_answer(item, "logo", use_score=False)


def recognize_landmark(image_bytes):
    j = _post(URLS["landmark"], image_bytes)
    return _make_answer(_pick_first(j), "landmark")


def recognize_advanced_general(image_bytes):
    j = _post(URLS["advanced_general"], image_bytes)
    return _make_answer(_pick_first(j), "general")


# 为了兼容旧的 plant_api 调用，保留同名函数
recognize_object = recognize_advanced_general
