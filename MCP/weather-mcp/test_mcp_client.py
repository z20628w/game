"""使用 mcp 官方客户端库测试公网连接"""
import asyncio
import sys
sys.stdout.reconfigure(encoding="utf-8")

from mcp.client.session import ClientSession
from mcp.client.sse import sse_client

PUBLIC_URL = "https://640e42a7.r6.cpolar.cn"

async def test():
    print("=" * 60)
    print("MCP 客户端库端到端测试")
    print(f"URL: {PUBLIC_URL}/sse/")
    print("=" * 60)
    
    try:
        async with sse_client(url=f"{PUBLIC_URL}/sse/") as streams:
            print("[1] SSE 连接建立成功!")
            
            async with ClientSession(*streams) as session:
                print("[2] MCP Session 创建成功!")
                
                # 初始化
                print("\n[3] 发送 initialize...")
                init = await session.initialize()
                print(f"    服务端: {init.serverInfo.name} v{init.serverInfo.version}")
                print(f"    协议: {init.protocolVersion}")
                
                # 获取工具列表
                print("\n[4] 获取工具列表...")
                tools = await session.list_tools()
                print(f"    共 {len(tools.tools)} 个工具:")
                for t in tools.tools:
                    print(f"    - {t.name}: {t.description[:60]}")
                
                # 调用工具
                print("\n[5] 测试 get_weather_summary(东莞)...")
                result = await session.call_tool("get_weather_summary", {"city": "东莞"})
                for content in result.content:
                    if hasattr(content, 'text'):
                        print(f"    -> {content.text.strip()}")
                
                print("\n[6] 测试 get_current_weather(东莞)...")
                result = await session.call_tool("get_current_weather", {"city": "东莞"})
                for content in result.content:
                    if hasattr(content, 'text'):
                        print(f"    -> {content.text[:200]}...")
                
                print("\n" + "=" * 60)
                print("全部测试通过!")
                    
    except Exception as e:
        print(f"\n错误: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test())
