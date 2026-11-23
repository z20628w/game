"""
Agnes AI MCP 服务测试脚本
支持本地和隧道两种方式测试
"""
import httpx
import asyncio
import sys

# 配置
LOCAL_URL = "http://localhost:3001"
TUNNEL_URL = "https://你的agnes-cpolar地址"  # 改这里！

SESSION_ID = None

def choose_mode():
    """选择测试模式"""
    print("=" * 50)
    print("Agnes AI MCP 测试工具")
    print("=" * 50)
    print("1. 本地测试 (localhost:3001)")
    print("2. 隧道测试 (cpolar)")
    print("3. 手动输入URL")
    choice = input("\n请选择 (1/2/3): ").strip()
    
    if choice == "1":
        return LOCAL_URL
    elif choice == "2":
        return TUNNEL_URL
    elif choice == "3":
        return input("请输入完整URL: ").strip().rstrip("/")
    else:
        return LOCAL_URL

async def connect_sse(base_url):
    """连接SSE获取session_id"""
    global SESSION_ID
    print(f"\n🔗 连接 {base_url}/sse ...")
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            async with client.stream("GET", f"{base_url}/sse") as response:
                async for line in response.aiter_lines():
                    if line.startswith("data:"):
                        data = line[5:].strip()
                        if data.startswith("{"):
                            import json
                            msg = json.loads(data)
                            if msg.get("type") == "connected":
                                print(f"✅ 连接成功!")
                                # 从endpoint获取session_id
                                endpoint = msg.get("endpoint", "")
                                if "session_id=" in endpoint:
                                    SESSION_ID = endpoint.split("session_id=")[1].split("&")[0]
                                print(f"📋 Session ID: {SESSION_ID}")
                                return True
                        elif "session_id=" in data:
                            import re
                            match = re.search(r'session_id=([^&\s]+)', data)
                            if match:
                                SESSION_ID = match.group(1)
                                print(f"✅ 连接成功! Session ID: {SESSION_ID}")
                                return True
        return False
    except Exception as e:
        print(f"❌ 连接失败: {e}")
        return False

async def send_request(base_url, method, params=None):
    """发送MCP请求"""
    if not SESSION_ID:
        print("❌ 未连接，请先连接SSE")
        return None
    
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": method
    }
    if params:
        payload["params"] = params
    
    url = f"{base_url}/messages/?session_id={SESSION_ID}"
    
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(url, json=payload)
            response.raise_for_status()
            return response.json()
    except Exception as e:
        return {"error": str(e)}

async def initialize(base_url):
    """初始化MCP"""
    print("\n📡 初始化连接...")
    result = await send_request(base_url, "initialize", {
        "protocolVersion": "2024-11-05",
        "capabilities": {},
        "clientInfo": {"name": "test-script", "version": "1.0"}
    })
    if result and "error" not in result:
        print("✅ 初始化成功!")
        return True
    else:
        print(f"❌ 初始化失败: {result}")
        return False

async def test_chat(base_url):
    """测试聊天功能"""
    print("\n💬 测试聊天对话...")
    result = await send_request(base_url, "tools/call", {
        "name": "chat_completion",
        "arguments": {"message": "你好，介绍一下你自己"}
    })
    print_result("聊天", result)

async def test_image(base_url):
    """测试图片生成"""
    print("\n🎨 测试图片生成...")
    result = await send_request(base_url, "tools/call", {
        "name": "generate_image",
        "arguments": {"prompt": "一只可爱的橘猫", "size": "1024x1024", "n": 1}
    })
    print_result("图片", result)

async def test_video(base_url):
    """测试视频生成"""
    print("\n🎬 测试视频生成...")
    result = await send_request(base_url, "tools/call", {
        "name": "generate_video",
        "arguments": {"prompt": "海浪拍打沙滩", "duration": 5}
    })
    print_result("视频", result)

def print_result(name, result):
    """打印结果"""
    if result and "error" not in result:
        print(f"✅ {name}请求成功!")
        if "result" in result:
            print(result["result"])
    else:
        print(f"❌ {name}失败: {result}")

async def run_tests(base_url):
    """运行测试"""
    if not await connect_sse(base_url):
        return
    
    if not await initialize(base_url):
        return
    
    await test_chat(base_url)
    await test_image(base_url)
    await test_video(base_url)
    
    print("\n" + "=" * 50)
    print("测试完成!")
    print("=" * 50)

async def interactive_mode(base_url):
    """交互模式"""
    if not await connect_sse(base_url):
        return
    
    if not await initialize(base_url):
        return
    
    request_id = 2
    
    while True:
        print("\n" + "-" * 30)
        print("1. 聊天对话")
        print("2. 生成图片")
        print("3. 生成视频")
        print("4. 查询视频状态")
        print("5. 图片理解")
        print("0. 退出")
        print("-" * 30)
        
        choice = input("\n请选择功能: ").strip()
        
        if choice == "0":
            break
        
        params = {"id": request_id, "method": "tools/call", "params": {}}
        request_id += 1
        
        if choice == "1":
            msg = input("请输入聊天内容: ").strip()
            if msg:
                params["params"] = {"name": "chat_completion", "arguments": {"message": msg}}
            else:
                continue
        elif choice == "2":
            prompt = input("请输入图片描述: ").strip()
            if prompt:
                params["params"] = {"name": "generate_image", "arguments": {"prompt": prompt, "size": "1024x1024", "n": 1}}
            else:
                continue
        elif choice == "3":
            prompt = input("请输入视频描述: ").strip()
            if prompt:
                params["params"] = {"name": "generate_video", "arguments": {"prompt": prompt, "duration": 5}}
            else:
                continue
        elif choice == "4":
            task_id = input("请输入任务ID: ").strip()
            if task_id:
                params["params"] = {"name": "check_video_status", "arguments": {"task_id": task_id}}
            else:
                continue
        elif choice == "5":
            msg = input("请输入关于图片的问题: ").strip()
            url = input("请输入图片URL: ").strip()
            if msg and url:
                params["params"] = {"name": "chat_with_image", "arguments": {"message": msg, "image_url": url}}
            else:
                continue
        else:
            continue
        
        result = await send_request(base_url, "tools/call", params["params"])
        print("\n" + "=" * 30)
        print_result("请求", result)

if __name__ == "__main__":
    mode = choose_mode()
    
    print("\n请选择模式:")
    print("1. 自动测试")
    print("2. 交互模式")
    choice = input("请选择 (1/2): ").strip()
    
    if choice == "2":
        asyncio.run(interactive_mode(mode))
    else:
        asyncio.run(run_tests(mode))
