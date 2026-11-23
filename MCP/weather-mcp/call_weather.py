"""
一条命令调 MCP 工具（Windows CMD 版）
用法: python call_weather.py <城市> [工具名]
"""
import sys
import asyncio
import httpx
import json


async def call_weather(city: str, tool: str = "get_current_weather", base_url: str = None):
    """通过 cpolar 隧道调用天气 MCP"""
    if base_url is None:
        base_url = "https://70c18436.r16.vip.cpolar.cn"

    print(f"\n🌐 调用的 MCP 服务: {base_url}")
    print(f"🏙️  城市: {city}")
    print(f"🛠️  工具: {tool}")
    print("=" * 50)

    # 先连接 SSE 拿 session_id
    sse_url = f"{base_url}/sse"
    session_id = None

    async with httpx.AsyncClient(timeout=30) as client:
        # 第1步：连接 SSE 获取 session_id
        print("📡 连接 SSE...")
        async with client.stream("GET", sse_url) as resp:
            async for line in resp.aiter_lines():
                if line.startswith("data: ") and "session_id=" in line:
                    session_id = line.split("session_id=")[1]
                    print(f"✅ session_id: {session_id}")
                    break

        if not session_id:
            print("❌ 未获取到 session_id")
            return

        endpoint = f"{base_url}/messages/?session_id={session_id}"

        # 第2步：发送 initialize
        print("🔧 初始化...")
        await client.post(endpoint, json={
            "jsonrpc": "2.0", "id": 1, "method": "initialize",
            "params": {"protocolVersion": "2024-11-05", "capabilities": {},
                       "clientInfo": {"name": "cmd-client", "version": "1.0"}}
        })

        # 第3步：调用工具
        print(f"🌤️ 调用 {tool}('{city}')...")
        result = await client.post(endpoint, json={
            "jsonrpc": "2.0", "id": 2, "method": "tools/call",
            "params": {"name": tool, "arguments": {"city": city}}
        })
        print(f"   状态: {result.status_code}")

        # 第4步：读取 SSE 响应（在这个连接里继续读）
        await asyncio.sleep(2)
        async with client.stream("GET", sse_url) as resp:
            count = 0
            async for line in resp.aiter_lines():
                if line.startswith("data: "):
                    try:
                        data = json.loads(line[6:])
                        if data.get("id") == 2 and "result" in data:
                            content = data["result"].get("content", [])
                            print("\n" + "=" * 50)
                            print("📋 天气结果:")
                            print("=" * 50)
                            for c in content:
                                if c.get("type") == "text":
                                    print(c["text"])
                            print("=" * 50)
                            count += 1
                            break
                    except json.JSONDecodeError:
                        pass
                count += 1
                if count > 100:
                    break

            if count == 0:
                print("❌ 未收到响应结果")


if __name__ == "__main__":
    city = sys.argv[1] if len(sys.argv) > 1 else "东莞"
    tool = sys.argv[2] if len(sys.argv) > 2 else "get_current_weather"
    base = sys.argv[3] if len(sys.argv) > 3 else None

    asyncio.run(call_weather(city, tool, base))
