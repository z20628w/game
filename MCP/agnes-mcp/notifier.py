"""
Agnes MCP 视频完成通知服务
通过 OpenClaw gateway 本地 API 向微信用户发送通知
"""
import os
import threading
import time
import queue
import httpx
import logging

logger = logging.getLogger("notifier")

# OpenClaw Gateway 本地配置
GATEWAY_HOST = "localhost"
GATEWAY_PORT = 49638
WECHAT_USER_ID = "1308748509"  # 微信用户ID

# 动态读取 token
def _get_gateway_token():
    try:
        import json
        with open("C:/Users/admin/.qclaw/openclaw.json", "r", encoding="utf-8") as f:
            return json.load(f).get("gateway", {}).get("auth", {}).get("token", "")
    except Exception:
        return ""

# 通知任务队列
_notify_queue: queue.Queue = queue.Queue()

# 已提交待轮询的视频任务
_pending_tasks: dict[str, dict] = {}

# 通知线程
_notifier_thread: threading.Thread | None = None
_running = False


def _load_gateway_token():
    """从 openclaw.json 读取 gateway token"""
    token = _get_gateway_token()
    if token:
        logger.info("Gateway token 读取成功")
    else:
        logger.warning("无法读取 gateway token")
    return token


def _send_wechat_message(text: str) -> bool:
    """通过 OpenClaw gateway /tools/invoke 调用内置 message 工具发送微信消息"""
    token = _load_gateway_token()
    if not token:
        logger.warning("无法发送微信通知：未找到有效的 gateway token")
        return False

    try:
        import urllib.request
        import json as json_mod

        url = f"http://{GATEWAY_HOST}:{GATEWAY_PORT}/tools/invoke"
        # 通过 message 工具发送到微信
        payload = json_mod.dumps({
            "tool": "message",
            "action": "send",
            "args": {
                "action": "send",
                "channel": "wechat-access",
                "target": WECHAT_USER_ID,
                "message": text
            },
            "sessionKey": "main"
        }).encode()

        req = urllib.request.Request(
            url,
            data=payload,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json"
            },
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=15) as r:
            body = r.read().decode("utf-8", errors="replace")
            if r.status == 200:
                logger.info(f"微信通知发送成功")
                return True
            else:
                logger.warning(f"微信通知发送失败: HTTP {r.status} | {body[:200]}")
                return False
    except Exception as e:
        logger.warning(f"微信通知发送异常: {type(e).__name__}: {e}")
        return False


def submit_video_task(video_id: str, prompt: str):
    """提交一个视频任务用于后台轮询"""
    _pending_tasks[video_id] = {
        "prompt": prompt,
        "submitted_at": time.time(),
        "last_status": "queued",
        "notified": False
    }
    logger.info(f"视频任务已提交后台轮询: {video_id} | {prompt[:30]}")


def check_and_notify(video_id: str, status: str, result: dict) -> bool:
    """
    检查任务状态，发送通知
    返回是否已通知（任务终态）
    """
    task = _pending_tasks.get(video_id)
    if not task or task.get("notified"):
        return False

    is_terminal = status in ("completed", "failed")
    if not is_terminal:
        task["last_status"] = status
        return False

    # 终态 → 发通知
    if status == "completed":
        video_url = result.get("video_url") or result.get("url") or "未知链接"
        seconds = result.get("seconds", "")
        size = result.get("size", "")
        prompt = task["prompt"]

        msg = (
            f"🎬 视频生成完成！\n\n"
            f"📝 描述：{prompt}\n"
            f"⏱️ 时长：{seconds}秒\n"
            f"🔗 链接：{video_url}"
        )
    else:
        error = result.get("error", "未知错误")
        msg = (
            f"❌ 视频生成失败\n\n"
            f"📝 描述：{task['prompt']}\n"
            f"❗ 错误：{error}"
        )

    success = _send_wechat_message(msg)
    task["notified"] = True
    return True


def _notifier_worker():
    """后台轮询线程"""
    import urllib.request
    import json as json_mod

    AGNES_API_KEY = os.environ["AGNES_API_KEY"]
    headers = {
        "Authorization": f"Bearer {AGNES_API_KEY}",
        "Content-Type": "application/json"
    }

    while _running:
        try:
            # 遍历所有待轮询任务
            for video_id, task in list(_pending_tasks.items()):
                if task.get("notified"):
                    continue

                # 跳过刚提交的任务（等10秒再查第一次）
                if time.time() - task["submitted_at"] < 10:
                    continue

                try:
                    api_url = f"https://apihub.agnes-ai.com/agnesapi?video_id={video_id}"
                    req = urllib.request.Request(api_url, headers=headers, method="GET")
                    with urllib.request.urlopen(req, timeout=15) as r:
                        data = json_mod.loads(r.read())

                    status = data.get("status", "unknown")
                    check_and_notify(video_id, status, data)

                except Exception as e:
                    logger.debug(f"轮询 {video_id} 失败: {e}")

        except Exception as e:
            logger.warning(f"通知线程异常: {e}")

        time.sleep(30)  # 每30秒轮询一次


def start():
    """启动通知后台线程"""
    global _notifier_thread, _running
    if _running:
        return
    _running = True
    _notifier_thread = threading.Thread(target=_notifier_worker, daemon=True, name="video-notifier")
    _notifier_thread.start()
    logger.info("视频通知后台线程已启动")


def stop():
    """停止通知后台线程"""
    global _running
    _running = False
    if _notifier_thread:
        _notifier_thread.join(timeout=5)
    logger.info("视频通知后台线程已停止")


def get_pending_count() -> int:
    """返回未完成的任务数"""
    return sum(1 for t in _pending_tasks.values() if not t.get("notified"))
