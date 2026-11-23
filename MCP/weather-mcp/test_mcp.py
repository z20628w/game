"""
MCP 客户端测试脚本 v2
正确处理 SSE 流的同时发送 JSON-RPC 消息
"""
import asyncio
import httpx
import json
import sys


class MCPClient:
    def __init__(self, base_url):
        self.base_url = base_url
        self.session_id = None
        self.endpoint_url = None
        self.responses = {}  # id -> response
        self.response_event = asyncio.Event()
        self.connected_event = asyncio.Event()

    async def listen_sse(self):
        """后台任务：监听 SSE 流"""
        print(f"📡 连接 SSE: {self.base_url}/sse")
        async with httpx.AsyncClient(timeout=None) as client:
            try:
                async with client.stream("GET", f"{self.base_url}/sse") as response:
                    if response.status_code != 200:
                        print(f"❌ SSE 状态码: {response.status_code}")
                        return

                    print("✅ SSE 已连接，等待 endpoint 事件...")
                    async for line in response.aiter_lines():
                        if line.startswith("data: "):
                            data = line[6:].strip()
                            if "/messages/?session_id=" in data:
                                self.session_id = data.split("session_id=")[1]
                                self.endpoint_url = f"{self.base_url}{data}"
                                print(f"✅ 拿到 session_id: {self.session_id}")
                                self.connected_event.set()
                            else:
                                # 这是一个 JSON-RPC 响应
                                try:
                                    msg = json.loads(data)
                                    msg_id = msg.get("id")
                                    if msg_id is not None:
                                        self.responses[msg_id] = msg
                                        print(f"   📥 收到响应 (id={msg_id})")
                                        self.response_event.set()
                                except json.JSONDecodeError:
                                    pass
                        # 忽略 ping 和其他行
            except Exception as e:
                print(f"❌ SSE 异常: {e}")
                self.connected_event.set()

    async def call(self, method, params=None, msg_id=1):
        """发送一个 JSON-RPC 消息并等待响应"""
        msg = {
            "jsonrpc": "2.0",
            "id": msg_id,
            "method": method,
        }
        if params is not None:
            msg["params"] = params

        if not self.endpoint_url:
            raise Exception("SSE 还未建立连接")

        print(f"   📤 发送 {method} (id={msg_id})")
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(self.endpoint_url, json=msg)
            print(f"   状态: {r.status_code}")
            return r.status_code

    async def wait_for_response(self, msg_id, timeout=10):
        """等待指定 id 的响应"""
        for _ in range(timeout * 10):
            if msg_id in self.responses:
                return self.responses[msg_id]
            await asyncio.sleep(0.1)
        return None


async def main():
    base_url = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000"
    print(f"\n🚀 测试 MCP 服务: {base_url}")
    print("=" * 60)

    client = MCPClient(base_url)

    # 启动后台 SSE 监听
    sse_task = asyncio.create_task(client.listen_sse())

    # 等待 SSE 建立
    try:
        await asyncio.wait_for(client.connected_event.wait(), timeout=15)
    except asyncio.TimeoutError:
        print("❌ SSE 连接超时")
        sse_task.cancel()
        return

    if not client.endpoint_url:
        print("❌ 未拿到 session_id")
        sse_task.cancel()
        return

    await asyncio.sleep(1)

    # ========== 第 1 步：initialize ==========
    print("\n🔧 第 1 步：initialize")
    await client.call("initialize", {
        "protocolVersion": "2024-11-05",
        "capabilities": {},
        "clientInfo": {"name": "test-client", "version": "1.0.0"}
    }, msg_id=1)

    resp = await client.wait_for_response(1, timeout=8)
    if resp:
        print(f"   ✅ 收到 initialize 响应")
        server_info = resp.get("result", {}).get("serverInfo", {})
        print(f"   服务器: {server_info.get('name', 'unknown')} v{server_info.get('version', '?')}")
    else:
        print("   ❌ initialize 超时")

    await asyncio.sleep(0.5)

    # ========== 第 2 步：tools/list ==========
    print("\n📋 第 2 步：tools/list")
    await client.call("tools/list", msg_id=2)

    resp = await client.wait_for_response(2, timeout=8)
    if resp and "result" in resp:
        tools = resp["result"].get("tools", [])
        print(f"   ✅ 找到 {len(tools)} 个工具:")
        for t in tools:
            print(f"      - {t['name']}")
            print(f"        {t.get('description', '')[:70]}")
    else:
        print(f"   ❌ tools/list 失败: {resp}")

    await asyncio.sleep(0.5)

    # ========== 第 3 步：调用 get_current_weather 东莞 ==========
    print("\n🌤️  第 3 步：调用 get_current_weather('东莞')")
    await client.call("tools/call", {
        "name": "get_current_weather",
        "arguments": {"city": "东莞"}
    }, msg_id=3)

    resp = await client.wait_for_response(3, timeout=15)
    if resp and "result" in resp:
        content = resp["result"].get("content", [])
        print(f"\n   ✅ 调用成功！")
        print("   " + "=" * 56)
        for c in content:
            if c.get("type") == "text":
                text = c.get("text", "")
                for line in text.split("\n"):
                    print(f"   {line}")
        print("   " + "=" * 56)
    else:
        print(f"   ❌ 调用失败: {resp}")

    # ========== 第 4 步：调用 get_weather_forecast 东莞 3天 ==========
    print("\n📅 第 4 步：调用 get_weather_forecast('东莞', 3)")
    await client.call("tools/call", {
        "name": "get_weather_forecast",
        "arguments": {"city": "东莞", "days": 3}
    }, msg_id=4)

    resp = await client.wait_for_response(4, timeout=15)
    if resp and "result" in resp:
        content = resp["result"].get("content", [])
        print(f"\n   ✅ 未来3天预报:")
        print("   " + "=" * 56)
        for c in content:
            if c.get("type") == "text":
                text = c.get("text", "")
                for line in text.split("\n"):
                    print(f"   {line}")
        print("   " + "=" * 56)
    else:
        print(f"   ❌ 调用失败: {resp}")

    # 关闭
    sse_task.cancel()
    print("\n✅ 测试完成")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n退出")
