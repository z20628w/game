"""完整的 MCP 端到端测试（公网）"""
import asyncio
import json
import httpx
import sys

sys.stdout.reconfigure(encoding="utf-8")

PUBLIC_URL = "https://640e42a7.r6.cpolar.cn"

async def test_mcp():
    print("=" * 60)
    print("\U0001f310 MCP 端到端测试（公网）")
    print(f"URL: {PUBLIC_URL}/sse/")
    print("=" * 60)
    
    results = {}
    
    async with httpx.AsyncClient(timeout=60.0) as client:
        # 建立 SSE 长连接
        print("\n[1] 建立 SSE 连接...")
        
        async with client.stream(
            "GET", f"{PUBLIC_URL}/sse/",
            headers={"Accept": "text/event-stream"},
        ) as response:
            print(f"    SSE 状态码: {response.status_code}")
            if response.status_code != 200:
                print(f"\u274c SSE 连接失败: {response.status_code}")
                return
            
            # 读取 session_id
            session_id = None
            post_path = None
            
            async for line in response.aiter_lines():
                if line.startswith("data: "):
                    data = line[6:]
                    post_path = data
                    if "session_id=" in data:
                        session_id = data.split("session_id=")[1]
                    print(f"    \u2705 session_id: {session_id}")
                    print(f"    \U0001f4cd POST endpoint: {post_path}")
                    break
            
            if not session_id:
                print("\u274c 未获取 session_id")
                return
            
            results["session_id"] = session_id
            
            # 发送 initialize
            print("\n[2] 发送 initialize...")
            init_body = {
                "jsonrpc": "2.0", "id": "1",
                "method": "initialize",
                "params": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {},
                    "clientInfo": {"name": "qclaw-test", "version": "1.0"}
                }
            }
            
            post_url = f"{PUBLIC_URL}{post_path}"
            await client.post(post_url, json=init_body)
            print("    已发送 initialize，等待 SSE 响应...")
            
            # 从 SSE 读取 init 响应
            init_ok = False
            async for line in response.aiter_lines():
                if line.startswith("data: "):
                    data = line[6:]
                    if "result" in data or "error" in data or "serverInfo" in data:
                        print(f"    \u2705 初始化响应: {data[:300]}")
                        init_ok = True
                        break
            
            if not init_ok:
                print("    \u26a0\ufe0f 未收到初始化响应（可能是 session 过期）")
            
            # 发送 tools/list
            print("\n[3] 发送 tools/list...")
            tools_body = {
                "jsonrpc": "2.0", "id": "2",
                "method": "tools/list",
                "params": {}
            }
            await client.post(post_url, json=tools_body)
            print("    已发送 tools/list，等待 SSE 响应...")
            
            async for line in response.aiter_lines():
                if line.startswith("data: "):
                    data = line[6:]
                    if '"result"' in data and '"tools"' in data:
                        try:
                            parsed = json.loads(data)
                            tools = parsed.get("result", {}).get("tools", [])
                            print(f"    \u2705 获取到 {len(tools)} 个工具:")
                            for t in tools:
                                print(f"       - {t['name']}: {t.get('description', '')[:60]}")
                            results["tools"] = tools
                        except:
                            print(f"    响应: {data[:500]}")
                        break
                    elif '"error"' in data:
                        print(f"    \u274c 错误: {data[:300]}")
                        break
            
            # 测试工具调用
            if results.get("tools"):
                print("\n[4] 测试 get_weather_summary...")
                call_body = {
                    "jsonrpc": "2.0", "id": "3",
                    "method": "tools/call",
                    "params": {
                        "name": "get_weather_summary",
                        "arguments": {"city": "东莞"}
                    }
                }
                await client.post(post_url, json=call_body)
                print("    已发送，等待 SSE 响应...")
                
                async for line in response.aiter_lines():
                    if line.startswith("data: "):
                        data = line[6:]
                        if "content" in data or '"result"' in data or "text" in data:
                            print(f"    \u2705 天气结果: {data[:500]}")
                            break
                        elif '"error"' in data:
                            print(f"    \u274c 错误: {data[:300]}")
                            break
    
    print("\n" + "=" * 60)
    print("\u2705 测试完成")
    return results

if __name__ == "__main__":
    asyncio.run(test_mcp())
