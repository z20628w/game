"""
Agnes AI MCP 服务
适用于企业微信智能机器人
传输协议: SSE (Server-Sent Events)
监听地址: 0.0.0.0:3001
"""

import os
from mcp.server.fastmcp import FastMCP
from mcp.server.sse import SseServerTransport
from starlette.applications import Starlette
from starlette.routing import Mount
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware
import uvicorn
import httpx
from typing import Optional
import json
# Agnes AI API 配置
AGNES_API_KEY = os.environ["AGNES_API_KEY"]
AGNES_BASE_URL = "https://apihub.agnes-ai.com/v1"
AGNES_MODEL = "agnes-2.0-flash"

# 创建 MCP 服务实例
mcp = FastMCP("agnes-ai-service")


@mcp.tool()
async def chat_completion(message: str, system_prompt: Optional[str] = None) -> str:
    """使用 Agnes AI 进行对话
    
    Args:
        message: 用户输入的消息内容
        system_prompt: 可选的系统提示词，用于设定 AI 角色
    
    Returns:
        AI 的回复内容
    """
    try:
        headers = {
            "Authorization": f"Bearer {AGNES_API_KEY}",
            "Content-Type": "application/json"
        }
        
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": message})
        
        payload = {
            "model": AGNES_MODEL,
            "messages": messages,
            "temperature": 0.7,
            "max_tokens": 2000
        }
        
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{AGNES_BASE_URL}/chat/completions",
                headers=headers,
                json=payload
            )
            response.raise_for_status()
            data = response.json()
            
            return data["choices"][0]["message"]["content"]
    except Exception as e:
        return f"❌ Agnes AI 对话出错：{str(e)}"


@mcp.tool()
async def generate_image(prompt: str, size: str = "1024x1024") -> str:
    """使用 Agnes AI 生成图片
    
    Args:
        prompt: 图片描述，如"一只可爱的橘猫在草地上玩耍"
        size: 图片尺寸，可选 1024x1024(方形)、1024x1792(竖屏)、1792x1024(横屏)，默认 1024x1024
    
    Returns:
        生成的图片 URL
    """
    try:
        headers = {
            "Authorization": f"Bearer {AGNES_API_KEY}",
            "Content-Type": "application/json"
        }
        
        # 验证尺寸
        valid_sizes = ["1024x1024", "1024x1792", "1792x1024"]
        if size not in valid_sizes:
            size = "1024x1024"
        
        payload = {
            "model": "agnes-image-2.1-flash",
            "prompt": prompt,
            "size": size,
            "n": 1,
            "extra_body": {"response_format": "url"}
        }
        
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                f"{AGNES_BASE_URL}/images/generations",
                headers=headers,
                json=payload
            )
            response.raise_for_status()
            data = response.json()
            
            image_url = data["data"][0]["url"]
            return f"✅ 图片生成成功！\n\n🎨 提示词：{prompt}\n📐 尺寸：{size}\n🔗 图片链接：{image_url}"
    except Exception as e:
        return f"❌ 图片生成失败：{str(e)}"


@mcp.tool()
async def generate_video(prompt: str, duration: int = 5) -> str:
    """使用 Agnes AI 生成视频
    
    Args:
        prompt: 视频描述，如"夕阳下的海边，波浪轻轻拍打着沙滩"
        duration: 视频时长（秒），范围 3-10 秒，默认 5 秒
    
    Returns:
        视频任务 ID，用于后续查询状态
    """
    try:
        headers = {
            "Authorization": f"Bearer {AGNES_API_KEY}",
            "Content-Type": "application/json"
        }
        
        # 限制时长范围
        duration = max(3, min(10, duration))
        
        payload = {
            "model": "agnes-video-v2.0",
            "prompt": prompt,
            "height": 768,
            "width": 1152,
            "num_frames": 121,
            "frame_rate": 24
        }
        
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{AGNES_BASE_URL}/videos",
                headers=headers,
                json=payload
            )
            response.raise_for_status()
            data = response.json()
            
            video_id = data.get("video_id", "") or data.get("task_id", "") or data.get("id", "未知")
            return f"✅ 视频生成任务已提交！\n\n🎬 提示词：{prompt}\n🆔 任务 ID：{video_id}\n\n⏳ 生成中（约需 1-3 分钟），请稍后调用 check_video_status 查询结果"
    except Exception as e:
        return f"❌ 视频生成失败：{str(e)}"


@mcp.tool()
async def check_video_status(task_id: str) -> str:
    """查询视频生成任务状态
    
    Args:
        task_id: 视频生成任务 ID
    
    Returns:
        任务状态和结果
    """
    try:
        headers = {
            "Authorization": f"Bearer {AGNES_API_KEY}",
            "Content-Type": "application/json"
        }
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"https://apihub.agnes-ai.com/agnesapi",
                params={"video_id": task_id},
                headers=headers
            )
            response.raise_for_status()
            data = response.json()
            
            status = data.get("status", "unknown")
            
            if status == "completed":
                video_url = data.get("video_url") or data.get("url") or "未知链接"
                seconds = data.get("seconds", "")
                size = data.get("size", "")
                return f"✅ 视频生成完成！\n\n🆔 任务 ID：{task_id}\n🔗 视频链接：{video_url}\n⏱️ 时长：{seconds}秒\n📐 尺寸：{size}"
            elif status == "in_progress" or status == "processing":
                progress = data.get("progress", "未知")
                return f"⏳ 视频生成中...\n\n🆔 任务 ID：{task_id}\n📊 进度：{progress}%\n\n💡 请稍后再次查询"
            elif status == "queued":
                return f"⏳ 视频任务排队中...\n\n🆔 任务 ID：{task_id}\n\n💡 请稍后再次查询"
            elif status == "failed":
                error = data.get("error", "未知错误")
                return f"❌ 视频生成失败\n\n🆔 任务 ID：{task_id}\n❗ 错误：{error}"
            else:
                return f"🤔 任务状态：{status}\n\n🆔 任务 ID：{task_id}\n📦 完整响应：{str(data)[:200]}"
    except Exception as e:
        return f"❌ 查询失败：{str(e)}"


@mcp.tool()
async def chat_with_image(message: str, image_url: str, system_prompt: Optional[str] = None) -> str:
    """使用 Agnes AI 分析图片
    
    Args:
        message: 关于图片的问题或描述
        image_url: 图片的 URL 地址（可访问的公网 URL）
        system_prompt: 可选的系统提示词
    
    Returns:
        AI 对图片的分析结果
    """
    try:
        headers = {
            "Authorization": f"Bearer {AGNES_API_KEY}",
            "Content-Type": "application/json"
        }

        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({
            "role": "user",
            "content": [
                {"type": "text", "text": message},
                {"type": "image_url", "image_url": {"url": image_url}}
            ]
        })
        
        payload = {
            "model": AGNES_MODEL,
            "messages": messages,
            "max_tokens": 2000
        }
        
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{AGNES_BASE_URL}/chat/completions",
                headers=headers,
                json=payload
            )
            response.raise_for_status()
            data = response.json()
            
            return data["choices"][0]["message"]["content"]
    except Exception as e:
        return f"❌ 图片分析失败：{str(e)}"


# SSE 传输协议
sse = SseServerTransport("/messages/")  # 相对路径，挂在 /sse/ 下，最终 POST=/sse/messages/

# 创建 SSE 处理 ASGI 应用
async def sse_app(scope, receive, send):
    """SSE 端点 ASGI 应用"""
    if scope["type"] != "http":
        await send({
            "type": "http.response.start",
            "status": 400,
            "headers": [(b"content-type", b"text/plain")],
        })
        await send({"type": "http.response.body", "body": b"Bad Request"})
        return
    
    async with sse.connect_sse(scope, receive, send) as (read_stream, write_stream):
        await mcp._mcp_server.run(
            read_stream,
            write_stream,
            mcp._mcp_server.create_initialization_options(),
        )


# 创建 Starlette 应用
middleware = [
    Middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
        allow_credentials=True,
    )
]

app = Starlette(
    debug=True,
    routes=[
        # 更具体的 POST 路由放前面，/sse/ 放最后（仅一级 sse）
        Mount("/sse/messages/", app=sse.handle_post_message),  # JSON-RPC POST 消息端点
        Mount("/sse/", app=sse_app),                           # SSE 长连接端点
    ],
    middleware=middleware,
)

if __name__ == "__main__":
    import sys
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    print("🤖 Agnes AI MCP 服务启动中...")
    print("=" * 50)
    print("📡 传输协议: SSE")
    print("📍 监听地址: http://0.0.0.0:3001/sse")
    print("=" * 50)
    print("\n🛠️ 可用工具:")
    print("  - chat_completion: AI 对话")
    print("  - generate_image: 生成图片")
    print("  - generate_video: 生成视频")
    print("  - check_video_status: 查询视频状态")
    print("  - chat_with_image: 图片分析")
    print("=" * 50)

    uvicorn.run(app, host="0.0.0.0", port=3001)
