# Kill old process on port 3001
$p = Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess
if ($p) {
    Write-Host "[agnes-mcp] Killing old PID=$p ..."
    Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
}
Write-Host "[agnes-mcp] Starting server..."
Start-Process -FilePath "$PSScriptRoot\venv\Scripts\python.exe" -ArgumentList "server.py" -WorkingDirectory $PSScriptRoot -WindowStyle Normal
Write-Host "[agnes-mcp] Done."
