# Kill old process on port 3000
$p = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess
if ($p) {
    Write-Host "[weather-mcp] Killing old PID=$p ..."
    Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
}
Write-Host "[weather-mcp] Starting server..."
Start-Process -FilePath "$PSScriptRoot\venv\Scripts\python.exe" -ArgumentList "server.py" -WorkingDirectory $PSScriptRoot -WindowStyle Normal
Write-Host "[weather-mcp] Done."
