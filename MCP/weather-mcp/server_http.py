"""
天气查询 MCP 服务 (Streamable HTTP 版本)
适用于企业微信智能机器人
传输协议: Streamable HTTP
监听地址: 0.0.0.0:3000
"""

from mcp.server.fastmcp import FastMCP
from starlette.applications import Starlette
from starlette.routing import Route
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse
import uvicorn
import httpx
import json
from typing import Optional

# 创建 MCP 服务实例
mcp = FastMCP("weather-service")


@mcp.tool()
async def get_current_weather(city: str) -> str:
    """获取指定城市的当前天气
    
    Args:
        city: 城市名称，如"北京"、"上海"、"广州"
    
    Returns:
        天气信息字符串
    """
    try:
        async with httpx.AsyncClient() as client:
            url = f"https://wttr.in/{city}?format=j1&lang=zh"
            response = await client.get(url)
            response.raise_for_status()
            data = response.json()
            
            current = data["current_condition"][0]
            
            # 获取天气描述
            weather_desc = "未知"
            if current.get("lang_zh") and len(current["lang_zh"]) > 0:
                weather_desc = current["lang_zh"][0]["value"]
            elif current.get("weatherDesc"):
                weather_desc = current["weatherDesc"][0]["value"]
            
            return (
                f"🌤️ {city}当前天气\n"
                f"🌡️ 温度: {current['temp_C']}°C\n"
                f"📝 天气: {weather_desc}\n"
                f"💧 湿度: {current['humidity']}%\n"
                f"🌬️ 风速: {current['windspeedKmph']} km/h\n"
                f"👁️ 能见度: {current['visibility']} km"
            )
    except Exception as e:
        return f"❌ 查询失败: {str(e)}"


@mcp.tool()
async def get_weather_forecast(city: str, days: int = 3) -> str:
    """获取指定城市的天气预报
    
    Args:
        city: 城市名称
        days: 预报天数 (1-3天)
    
    Returns:
        天气预报字符串
    """
    try:
        days = min(max(days, 1), 3)
        async with httpx.AsyncClient() as client:
            url = f"https://wttr.in/{city}?format=j1&lang=zh"
            response = await client.get(url)
            response.raise_for_status()
            data = response.json()
            
            forecast = data["weather"][:days]
            result = f"📅 {city} {days}天天气预报\n\n"
            
            for day in forecast:
                date = day["date"]
                max_temp = day["maxtempC"]
                min_temp = day["mintempC"]
                desc = day["hourly"][4]["weatherDesc"][0]["value"]
                
                result += f"📆 {date}\n"
                result += f"   🌡️ {min_temp}°C ~ {max_temp}°C\n"
                result += f"   📝 {desc}\n\n"
            
            return result.strip()
    except Exception as e:
        return f"❌ 查询失败: {str(e)}"


@mcp.tool()
async def get_china_cities() -> str:
    """获取中国主要城市列表"""
    cities = [
        "北京", "上海", "广州", "深圳", "杭州", "南京", "成都", "重庆",
        "武汉", "西安", "天津", "苏州", "长沙", "郑州", "沈阳", "青岛",
        "宁波", "东莞", "佛山", "合肥", "昆明", "大连", "厦门", "哈尔滨",
        "济南", "温州", "南宁", "长春", "泉州", "石家庄", "贵阳", "南昌",
        "金华", "常州", "珠海", "惠州", "嘉兴", "南通", "中山", "保定"
    ]
    return "🏙️ 支持查询的城市:\n" + ", ".join(cities)


# Streamable HTTP 处理
async def handle_mcp(request: Request):
    """处理 MCP Streamable HTTP 请求"""
    if request.method == "GET":
        # SSE 模式
        from sse_starlette.sse import EventSourceResponse
        import asyncio
        
        async def event_generator():
            # 发送初始化事件
            yield {
                "event": "message",
                "data": json.dumps({
                    "jsonrpc": "2.0",
                    "id": 0,
                    "result": {
                        "protocolVersion": "2024-11-05",
                        "capabilities": {},
                        "serverInfo": {"name": "weather-service", "version": "1.0.0"}
                    }
                })
            }
            # 保持连接
            while True:
                await asyncio.sleep(30)
                yield {"event": "ping", "data": ""}
        
        return EventSourceResponse(event_generator())
    
    elif request.method == "POST":
        # 处理 JSON-RPC 请求
        body = await request.json()
        
        if body.get("method") == "initialize":
            return JSONResponse({
                "jsonrpc": "2.0",
                "id": body.get("id"),
                "result": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {},
                    "serverInfo": {"name": "weather-service", "version": "1.0.0"}
                }
            })
        
        elif body.get("method") == "tools/list":
            return JSONResponse({
                "jsonrpc": "2.0",
                "id": body.get("id"),
                "result": {
                    "tools": [
                        {
                            "name": "get_current_weather",
                            "description": "获取指定城市的当前天气",
                            "inputSchema": {
                                "type": "object",
                                "properties": {
                                    "city": {"type": "string", "description": "城市名称"}
                                },
                                "required": ["city"]
                            }
                        },
                        {
                            "name": "get_weather_forecast",
                            "description": "获取天气预报",
                            "inputSchema": {
                                "type": "object",
                                "properties": {
                                    "city": {"type": "string"},
                                    "days": {"type": "integer", "default": 3}
                                },
                                "required": ["city"]
                            }
                        },
                        {
                            "name": "get_china_cities",
                            "description": "获取中国主要城市列表",
                            "inputSchema": {"type": "object", "properties": {}}
                        }
                    ]
                }
            })
        
        elif body.get("method") == "tools/call":
            params = body.get("params", {})
            tool_name = params.get("name")
            arguments = params.get("arguments", {})
            
            if tool_name == "get_current_weather":
                result = await get_current_weather(arguments.get("city", ""))
            elif tool_name == "get_weather_forecast":
                result = await get_weather_forecast(
                    arguments.get("city", ""),
                    arguments.get("days", 3)
                )
            elif tool_name == "get_china_cities":
                result = await get_china_cities()
            else:
                result = f"未知工具: {tool_name}"
            
            return JSONResponse({
                "jsonrpc": "2.0",
                "id": body.get("id"),
                "result": {
                    "content": [{"type": "text", "text": result}],
                    "isError": False
                }
            })
        
        return JSONResponse({"jsonrpc": "2.0", "id": body.get("id"), "result": {}})
    
    return JSONResponse({"error": "Method not allowed"}, status_code=405)


# CORS 中间件配置
middleware = [
    Middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
        allow_credentials=True,
    )
]

# 创建 Starlette 应用
app = Starlette(
    debug=True,
    routes=[
        Route("/mcp", handle_mcp, methods=["GET", "POST"]),
        Route("/", handle_mcp, methods=["GET", "POST"]),
    ],
    middleware=middleware,
)

if __name__ == "__main__":
    import sys
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    print("🌤️ 天气查询 MCP 服务启动中... (Streamable HTTP 模式)")
    print("=" * 50)
    print("📡 传输协议: Streamable HTTP")
    print("📍 监听地址: http://0.0.0.0:3000/mcp")
    print("=" * 50)
    
    uvicorn.run(app, host="0.0.0.0", port=3000)
