#Requires -Version 5.1

function Get-CodexListener {
  param([int]$Port, [string]$ExecutablePath, [switch]$Fast)
  if ($Port -lt 1024 -or $Port -gt 65535) { return }
  $nativeProbe=Join-Path $PSScriptRoot '..\.build\PortOwner.exe'
  if($Fast -and (Test-Path -LiteralPath $nativeProbe)) {
    $result=& $nativeProbe $Port $ExecutablePath
    switch($LASTEXITCODE) {
      0 { return ($result | ConvertFrom-Json) }
      3 { throw '所选动画端口已被其他进程占用，未连接该进程。' }
      4 { throw '动画接口未绑定本机回环地址，已停止连接。' }
      default { throw '无法校验动画接口归属，已停止连接。' }
    }
  }
  # 本机 NetTCPIP 的 State 字段不可靠；使用监听端点的远端端口 0 与真实 PID 校验。
  $listeners = @(Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue | Where-Object {
    $_.LocalPort -eq $Port -and $_.RemotePort -eq 0 -and $_.OwningProcess -gt 0
  })
  if ($listeners.Count -eq 0) { return }
  foreach ($listener in $listeners) {
    if ($listener.LocalAddress -ne '127.0.0.1') { throw '动画接口未绑定本机回环地址，已停止连接。' }
    $owner = Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
    if (-not $owner) { return }
    if (-not $owner.Path -or $owner.Path -ine $ExecutablePath) { throw '所选动画端口已被其他进程占用，未连接该进程。请重新打开启动入口以选择新端口。' }
  }
  return $listeners[0]
}

function Get-FreeCodexPort {
  $reservation = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, 0)
  try {
    $reservation.Start()
    return $reservation.LocalEndpoint.Port
  } finally {
    $reservation.Stop()
  }
}
