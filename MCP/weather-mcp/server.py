"""
天气查询 MCP 服务
适用于企业微信智能机器人
传输协议: SSE (Server-Sent Events)
监听地址: 0.0.0.0:3000
"""

from mcp.server.fastmcp import FastMCP
from mcp.server.sse import SseServerTransport
from starlette.applications import Starlette
from starlette.routing import Mount
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware
import uvicorn
import httpx
from typing import Optional
import json

# 创建 MCP 服务实例
mcp = FastMCP("weather-service")


@mcp.tool()
async def get_current_weather(city: str) -> str:
    """获取指定城市的当前天气信息
    
    Args:
        city: 城市名称，如"北京"、"上海"、"深圳"、"广州"等
              也支持英文，如 "Beijing"、"Shanghai"
    
    Returns:
        当前天气的详细描述，包括温度、天气状况、湿度、风力等
    """
    try:
        # 使用 wttr.in 免费天气 API（无需 API Key）
        # format=j1 返回 JSON 格式，lang=zh 返回中文
        url = f"https://wttr.in/{city}?format=j1&lang=zh"
        
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(url)
            response.raise_for_status()
            data = response.json()
            
            current = data["current_condition"][0]
            
            # 优先使用中文描述，没有则用英文
            weather_desc = "未知"
            if current.get("lang_zh") and len(current["lang_zh"]) > 0:
                weather_desc = current["lang_zh"][0]["value"]
            elif current.get("weatherDesc"):
                weather_desc = current["weatherDesc"][0]["value"]
            
            result = (
                f"🌍 **{city} 当前天气**\n"
                f"━━━━━━━━━━━━━━━\n"
                f"🌡️ 温度：{current['temp_C']}°C（体感 {current['FeelsLikeC']}°C）\n"
                f"☁️ 天气：{weather_desc}\n"
                f"💧 湿度：{current['humidity']}%\n"
                f"🌬️ 风速：{current['windspeedKmph']} km/h {current['winddir16Point']}\n"
                f"👁️ 能见度：{current['visibility']} km\n"
                f"🌡️ 气压：{current['pressure']} mb\n"
                f"☀️ 紫外线：{current['uvIndex']}"
            )
            return result
    except httpx.HTTPStatusError as e:
        return f"❌ 查询失败：找不到城市「{city}」，请检查城市名是否正确"
    except Exception as e:
        return f"❌ 查询天气出错：{str(e)}"


@mcp.tool()
async def get_weather_forecast(city: str, days: int = 3) -> str:
    """获取指定城市未来几天的天气预报
    
    Args:
        city: 城市名称
        days: 预报天数，范围 1-3 天，默认 3 天
    
    Returns:
        未来几天的天气预报
    """
    # 限制天数范围
    days = max(1, min(3, days))
    
    try:
        url = f"https://wttr.in/{city}?format=j1&lang=zh"
        
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(url)
            response.raise_for_status()
            data = response.json()
            
            result = f"📅 **{city} 未来 {days} 天天气预报**\n"
            result += "━━━━━━━━━━━━━━━\n\n"
            
            for i, day in enumerate(data["weather"][:days], 1):
                date = day["date"]
                max_temp = day["maxtempC"]
                min_temp = day["mintempC"]
                sunrise = day["astronomy"][0]["sunrise"]
                sunset = day["astronomy"][0]["sunset"]
                
                # 取中午12点的数据作为白天天气
                hourly = day["hourly"][4]
                desc = "未知"
                if hourly.get("lang_zh") and len(hourly["lang_zh"]) > 0:
                    desc = hourly["lang_zh"][0]["value"]
                elif hourly.get("weatherDesc"):
                    desc = hourly["weatherDesc"][0]["value"]
                
                result += f"**第 {i} 天（{date}）**\n"
                result += f"  🌡️ 温度：{min_temp}°C ~ {max_temp}°C\n"
                result += f"  ☁️ 天气：{desc}\n"
                result += f"  🌅 日出：{sunrise}　🌇 日落：{sunset}\n\n"
            
            return result.strip()
    except Exception as e:
        return f"❌ 查询天气预报出错：{str(e)}"


@mcp.tool()
async def get_weather_summary(city: str) -> str:
    """获取指定城市的天气简报（适合快速查看）
    
    Args:
        city: 城市名称
    
    Returns:
        简短的天气信息
    """
    try:
        # 使用 wttr.in 的简洁格式
        url = f"https://wttr.in/{city}?format=3&lang=zh"
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url)
            response.raise_for_status()
            return response.text.strip()
    except Exception as e:
        return f"❌ 查询失败：{str(e)}"


@mcp.tool()
async def get_china_cities() -> str:
    """获取支持查询的中国城市列表
    
    Returns:
        包含主要城市名称的列表
    """
    cities = [
        # 华北地区
        "北京", "天津", "石家庄", "太原", "呼和浩特",
        # 东北地区
        "沈阳", "长春", "哈尔滨", "大连", "鞍山", "抚顺", "吉林", "齐齐哈尔", "大庆",
        # 华东地区
        "上海", "南京", "杭州", "合肥", "福州", "厦门", "南昌", "济南", "青岛", "烟台", "宁波", "温州", "苏州", "无锡", "常州", "徐州", "扬州", "南通", "绍兴", "金华", "台州", "嘉兴", "湖州", "芜湖", "蚌埠", "安庆", "马鞍山", "黄山", "泉州", "漳州", "莆田", "三明", "龙岩", "赣州", "九江", "景德镇", "上饶", "宜春", "吉安", "抚州", "威海", "潍坊", "淄博", "临沂", "济宁", "泰安", "枣庄", "日照", "东营", "德州", "聊城", "滨州", "菏泽",
        # 华中地区
        "武汉", "长沙", "郑州", "洛阳", "开封", "平顶山", "安阳", "新乡", "焦作", "许昌", "漯河", "三门峡", "南阳", "商丘", "信阳", "周口", "驻马店", "黄石", "十堰", "宜昌", "襄阳", "鄂州", "荆门", "孝感", "荆州", "黄冈", "咸宁", "随州", "恩施", "株洲", "湘潭", "衡阳", "邵阳", "岳阳", "常德", "张家界", "益阳", "郴州", "永州", "怀化", "娄底", "湘西",
        # 华南地区
        "广州", "深圳", "南宁", "桂林", "北海", "海口", "三亚", "东莞", "佛山", "珠海", "中山", "惠州", "汕头", "湛江", "江门", "茂名", "肇庆", "韶关", "梅州", "汕尾", "河源", "阳江", "清远", "潮州", "揭阳", "云浮", "柳州", "梧州", "贵港", "玉林", "百色", "贺州", "河池", "来宾", "崇左", "钦州", "防城港", "海口", "三亚",
        # 西南地区
        "成都", "重庆", "昆明", "贵阳", "拉萨", "绵阳", "德阳", "南充", "宜宾", "泸州", "达州", "乐山", "内江", "遂宁", "自贡", "攀枝花", "广元", "资阳", "眉山", "雅安", "广安", "巴中", "黔东南", "遵义", "安顺", "黔南", "黔西南", "六盘水", "毕节", "铜仁", "昆明", "曲靖", "玉溪", "保山", "昭通", "丽江", "普洱", "临沧", "楚雄", "红河", "文山", "西双版纳", "大理", "德宏", "怒江", "迪庆",
        # 西北地区
        "西安", "兰州", "西宁", "银川", "乌鲁木齐", "咸阳", "宝鸡", "渭南", "延安", "汉中", "榆林", "安康", "商洛", "铜川", "天水", "定西", "平凉", "庆阳", "陇南", "张掖", "武威", "酒泉", "嘉峪关", "金昌", "白银", "临夏", "甘南", "西宁", "海东", "海西", "海南", "海北", "黄南", "玉树", "果洛", "银川", "石嘴山", "吴忠", "固原", "中卫", "乌鲁木齐", "克拉玛依", "吐鲁番", "哈密", "阿克苏", "喀什", "和田", "伊犁", "塔城", "阿勒泰", "博尔塔拉", "巴音郭楞", "昌吉", "克孜勒苏", "石河子",
        # 港澳台
        "香港", "澳门", "台北", "高雄", "台中", "新北",
        # 热门旅游城市
        "丽江", "大理", "厦门", "青岛", "大连", "秦皇岛", "张家界", "凤凰古城", "黄山", "泰山", "峨眉山", "九寨沟", "西湖", "乌镇", "苏州园林", "丽江古城"
    ]
    
    # 去重并排序
    cities = sorted(list(set(cities)))
    
    result = "🇨🇳 **全国城市列表**\n"
    result += "━━━━━━━━━━━━━━━\n\n"
    result += f"共 {len(cities)} 个城市/地区\n\n"
    result += "可直接查询以下城市天气：\n\n"
    
    # 按行分组，每行10个城市
    for i in range(0, len(cities), 10):
        result += "、".join(cities[i:i+10]) + "\n"
    
    result += "\n💡 输入格式：查天气 城市名\n例如：查天气 广州"
    
    return result


@mcp.tool()
async def get_multi_city_weather(cities: str) -> str:
    """批量查询多个城市的天气
    
    Args:
        cities: 城市名称，多个用逗号分隔，如 "北京,上海,广州,深圳"
                也支持空格分隔，如 "北京 上海 广州 深圳"
    
    Returns:
        多个城市的当前天气对比
    """
    try:
        # 解析城市列表
        if "," in cities:
            city_list = [c.strip() for c in cities.split(",")]
        else:
            city_list = [c.strip() for c in cities.split()]
        
        # 限制最多查询10个城市
        city_list = city_list[:10]
        
        if not city_list:
            return "❌ 请提供至少一个城市名称"
        
        result = f"🌍 **多城市天气对比**（{len(city_list)} 个城市）\n"
        result += "━━━━━━━━━━━━━━━\n\n"
        
        errors = []
        
        async with httpx.AsyncClient(timeout=15.0) as client:
            for city in city_list:
                try:
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
                    
                    result += (
                        f"📍 **{city}**\n"
                        f"　🌡️ {current['temp_C']}°C | {weather_desc}\n"
                        f"　💧 湿度 {current['humidity']}% | 🌬️ {current['windspeedKmph']}km/h\n\n"
                    )
                except httpx.HTTPStatusError:
                    errors.append(city)
                except Exception:
                    errors.append(city)
        
        if errors:
            result += f"⚠️ 无法查询：{', '.join(errors)}"
        
        return result.strip()
    except Exception as e:
        return f"❌ 批量查询失败：{str(e)}"


# SSE 传输协议
# 使用 /messages/ 作为 POST 相对路径（挂在 /sse/ 下，最终为 /sse/messages/，仅一级 sse）
sse = SseServerTransport("/messages/")  # 相对路径，挂在 /sse/ 下，最终 POST 路径 = /sse/messages/

# 创建 SSE 处理 ASGI 应用
async def sse_app(scope, receive, send):
    """SSE 端点 ASGI 应用"""
    if scope["type"] != "http":
        await send({
            "type": "http.response.start",
            "status": 400,
            "headers": [(b"content-type", b"text/plain")],
        })
        await send({"type": "http.response.body", "body": b"Bad Request"})
        return
    
    async with sse.connect_sse(scope, receive, send) as (read_stream, write_stream):
        await mcp._mcp_server.run(
            read_stream,
            write_stream,
            mcp._mcp_server.create_initialization_options(),
        )


# 移除有问题的 handle_sse 函数
# Route 只能包装 request→response 风格的函数
# 使用 Mount 直接挂载 ASGI 应用


# CORS 中间件配置（允许企业微信跨域访问）
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
# 使用 Mount 挂载 ASGI 应用（Route 不支持 ASGI 签名）
# 路由配置：
# - /sse/: SSE 长连接端点（访问 /sse 会自动 307 重定向到 /sse/）
# - /sse/messages/: JSON-RPC POST 消息端点
# - /sse/sse/messages/: 兼容企业微信路径格式

app = Starlette(
    debug=True,
    routes=[
        # 更具体的 POST 路由放前面，/sse/ 放最后作为 SSE 通配（仅一级 sse）
        Mount("/sse/messages/", app=sse.handle_post_message),  # JSON-RPC POST 消息端点
        Mount("/sse/", app=sse_app),                           # SSE 长连接端点
    ],
    middleware=middleware,
)

if __name__ == "__main__":
    # 使用 SSE 传输协议
    # 监听 0.0.0.0:3000（允许外部访问）
    # 企业微信 MCP 插件需要 SSE 协议
    import sys
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    print("🌤️ 天气查询 MCP 服务启动中...")
    print("=" * 50)
    print("📡 传输协议: SSE")
    print("📍 监听地址: http://0.0.0.0:3000/sse")
    print("=" * 50)
    print("\n🛠️ 可用工具:")
    print("  - get_current_weather: 获取当前天气")
    print("  - get_weather_forecast: 获取天气预报")
    print("  - get_weather_summary: 天气简报")
    print("  - get_china_cities: 全国城市列表")
    print("  - get_multi_city_weather: 多城市天气对比")
    print("=" * 50)
    
    uvicorn.run(app, host="0.0.0.0", port=3000)
