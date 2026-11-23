# 天气查询 MCP 服务

适用于企业微信智能机器人的天气查询 MCP 服务。

## 📁 项目结构

```
weather-mcp/
├── server.py          # MCP 服务主文件
├── requirements.txt   # Python 依赖
├── 启动服务.bat       # Windows 启动脚本
└── README.md          # 本说明文档
```

## 🚀 快速开始

### 1. 安装依赖

```bash
pip install -r requirements.txt
```

或者直接双击 `启动服务.bat`

### 2. 启动服务

```bash
python server.py
```

服务启动后会显示：
```
🚀 启动天气查询 MCP 服务...
📡 传输协议: SSE
🌐 监听地址: http://0.0.0.0:3000/sse
```

### 3. 内网穿透（让企业微信能访问）

服务只在本地监听，需要用内网穿透工具暴露到公网。

#### 方案 A：ngrok（最简单）

```bash
ngrok http 3000
```

复制生成的 HTTPS 地址，例如：`https://xxxx.ngrok-free.app`

#### 方案 B：Cloudflare Tunnel（免费+固定域名）

```bash
cloudflared tunnel --url http://localhost:3000
```

复制生成的 `https://xxxxx.trycloudflare.com` 地址。

### 4. 配置企业微信智能机器人

在企业微信管理后台 → 智能机器人 → MCP 插件：

| 字段 | 填写内容 | 示例 |
|------|----------|------|
| 插件名称 | 天气查询助手 | 天气查询助手 |
| 插件描述 | 查询全球城市天气 | 查询全球城市天气 |
| **插件URL** | **https://你的域名/sse** | `https://xxxx.ngrok-free.app/sse` |
| 请求头 | （可留空） | - |
| 授权方式 | 无 / Service token | - |
| **传输协议** | **SSE**（默认） | SSE |
| 可使用的范围 | 选择机器人 | - |

## 🛠️ 可用工具

### 1. `get_current_weather`
获取指定城市的当前天气

**参数**：
- `city`（必填）：城市名称

**示例**：`get_current_weather("北京")`

### 2. `get_weather_forecast`
获取未来几天的天气预报

**参数**：
- `city`（必填）：城市名称
- `days`（可选）：天数，1-3，默认 3

**示例**：`get_weather_forecast("上海", 2)`

### 3. `get_weather_summary`
获取天气简报（快速版）

**参数**：
- `city`（必填）：城市名称

**示例**：`get_weather_summary("广州")`

## 💬 在企业微信中使用

配置好 MCP 插件后，直接在企业微信中对机器人说：

- "北京今天天气怎么样"
- "深圳未来3天天气"
- "上海天气"

机器人会自动调用对应的工具查询并返回结果。

## 🔧 常见问题

### Q1: 企业微信连接不到服务？

检查：
1. 本地服务是否启动（`http://localhost:3000`）
2. 内网穿透是否生效（浏览器访问穿透地址）
3. URL 是否包含 `/sse` 后缀
4. 防火墙是否放行 3000 端口

### Q2: 查询失败？

wttr.in 是免费服务，可能有访问限制。检查：
1. 网络是否能访问 wttr.in
2. 城市名是否正确（支持中英文）

### Q3: 想要更稳定的天气数据？

可以替换为：
- 和风天气：https://www.qweather.com/
- 心知天气：https://www.seniverse.com/
- OpenWeatherMap：https://openweathermap.org/

## 📝 注意事项

- 企业微信 MCP 插件**必须使用 SSE 协议**
- URL 必须以 `/sse` 结尾
- 服务需要**公网可访问**（必须做内网穿透）
- 免费版 ngrok 域名会变化，建议用 Cloudflare Tunnel 或部署到云服务器
