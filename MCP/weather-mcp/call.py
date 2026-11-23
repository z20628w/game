#!/usr/bin/env python3
"""
天气 MCP 客户端调用脚本
"""
import asyncio
import httpx
import json
import sys

BASE_URL = "http://localhost:3000"


async def call_tool(tool_name: str, arguments: dict):
    """调用 MCP 工具"""
    async with httpx.AsyncClient(timeout=30) as client:
        # 连接 SSE 获取 session_id
        print(f"🔗 连接 {BASE_URL}/sse ...")
        session_id = None
        async with client.stream('GET', f'{BASE_URL}/sse') as r:
            async for line in r.aiter_lines():
                if 'session_id=' in line:
                    session_id = line.split('session_id=')[1].strip()
                    print(f"✅ session_id: {session_id}")
                    break
        
        if not session_id:
            print("❌ 无法获取 session_id")
            return
        
        endpoint = f'{BASE_URL}/messages/?session_id={session_id}'
        
        # initialize
        print("🔄 初始化...")
        await client.post(endpoint, json={
            'jsonrpc': '2.0',
            'id': 1,
            'method': 'initialize',
            'params': {
                'protocolVersion': '2024-11-05',
                'capabilities': {},
                'clientInfo': {'name': 'weather-client', 'version': '1.0'}
            }
        })
        
        # 调用工具
        print(f"🛠️ 调用工具: {tool_name}")
        await client.post(endpoint, json={
            'jsonrpc': '2.0',
            'id': 2,
            'method': 'tools/call',
            'params': {
                'name': tool_name,
                'arguments': arguments
            }
        })
        
        # 获取结果
        print("⏳ 等待结果...")
        await asyncio.sleep(2)
        
        async with client.stream('GET', f'{BASE_URL}/sse') as r:
            async for line in r.aiter_lines():
                if line.startswith('data: '):
                    try:
                        data = json.loads(line[6:])
                        if data.get('id') == 2 and 'result' in data:
                            for content in data['result'].get('content', []):
                                if content.get('type') == 'text':
                                    print("\n" + "=" * 50)
                                    print(content['text'])
                                    print("=" * 50)
                            return
                    except Exception as e:
                        pass
        
        print("⚠️ 未收到结果")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("用法: python call.py <工具名> [参数JSON]")
        print("示例: python call.py get_current_weather '{\"city\":\"东莞\"}'")
        sys.exit(1)
    
    tool_name = sys.argv[1]
    arguments = json.loads(sys.argv[2]) if len(sys.argv) > 2 else {}
    
    asyncio.run(call_tool(tool_name, arguments))
