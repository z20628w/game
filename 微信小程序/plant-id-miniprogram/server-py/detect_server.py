import asyncio
import json
import os
import time
import urllib.request

import numpy as np
import cv2
import onnxruntime as ort
import websockets

import baidu_api  # 百度多接口图像识别客户端

MODEL_PATH = "yolov8n.onnx"
# 多个下载源，依次尝试（任意一个可用即可）。
# HuggingFace 用 resolve 形式直接拿到文件二进制；若被墙可换成能访问的镜像。
MODEL_URLS = [
    "https://huggingface.co/cabelo/yolov8/resolve/main/yolov8n.onnx",
    "https://huggingface.co/alwaysssss/nndeploy/resolve/main/model_zoo/detect/yolo/yolov8n.onnx",
    "https://huggingface.co/SpotLab/YOLOv8Detection/resolve/main/yolov8n.onnx",
    # 备选：Ultralytics 官网(海外)——仅在该 release 实际存在 .onnx 时可用
    "https://github.com/ultralytics/assets/releases/download/v8.2.0/yolov8n.onnx",
]
PLANT_CLASS_ID = 58  # COCO: potted plant（盆栽植物）

# COCO 类别中文兜底名称（YOLOv8n 用 COCO 80 类）
COCO_ZH = {
    0: "人", 1: "自行车", 2: "汽车", 3: "摩托车", 4: "飞机", 5: "公交车",
    6: "火车", 7: "卡车", 8: "船", 9: "红绿灯", 10: "消防栓", 11: "停车标志",
    12: "停车计时器", 13: "长椅", 14: "鸟", 15: "猫", 16: "狗", 17: "马",
    18: "羊", 19: "牛", 20: "大象", 21: "熊", 22: "斑马", 23: "长颈鹿",
    24: "背包", 25: "雨伞", 26: "手提包", 27: "领带", 28: "行李箱",
    29: "飞盘", 30: "滑雪板", 31: " snowboard", 32: "运动球", 33: "风筝",
    34: "棒球棒", 35: "棒球手套", 36: "滑板", 37: "冲浪板", 38: "网球拍",
    39: "瓶子", 40: "酒杯", 41: "杯子", 42: "叉子", 43: "刀", 44: "勺子",
    45: "碗", 46: "香蕉", 47: "苹果", 48: "三明治", 49: "橙子",
    50: "西兰花", 51: "胡萝卜", 52: "热狗", 53: "披萨", 54: "甜甜圈",
    55: "蛋糕", 56: "椅子", 57: "沙发", 58: "盆栽植物", 59: "床",
    60: "餐桌", 61: "马桶", 62: "电视", 63: "笔记本电脑", 64: "鼠标",
    65: "遥控器", 66: "键盘", 67: "手机", 68: "微波炉", 69: "烤箱",
    70: "烤面包机", 71: "水槽", 72: "冰箱", 73: "书", 74: "时钟",
    75: "花瓶", 76: "剪刀", 77: "泰迪熊", 78: "吹风机", 79: "牙刷",
}

# 根据 YOLO 检测类别决定调用百度哪个垂类接口
COCO_ROUTING = {
    # 动物
    14: "animal", 15: "animal", 16: "animal", 17: "animal", 18: "animal",
    19: "animal", 20: "animal", 21: "animal", 22: "animal", 23: "animal",
    # 植物
    58: "plant",
    # 果蔬
    46: "ingredient", 47: "ingredient", 49: "ingredient", 50: "ingredient", 51: "ingredient",
    # 菜品/食物
    45: "dish", 48: "dish", 52: "dish", 53: "dish", 54: "dish", 55: "dish",
    # 车型（自行车/摩托车/汽车/公交/火车/卡车）
    1: "car", 2: "car", 3: "car", 5: "car", 6: "car", 7: "car",
}

ROUTING_FUNCS = {
    "plant": baidu_api.recognize_plant,
    "animal": baidu_api.recognize_animal,
    "ingredient": baidu_api.recognize_ingredient,
    "dish": baidu_api.recognize_dish,
    "car": baidu_api.recognize_car,
    "general": baidu_api.recognize_advanced_general,
}

# 植物信息库：名/别名 → {family, bloom, light}
PLANT_DB = {}
try:
    with open("plants_info.json", "r", encoding="utf-8") as f:
        _data = json.load(f)
    for _p in _data.get("plants", []):
        PLANT_DB[_p["name"]] = _p
        for _a in _p.get("aliases", []):
            PLANT_DB[_a] = _p
    print(f"已加载植物信息库：{len(PLANT_DB)} 条")
except Exception as e:
    print("植物信息库加载失败（不影响检测，仅信息卡为空）：", e)


def lookup_info(name):
    """根据物种名查信息库；精确→包含匹配→回退占位。"""
    if not name:
        return {"family": "—", "bloom": "—", "light": "—"}
    if name in PLANT_DB:
        p = PLANT_DB[name]
        return {"family": p["family"], "bloom": p["bloom"], "light": p["light"]}
    for key, p in PLANT_DB.items():
        if key in name or name in key:
            return {"family": p["family"], "bloom": p["bloom"], "light": p["light"]}
    return {"family": "—", "bloom": "—", "light": "—"}


def ensure_model():
    """模型不存在时自动下载（需联网；沙箱/内网环境可能需手动放置）。
    依次尝试 MODEL_URLS，任意一个成功即可。"""
    if os.path.exists(MODEL_PATH):
        return
    print(f"未找到 {MODEL_PATH}，开始下载（共 {len(MODEL_URLS)} 个候选源）...")
    last_err = None
    for url in MODEL_URLS:
        try:
            print(f"  尝试: {url}")
            urllib.request.urlretrieve(url, MODEL_PATH)
            if os.path.getsize(MODEL_PATH) > 1024 * 1024:  # 至少 1MB，排除错误页
                print("模型下载完成")
                return
            else:
                print("  下载文件过小，疑似失败页，换个源重试")
                os.remove(MODEL_PATH)
        except Exception as e:
            last_err = e
            print(f"  该源失败: {e}")
    print("模型下载失败：所有候选源均不可用。")
    print("请手动下载 yolov8n.onnx 并放到 server-py/ 目录（可自行搜索任一可访问的镜像）：")
    print("  https://huggingface.co/cabelo/yolov8/resolve/main/yolov8n.onnx")
    raise SystemExit(1)


ensure_model()
session = ort.InferenceSession(MODEL_PATH, providers=["CPUExecutionProvider"])
input_name = session.get_inputs()[0].name
IN_H, IN_W = 640, 640


def preprocess(img):
    h, w = img.shape[:2]
    scale = min(IN_W / w, IN_H / h)
    nw, nh = int(w * scale), int(h * scale)
    resized = cv2.resize(img, (nw, nh))
    canvas = np.full((IN_H, IN_W, 3), 114, dtype=np.uint8)
    dx = (IN_W - nw) // 2
    dy = (IN_H - nh) // 2
    canvas[dy:dy + nh, dx:dx + nw] = resized
    blob = canvas[:, :, ::-1].transpose(2, 0, 1).astype(np.float32) / 255.0
    return np.expand_dims(blob, 0), scale, dx, dy


def detect(img):
    blob, scale, dx, dy = preprocess(img)
    out = session.run(None, {input_name: blob})[0]  # [1, 84, 8400]
    pred = out[0].T  # [8400, 84]
    boxes = pred[:, :4]
    scores = pred[:, 4:]
    class_ids = scores.argmax(1)
    confs = scores[np.arange(len(scores)), class_ids]
    keep = confs > 0.35
    boxes, class_ids, confs = boxes[keep], class_ids[keep], confs[keep]
    if len(boxes) == 0:
        return None

    cx, cy, bw, bh = boxes[:, 0], boxes[:, 1], boxes[:, 2], boxes[:, 3]
    x1 = (cx - bw / 2 - dx) / scale
    y1 = (cy - bh / 2 - dy) / scale
    x2 = (cx + bw / 2 - dx) / scale
    y2 = (cy + bh / 2 - dy) / scale
    x1 = np.clip(x1, 0, img.shape[1])
    y1 = np.clip(y1, 0, img.shape[0])
    x2 = np.clip(x2, 0, img.shape[1])
    y2 = np.clip(y2, 0, img.shape[0])

    # OpenCV 新版 NMSBoxes 签名：(bboxes, scores, confThresh, nmsThresh)
    # bboxes 必须是 [[x1, y1, w, h], ...] 的列表
    boxes_xywh = np.stack([x1, y1, x2 - x1, y2 - y1], axis=1)
    idxs = cv2.dnn.NMSBoxes(
        boxes_xywh.tolist(), confs.tolist(), 0.35, 0.45)
    if isinstance(idxs, tuple):
        idxs = idxs[0] if len(idxs) > 0 else np.array([], dtype=int)
    idxs = np.array(idxs).flatten().astype(int)
    if len(idxs) == 0:
        return None

    # 优先选"盆栽植物"，否则选置信度最高的检测框
    plant_idx = [i for i in idxs if int(class_ids[i]) == PLANT_CLASS_ID]
    if plant_idx:
        pick = plant_idx[0]
    else:
        pick = idxs[int(np.argmax(confs[idxs]))]
    i = pick
    bx1, by1, bx2, by2 = x1[i], y1[i], x2[i], y2[i]
    ow, oh = img.shape[1], img.shape[0]
    class_id = int(class_ids[i])
    name = COCO_ZH.get(class_id, "对象" + str(class_id))
    return {
        "name": name,
        "class_id": class_id,
        "confidence": round(float(confs[i]) * 100, 1),
        "info": {"family": "—", "bloom": "—", "light": "—"},
        "category": "coco",
        "description": "",
        "baike_url": "",
        "px": [int(bx1), int(by1), int(bx2), int(by2)],  # 像素坐标，供裁剪识别
        "img_w": ow,                                   # 原始照片宽（前端做 cover 裁剪换算用）
        "img_h": oh,                                   # 原始照片高
        "bbox": {
            "x": round(float(bx1 / ow), 4),
            "y": round(float(by1 / oh), 4),
            "w": round(float((bx2 - bx1) / ow), 4),
            "h": round(float((by2 - by1) / oh), 4),
        },
    }


# 云端识别节流：最多每 1.5 秒调用一次，避免频繁请求/触发 QPS 限制
_last_cls_time = 0.0
_last_answer = None


def classify_object(img, px, class_id):
    """裁剪检测框区域 → 根据物体类别调用百度对应接口 → 返回统一识别结果或 None。带节流。"""
    global _last_cls_time, _last_answer
    now = time.time()
    if now - _last_cls_time < 1.5:
        return _last_answer

    x1, y1, x2, y2 = [max(0, int(v)) for v in px]
    crop = img[y1:y2, x1:x2]
    if crop.size == 0:
        return _last_answer
    ok, buf = cv2.imencode(".jpg", crop)
    if not ok:
        return _last_answer
    image_bytes = buf.tobytes()

    # 1. 优先按 YOLO 类别路由到垂类接口
    route = COCO_ROUTING.get(int(class_id), "general")
    answer = None
    if route in ROUTING_FUNCS:
        try:
            answer = ROUTING_FUNCS[route](image_bytes)
        except Exception as e:
            print(f"[classify] {route} 识别异常：", e)

    # 2. 垂类没识别出来（None）且不是 general，兜底再试试通用物体识别
    if answer is None and route != "general":
        try:
            answer = baidu_api.recognize_advanced_general(image_bytes)
        except Exception as e:
            print("[classify] general 兜底异常：", e)

    _last_cls_time = now
    _last_answer = answer
    return answer


async def safe_send(ws, data):
    """客户端已断开时不再发送，避免抛异常污染日志。"""
    if ws.open:
        try:
            await ws.send(data)
        except Exception:
            pass  # 连接可能正在关闭


async def handler(ws):
    try:
        async for message in ws:
            if not isinstance(message, (bytes, bytearray)):
                continue
            arr = np.frombuffer(message, dtype=np.uint8)
            img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
            if img is None:
                continue
            res = detect(img)
            if not res:
                await safe_send(ws, json.dumps({"bbox": None}))  # 画面里没检测到物体
                continue
            # 在检测框基础上做垂类识别：裁剪 → 云端识别 → 补全信息
            answer = classify_object(img, res.get("px"), res.get("class_id"))
            if answer:
                res["name"] = answer["name"]
                res["confidence"] = answer["confidence"]
                res["category"] = answer["category"]
                res["description"] = answer["description"]
                res["baike_url"] = answer["baike_url"]
                # 如果是植物，仍查本地库补充科属/花期/光照
                if answer["category"] == "plant":
                    res["info"] = lookup_info(answer["name"])
                else:
                    res["info"] = {"family": "—", "bloom": "—", "light": "—"}
            # 不再回传带框图：前端用实时摄像头预览 + cover-view 画框（更流畅），
            # 并依据 img_w/img_h 做 cover 裁剪换算，框与预览严格对齐。
            # 没识别出具体物种时，保留 YOLO 检测的兜底中文名 + 置信度
            await safe_send(ws, json.dumps(res))               # 真实检测结果
    except asyncio.CancelledError:
        pass  # 客户端正常断开，无需打印堆栈
    except Exception as e:
        # 其他异常只打印一行，避免刷屏
        print(f"[handler] 连接异常：{type(e).__name__}: {e}")


async def main():
    async with websockets.serve(handler, "0.0.0.0", 3000):
        print("real plant detection backend on ws://0.0.0.0:3000 (手机用电脑局域网IP访问)")
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())
