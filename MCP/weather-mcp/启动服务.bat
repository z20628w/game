@echo off
chcp 65001 >nul
echo ========================================
echo   天气查询 MCP 服务启动脚本
echo ========================================
echo.

echo [1/3] 检查 Python 环境...
python --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Python 未安装，请先安装 Python 3.8+
    pause
    exit /b 1
)
echo ✅ Python 已安装

echo.
echo [2/3] 安装依赖包...
pip install -r requirements.txt
if errorlevel 1 (
    echo ❌ 依赖安装失败
    pause
    exit /b 1
)
echo ✅ 依赖安装完成

echo.
echo [3/3] 启动 MCP 服务...
echo.
python server.py

pause
