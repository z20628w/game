@echo off
chcp 65001 >nul
echo ====================================
echo    Agnes AI MCP 一键调用工具
echo ====================================
echo.

:: 检查服务是否运行
netstat -an | findstr ":3001" | findstr "LISTENING" >nul
if %errorlevel% neq 0 (
    echo [警告] Agnes MCP 服务未运行!
    echo.
    echo 请先启动服务:
    echo   cd D:\my_code\我的学习\MCP\weather-mcp
    echo   D:\file_address\QClaw\v0.2.32.610\resources\python\python.exe agnes_server.py
    echo.
    pause
    exit /b
)

:: 设置URL
set "BASE_URL=http://localhost:3001"

:: 获取session_id
echo [1/4] 连接SSE获取Session ID...
for /f "tokens=*" %%a in ('curl -s -N "%BASE_URL%/sse"') do (
    echo %%a | findstr /C:"session_id" >nul
    if !errorlevel!==0 (
        for /f "tokens=2 delims== " %%b in ('echo %%a') do set "SESSION_ID=%%b"
        goto :init
    )
)

:: 如果上面没获取到，尝试另一种方式
curl -s -N "%BASE_URL%/sse" > temp_sse.txt &
timeout /t 2 /nobreak >nul
for /f "tokens=2 delims==;" %%a in ('findstr "session_id" temp_sse.txt') do set "SESSION_ID=%%a"
del temp_sse.txt 2>nul

:init
echo [2/4] 初始化连接...
curl -s -X POST "%BASE_URL%/messages/?session_id=%SESSION_ID%" -H "Content-Type: application/json" -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\",\"params\":{\"protocolVersion\":\"2024-11-05\",\"capabilities\":{},\"clientInfo\":{\"name\":\"batch\",\"version\":\"1.0\"}}}"

echo.
echo ====================================
echo    选择功能
echo ====================================
echo    1. 聊天对话
echo    2. 生成图片
echo    3. 生成视频
echo    4. 查询视频状态
echo ====================================
echo.

set /p CHOICE=请选择 (1/2/3/4): 

if "%CHOICE%"=="1" goto :chat
if "%CHOICE%"=="2" goto :image
if "%CHOICE%"=="3" goto :video
if "%CHOICE%"=="4" goto :video_status

:chat
echo.
set /p MESSAGE=请输入聊天内容: 
echo [3/4] 发送请求...
echo [4/4] 获取响应...
curl -s -X POST "%BASE_URL%/messages/?session_id=%SESSION_ID%" -H "Content-Type: application/json" -d "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"chat_completion\",\"arguments\":{\"message\":\"%MESSAGE%\"}}}"
goto :end

:image
echo.
set /p PROMPT=请输入图片描述: 
set /p SIZE=图片尺寸 (默认1024x1024): 
if "%SIZE%"=="" set SIZE=1024x1024
echo [3/4] 发送请求...
echo [4/4] 获取响应...
curl -s -X POST "%BASE_URL%/messages/?session_id=%SESSION_ID%" -H "Content-Type: application/json" -d "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"generate_image\",\"arguments\":{\"prompt\":\"%PROMPT%\",\"size\":\"%SIZE%\",\"n\":1}}}"
goto :end

:video
echo.
set /p PROMPT=请输入视频描述: 
set /p DURATION=视频时长 秒 (默认5): 
if "%DURATION%"=="" set DURATION=5
echo [3/4] 发送请求...
echo [4/4] 获取响应...
curl -s -X POST "%BASE_URL%/messages/?session_id=%SESSION_ID%" -H "Content-Type: application/json" -d "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"generate_video\",\"arguments\":{\"prompt\":\"%PROMPT%\",\"duration\":%DURATION%}}}"
goto :end

:video_status
echo.
set /p TASK_ID=请输入任务ID: 
echo [3/4] 发送请求...
echo [4/4] 获取响应...
curl -s -X POST "%BASE_URL%/messages/?session_id=%SESSION_ID%" -H "Content-Type: application/json" -d "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"check_video_status\",\"arguments\":{\"task_id\":\"%TASK_ID%\"}}}"
goto :end

:end
echo.
echo ====================================
echo    执行完成!
echo ====================================
pause
