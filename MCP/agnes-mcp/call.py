"""
Agnes AI MCP 单独调用脚本
直接调用指定工具
"""
import httpx
import asyncio
import json

# ==================== 配置 ====================
TUNNEL_URL = "https://你的agnes-cpolar地址"  # 改这里!
LOCAL_URL = "http://localhost:3001"

USE_TUNNEL = False  # True=隧道, False=本地
# ==================== 配置 ====================

SESSION_ID = None

async def connect_sse(base_url):
    """连接SSE"""
    global SESSION_ID
    print(f"连接 {base_url}/sse ...")
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            async with client.stream("GET", f"{base_url}/sse") as response:
                async for line in response.aiter_lines():
                    if "session_id=" in line:
                        import re
                        match = re.search(r'session_id=([^&\s]+)', line)
                        if match:
                            SESSION_ID = match.group(1)
                            print(f"✅ Session ID: {SESSION_ID}")
                            return True
    except Exception as e:
        print(f"❌ 连接失败: {e}")
        return False
    return False

async def call_tool(base_url, name, arguments):
    """调用指定工具"""
    global SESSION_ID
    
    if not SESSION_ID:
        return {"error": "未连接"}
    
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {"name": "agnes-caller", "version": "1.0"}
        }
    }
    
    url = f"{base_url}/messages/?session_id={SESSION_ID}"
    
    async with httpx.AsyncClient(timeout=120.0) as client:
        # 先初始化
        await client.post(url, json=payload)
        
        # 调用工具
        payload = {
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/call",
            "params": {
                "name": name,
                "arguments": arguments
            }
        }
        
        response = await client.post(url, json=payload)
        return response.json()


# ==================== 预设调用函数 ====================

async def chat(message, system_prompt=None):
    """聊天对话"""
    args = {"message": message}
    if system_prompt:
        args["system_prompt"] = system_prompt
    return await call_tool(LOCAL_URL, "chat_completion", args)

async def generate_image(prompt, size="1024x1024", n=1):
    """生成图片"""
    return await call_tool(LOCAL_URL, "generate_image", {
        "prompt": prompt,
        "size": size,
        "n": n
    })

async def generate_video(prompt, duration=5, size="1024x576"):
    """生成视频"""
    return await call_tool(LOCAL_URL, "generate_video", {
        "prompt": prompt,
        "duration": duration,
        "size": size
    })

async def check_video(task_id):
    """查询视频状态"""
    return await call_tool(LOCAL_URL, "check_video_status", {
        "task_id": task_id
    })

async def chat_with_image(message, image_url):
    """图片理解"""
    return await call_tool(LOCAL_URL, "chat_with_image", {
        "message": message,
        "image_url": image_url
    })


# ==================== 主程序 ====================

async def main():
    base_url = LOCAL_URL
    
    print("=" * 50)
    print("Agnes AI MCP 调用工具")
    print("=" * 50)
    
    # 连接
    if not await connect_sse(base_url):
        return
    
    print("\n选择功能:")
    print("1. 聊天对话")
    print("2. 生成图片")
    print("3. 生成视频")
    print("4. 查询视频状态")
    print("5. 图片理解")
    
    choice = input("\n请选择: ").strip()
    
    print()
    result = None
    
    if choice == "1":
        msg = input("输入聊天内容: ").strip()
        if msg:
            result = await chat(msg)
    
    elif choice == "2":
        prompt = input("输入图片描述: ").strip()
        if prompt:
            result = await generate_image(prompt)
    
    elif choice == "3":
        prompt = input("输入视频描述: ").strip()
        if prompt:
            result = await generate_video(prompt)
    
    elif choice == "4":
        task_id = input("输入任务ID: ").strip()
        if task_id:
            result = await check_video(task_id)
    
    elif choice == "5":
        msg = input("输入问题: ").strip()
        url = input("输入图片URL: ").strip()
        if msg and url:
            result = await chat_with_image(msg, url)
    
    if result:
        print("\n" + "=" * 50)
        if "result" in result:
            print(result["result"])
        else:
            print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
