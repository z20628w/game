@echo off
chcp 65001 >nul
echo ========================================
echo   MCP 天气查询工具（CMD 版）
echo ========================================
echo.

set /p CITY="请输入城市名（如：东莞、北京、上海）: "
set SERVER=https://70c18436.r16.vip.cpolar.cn

echo.
echo 正在连接 MCP 服务...
echo.

:: 创建一个临时的 Python 脚本来执行调用
python -c "
import httpx, asyncio, json

async def call():
    base = '%SERVER%'
    city = '%CITY%'
    print(f'调用: {base}')
    print(f'城市: {city}')
    print()
    
    async with httpx.AsyncClient(timeout=30) as client:
        # 连接 SSE 获取 session_id
        print('连接 SSE...')
        async with client.stream('GET', f'{base}/sse') as r:
            async for line in r.aiter_lines():
                if 'session_id=' in line:
                    sid = line.split('session_id=')[1].strip()
                    print(f'session_id: {sid}')
                    break
        
        endpoint = f'{base}/messages/?session_id={sid}'
        
        # initialize
        print('初始化...')
        await client.post(endpoint, json={'jsonrpc':'2.0','id':1,'method':'initialize','params':{'protocolVersion':'2024-11-05','capabilities':{},'clientInfo':{'name':'cmd','version':'1'}}})
        
        # 调用天气
        print(f'查询 {city} 天气...')
        r = await client.post(endpoint, json={'jsonrpc':'2.0','id':2,'method':'tools/call','params':{'name':'get_current_weather','arguments':{'city':city}}})
        print(f'HTTP状态: {r.status_code}')
        
        # 等待结果
        import asyncio
        await asyncio.sleep(3)
        
        async with client.stream('GET', f'{base}/sse') as r2:
            async for line in r2.aiter_lines():
                if line.startswith('data: '):
                    try:
                        d = json.loads(line[6:])
                        if d.get('id') == 2 and 'result' in d:
                            for c in d['result'].get('content', []):
                                if c.get('type') == 'text':
                                    print()
                                    print('=' * 50)
                                    print(c['text'])
                                    print('=' * 50)
                            return
                    except:
                        pass

asyncio.run(call())
"

echo.
pause
