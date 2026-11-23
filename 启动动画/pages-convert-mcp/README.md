# Pages 转换 MCP 服务

将 Pages 转为 PDF 或可编辑 DOCX。企业微信负责对话，MCP 服务接收任务并调用自己设备上的 LibreOffice；转换不调用在线转换网站或外部 AI API。

支持 Streamable HTTP `/mcp` 与 SSE `/sse`，共用同一个程序。SSE 还需要反向代理转发 `/messages/`。提供后台任务、上传入口、任务查询、表格检查、限时下载和过期清理。

## 当前使用边界

- 这是可独立运行的 MCP 服务，不是上传到企业微信后由腾讯托管执行的代码包。
- 企业微信端必须能够访问服务的 HTTPS 地址。仅在电脑上启动 `127.0.0.1` 服务不能直接让企微云端访问。
- 接口能接收真实的 HTTPS 附件地址或已上传的 `file_id`。企微是否把聊天附件下载地址交给 MCP 工具、是否需要解密、下载凭证如何传递，必须用实际账号联调确认。不要把“协议连接成功”当成“聊天文件已自动打通”。如果平台不提供可下载附件，需要增加该平台的附件适配，或使用上传入口；不要让模型编造文件 URL。
- 自动检查包含格式解析、页数和正文匹配，不等同于人工版式复核。所有完成任务都明确返回 `review_required`。固定行高可修复，复杂合并须有证据并明确指定，不能保证所有 Pages 文档无损还原。
- 一个部署和密钥对应一个共享使用范围；不是按企业微信用户隔离的多租户系统。

## Windows 本地启动

首次准备需要联网下载依赖；准备好后，转换只使用本地程序。

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

安装 LibreOffice，或把已验证的官方组件解压到 `.runtime/lo`，程序会自动查找 `program/soffice.com`。也可在 `.env` 设置 `SOFFICE_PATH`。

```powershell
.\Start.ps1
```

首次启动会从 `.env.example` 创建 `.env` 并生成随机密钥。该文件包含密钥，不提交到版本库、不分享截图。当前电脑已准备好 `.venv` 与 `.runtime/lo`，可直接运行启动脚本；移动项目文件夹后请重建虚拟环境。

默认仅监听本机 `127.0.0.1:8765`，不会自动公开端口或发布服务。修改配置后重启。只运行一个进程/实例，不能给同一数据目录配置多 worker。

## 部署到自己的服务器

也可以使用附带 Docker 配置：复制 `.env.example` 为 `.env`，填入至少 32 字符的随机 `MCP_API_KEY`，把 `PUBLIC_BASE_URL` 设置为自己的 HTTPS 服务地址，然后运行 `docker compose up -d --build`。

镜像构建时安装转换引擎和中文字体，运行时不再下载这些组件。服务器可以由你自行管理，不需要接第三方转换平台。Docker 配置尚需在目标服务器上验证。

为 `127.0.0.1:8765` 配置 HTTPS 反向代理。代理所有路径，保留 `Host` 与 `Authorization`，关闭 SSE 响应缓冲并适当延长连接超时；上传限制不少于 `MAX_FILE_MB`。下载链接是短期访问凭证，代理日志不要记录其查询参数。

## 企业微信 MCP 插件填写

| 项目 | 填写内容 |
| --- | --- |
| 名称 | Pages 文档转换 |
| Streamable HTTP 地址 | `https://你的域名/mcp` |
| SSE 地址 | `https://你的域名/sse` |
| 鉴权请求头 | `Authorization: Bearer <MCP_API_KEY>` |

按实际页面选择一种连接方式，不必把同一服务添加两次。如果页面没有请求头鉴权配置，应先确认它的认证方式，不要关闭服务鉴权直接暴露到公网。

可用工具：

1. `conversion_capabilities`：检查本地引擎、支持格式、附件域名与上传地址。
2. `submit_conversion`：提交 `file_url` 或 `file_id`，格式 `pdf`/`docx`；立即返回任务编号。
3. `conversion_status`：查询状态；完成时返回下载链接、页数与版式复核提示。
4. `inspect_converted_tables`：读取表格文字，辅助复核。

机器人指令示例：收到用户转换请求后，使用真实附件地址提交任务，按返回建议间隔查询，不重复提交。完成后提供下载链接，并转述检查提示。没有可下载附件时明确说明缺少文件输入，不编造地址。未经过人工逐页检查，不能宣称无损转换。

## 文件输入与网络边界

`SOURCE_HOSTS` 默认为空，禁用所有 URL 下载。实际取得企微附件下载地址后，管理员只添加该地址的完整域名；不支持通配符，不自动放行全部域名。只允许 HTTPS 和公网地址，不跟随重定向，也不将 MCP 密钥转发给附件站点。请仅加入受信任且不会解析到内部地址的附件域名，生产环境可进一步用出口规则限制到这些目标。

也可直接上传原始 Pages 二进制，上传接口不主动访问网络：

```powershell
# 密钥通过环境变量传入；请求体是文件原始二进制，不是 multipart。
curl.exe -X POST 'http://127.0.0.1:8765/files' `
  -H "Authorization: Bearer $env:MCP_API_KEY" `
  -H 'Content-Type: application/octet-stream' --data-binary '@文档.pages'
```

返回 `file_id` 后，让 MCP 使用该编号转换。仅提供 `C:\...` 路径不能让远程服务读取用户电脑。

运行时网络仅用于企业微信/MCP 调用、明确允许的附件获取和结果下载。转换模块没有 AI 客户端和在线转换接口。若要求进程级禁止外连，应在部署侧为 LibreOffice 或转换容器设置出口规则；代码层没有自动修改系统防火墙。

任务和原文件默认保留 24 小时，每 5 分钟清理过期内容。下载链接最多有效 1 小时，任务未过期时重新查询可获取新链接。重启会将中断任务标记为失败，避免永久等待。每次最多 2 个任务同时转换、6 个任务排队或执行。

## 验证

```powershell
.\.venv\Scripts\python.exe -X utf8 -m unittest discover -s tests -v
.\.venv\Scripts\python.exe -X utf8 tests\smoke.py --source '待测试.pages'
```

冒烟测试启动临时本机服务，检查 HTTP/SSE、鉴权、真实文件上传、PDF/DOCX 转换及下载，然后关闭测试进程。临时端口和密钥随机生成，不打印密钥。测试输出保存在 `.runtime/smoke`，不打入分发包。
