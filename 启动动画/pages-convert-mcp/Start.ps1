$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$pythonPath = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $pythonPath)) {
    throw '请先执行 python -m venv .venv，再用 .venv\Scripts\python.exe -m pip install -r requirements.txt 安装依赖。'
}
if (-not (Test-Path -LiteralPath '.env')) {
    $secret = & $pythonPath -c 'import secrets; print(secrets.token_urlsafe(36))'
    $settings = [IO.File]::ReadAllText((Join-Path $PSScriptRoot '.env.example'))
    $settings = $settings.Replace('MCP_API_KEY=', ('MCP_API_KEY=' + $secret))
    [IO.File]::WriteAllText((Join-Path $PSScriptRoot '.env'), $settings, [Text.UTF8Encoding]::new($false))
    Write-Output '已生成本地 .env 配置；接入密钥保存在该文件中。'
}
& $pythonPath -X utf8 server.py
