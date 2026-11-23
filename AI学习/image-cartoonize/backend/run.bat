@echo off
REM Activates a local venv if present, then starts the FastAPI server.
setlocal
cd /d %~dp0

if exist .venv\Scripts\activate.bat (
    call .venv\Scripts\activate.bat
)

python main.py
