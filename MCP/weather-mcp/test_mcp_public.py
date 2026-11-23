"""
测试通过公网 URL 调用 MCP 服务
"""
import asyncio
import json
import httpx
import sys

# Force UTF-8 for emoji output
sys.stdout.reconfigure(encoding="utf-8")

PUBLIC_URL = "https://640e42a7.r6.cpolar.cn"

async def test_mcp():
    sys.stdout.reconfigure(encoding="utf-8")
    print(f"🌐 测试 MCP 服务（公网 URL: {PUBLIC_URL}）")
    print("=" * 60)
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        # Step 1: 连接 SSE 端点获取 session_id
        print("\n📡 Step 1: 连接 SSE 端点...")
        session_id = None
        post_path = None
        
        async with client.stream("GET", f"{PUBLIC_URL}/sse/", 
                                  headers={"Accept": "text/event-stream"}) as response:
            print(f"   SSE 状态码: {response.status_code}")
            
            if response.status_code != 200:
                print(f"❌ SSE 连接失败: {response.status_code}")
                return
            
            async for line in response.aiter_lines():
                if line.startswith("data: "):
                    post_path = line[6:].strip()
                    # 提取 session_id
                    if "session_id=" in post_path:
                        session_id = post_path.split("session_id=")[1]
                    print(f"   ✅ 收到 session_id: {session_id}")
                    print(f"   📍 POST 端点: {post_path}")
                    break
            
            if not session_id:
                print("❌ 未获取到 session_id")
                return
            
            # Step 2: 发送 initialize 请求
            print("\n📤 Step 2: 发送 initialize 请求...")
            init_body = {
                "jsonrpc": "2.0",
                "id": "1",
                "method": "initialize",
                "params": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {},
                    "clientInfo": {"name": "test-client", "version": "1.0"}
                }
            }
            
            post_url = f"{PUBLIC_URL}{post_path}"
            init_resp = await client.post(post_url, json=init_body)
            print(f"   POST 状态码: {init_resp.status_code}")
            
            if init_resp.status_code == 200:
                init_text = init_resp.text
                print(f"   响应: {init_text[:200]}...")
                
                # 检查 SSE 事件中的响应
                print("\n   📥 等待响应通过 SSE 返回...")
                try:
                    async for line in response.aiter_lines():
                        if line.startswith("data: "):
                            data = line[6:]
                            if "result" in data or "error" in data:
                                print(f"   接收到: {data[:300]}")
                                break
                except asyncio.TimeoutError:
                    print("   ⏰ 等待 SSE 响应超时")
            else:
                print(f"❌ 初始化请求失败: {init_resp.text[:200]}")
            
            # Step 3: 发送 tools/list 请求
            print("\n📤 Step 3: 发送 tools/list 请求...")
            tools_body = {
                "jsonrpc": "2.0",
                "id": "2",
                "method": "tools/list",
                "params": {}
            }
            
            tools_resp = await client.post(post_url, json=tools_body)
            print(f"   POST 状态码: {tools_resp.status_code}")
            
            if tools_resp.status_code == 200:
                tools_text = tools_resp.text
                print(f"   响应: {tools_text[:500]}...")
            
            # 保持 SSE 连接短暂开放以接收响应
            print("\n⏳ 等待 SSE 长连接响应...")
            await asyncio.sleep(3)
            
            # 尝试读取 SSE 中的剩余事件
            remaining = []
            try:
                async for line in response.aiter_lines():
                    remaining.append(line)
                    if len(remaining) > 20:
                        break
            except (asyncio.TimeoutError, Exception):
                pass
            
            if remaining:
                print(f"   额外接收 {len(remaining)} 行: {remaining[:10]}")

if __name__ == "__main__":
    asyncio.run(test_mcp())
