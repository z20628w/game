"""逐步调试 MCP 公网连接"""
import asyncio
import sys
sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")

PUBLIC_URL = "https://640e42a7.r6.cpolar.cn"

async def debug_test():
    print("Step 1: 导入 sse_client...", flush=True)
    from mcp.client.sse import sse_client
    print("Step 2: 导入 ClientSession...", flush=True)
    from mcp.client.session import ClientSession
    
    print(f"Step 3: 连接 {PUBLIC_URL}/sse/ ...", flush=True)
    try:
        async with sse_client(url=f"{PUBLIC_URL}/sse/", timeout=5, sse_read_timeout=30) as streams:
            print("Step 4: SSE 连接建立!", flush=True)
            read_stream, write_stream = streams
            print(f"   read_stream: {type(read_stream).__name__}", flush=True)
            print(f"   write_stream: {type(write_stream).__name__}", flush=True)
            
            print("Step 5: 创建 ClientSession...", flush=True)
            async with ClientSession(read_stream, write_stream) as session:
                print("Step 6: Session 创建成功!", flush=True)
                
                print("Step 7: 发送 initialize...", flush=True)
                init = await session.initialize()
                print(f"   初始化成功: {init.serverInfo.name}", flush=True)
                
                print("Step 8: 获取工具列表...", flush=True)
                tools = await session.list_tools()
                print(f"   共 {len(tools.tools)} 个工具", flush=True)
                
                print("Step 9: 测试 get_current_weather...", flush=True)
                result = await session.call_tool("get_current_weather", {"city": "东莞"})
                for content in result.content:
                    if hasattr(content, 'text'):
                        print(f"   结果: {content.text[:200]}", flush=True)
                
                print("\n全部测试通过!", flush=True)
    except Exception as e:
        print(f"\n错误: {type(e).__name__}: {e}", flush=True)
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    try:
        asyncio.run(asyncio.wait_for(debug_test(), timeout=25))
    except asyncio.TimeoutError:
        print("\n❌ 超时: 测试在25秒内未完成")
        sys.exit(1)
