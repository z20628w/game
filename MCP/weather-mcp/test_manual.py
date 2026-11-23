"""逐步手动测试 MCP - 使用 httpx 但手动控制"""
import asyncio
import json
import httpx
import sys
sys.stdout.reconfigure(encoding="utf-8")

PUBLIC_URL = "https://640e42a7.r6.cpolar.cn"
LOCAL_URL = "http://localhost:3000"
USE_LOCAL = "--local" in sys.argv

BASE = LOCAL_URL if USE_LOCAL else PUBLIC_URL
mode = "LOCAL" if USE_LOCAL else "PUBLIC"

async def main():
    print(f"={'='*50}=")
    print(f"  MCP 测试 - {mode}")
    print(f"  URL: {BASE}")
    print(f"={'='*50}=")
    
    async with httpx.AsyncClient(timeout=30.0) as c:
        # Step 1: SSE connection to get session_id
        print(f"\n[1] SSE 连接...")
        
        # Use the raw HTTP client for SSE
        sse_events = []
        sse_done = asyncio.Event()
        
        async def read_sse():
            try:
                async with c.stream("GET", f"{BASE}/sse/", 
                                     headers={"Accept": "text/event-stream"}) as resp:
                    print(f"    SSE 状态: {resp.status_code}")
                    async for line in resp.aiter_lines():
                        sse_events.append(line)
                        if line.startswith("data: ") and "session_id" in line:
                            print(f"    -> SSE 事件: {line}")
                            sse_done.set()
                        # Also collect any response-like events
                        if line.startswith("data: {"):
                            print(f"    -> SSE 数据: {line[:300]}")
            except Exception as e:
                print(f"    SSE 错误: {e}")
        
        # Start SSE reading in background
        task = asyncio.create_task(read_sse())
        
        # Wait for session_id
        try:
            await asyncio.wait_for(sse_done.wait(), timeout=10)
        except asyncio.TimeoutError:
            print("    ❌ 超时: 未收到 session_id")
            task.cancel()
            return
        
        # Extract session_id from the last SSE event
        session_id = None
        post_path = None
        for ev in sse_events:
            if ev.startswith("data: ") and "session_id=" in ev:
                post_path = ev[6:].strip()  # e.g., /sse/messages/?session_id=xxx
                session_id = post_path.split("session_id=")[1]
        print(f"    ✅ session_id: {session_id}")
        print(f"    📍 post_path: {post_path}")
        
        # Step 2: Send initialize
        print(f"\n[2] 发送 initialize...")
        init = {"jsonrpc":"2.0","id":"1","method":"initialize",
                "params":{"protocolVersion":"2024-11-05","capabilities":{},
                          "clientInfo":{"name":"qclaw-test","version":"1.0"}}}
        
        # Build the full POST URL
        from urllib.parse import urljoin
        post_url = urljoin(BASE + "/", post_path)
        print(f"    POST URL: {post_url}")
        
        resp = await c.post(post_url, json=init)
        print(f"    POST 状态: {resp.status_code}")
        print(f"    POST 响应: {resp.text[:200]}")
        
        # Wait for the response through SSE
        print(f"\n[3] 等待 initialize 响应 (SSE)...")
        await asyncio.sleep(2)
        
        resp_events = []
        for ev in sse_events:
            if ev.startswith("data: {") or ev.startswith("data: {"):
                resp_events.append(ev)
        
        if resp_events:
            print(f"    收到 SSE 响应: {resp_events[-1][:300]}")
        else:
            # Check if any new events came in
            print(f"    当前 SSE 事件数: {len(sse_events)}")
            for ev in sse_events[-5:]:
                print(f"    -> {ev[:200]}")
        
        # Step 4: Send tools/list
        print(f"\n[4] 发送 tools/list...")
        tools_req = {"jsonrpc":"2.0","id":"2","method":"tools/list","params":{}}
        resp = await c.post(post_url, json=tools_req)
        print(f"    POST 状态: {resp.status_code}")
        
        await asyncio.sleep(2)
        print(f"    SSE 事件数: {len(sse_events)}")
        for ev in sse_events[-5:]:
            print(f"    -> {ev[:300]}")
        
        # Cleanup
        task.cancel()
        try:
            await task
        except:
            pass
        
        print(f"\n={'='*50}=")
        print(f"  测试完成")
        print(f"={ '='*50}=")

if __name__ == "__main__":
    asyncio.run(main())
