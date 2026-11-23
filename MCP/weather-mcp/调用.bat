@echo off
chcp 65001 >nul
cd /d "%~dp0"

:menu
cls
echo ========================================
echo    🌤️ 天气 MCP 客户端
echo ========================================
echo.
echo  [1] 查询当前天气
echo  [2] 查询天气预报
echo  [3] 天气简报
echo  [4] 全国城市列表
echo  [5] 多城市对比
echo  [0] 退出
echo.
echo ========================================
set /p choice="请选择: "

if "%choice%"=="0" exit
if "%choice%"=="1" goto current
if "%choice%"=="2" goto forecast
if "%choice%"=="3" goto summary
if "%choice%"=="4" goto cities
if "%choice%"=="5" goto multi
goto menu

:current
set /p city="请输入城市名: "
.\venv\Scripts\python.exe call.py get_current_weather "{""city"":""%city%""}"
pause
goto menu

:forecast
set /p city="请输入城市名: "
set /p days="请输入天数(1-10): "
.\venv\Scripts\python.exe call.py get_weather_forecast "{""city"":""%city%"",""days"":%days%}"
pause
goto menu

:summary
set /p city="请输入城市名: "
.\venv\Scripts\python.exe call.py get_weather_summary "{""city"":""%city%""}"
pause
goto menu

:cities
.\venv\Scripts\python.exe call.py get_china_cities "{}"
pause
goto menu

:multi
set /p cities="请输入城市(逗号分隔): "
.\venv\Scripts\python.exe call.py get_multi_city_weather "{""cities"":""%cities%""}"
pause
goto menu
