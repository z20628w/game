#Requires -Version 5.1
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'codex-port.ps1')
function Assert-PortTest { param([bool]$Condition,[string]$Message) if(-not $Condition){throw $Message} }

# 真实回环监听验证：只创建本测试进程的临时端口，不访问 Codex。
$testPort=Get-FreeCodexPort
$testListener=New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback,$testPort)
try {
  $testListener.Start()
  $testPath=(Get-Process -Id $PID).Path
  $actual=Get-CodexListener -Port $testPort -ExecutablePath $testPath
  Assert-PortTest ($actual.OwningProcess -eq $PID) 'Live listener owner was not verified'
  $fast=Get-CodexListener -Port $testPort -ExecutablePath $testPath -Fast
  Assert-PortTest ($fast.OwningProcess -eq $PID) 'Fast listener owner was not verified'
  $blocked=$false
  try { Get-CodexListener -Port $testPort -ExecutablePath 'C:\Other\ChatGPT.exe' -Fast | Out-Null } catch {$blocked=$true}
  Assert-PortTest $blocked 'Fast probe must reject a foreign owner'
  Assert-PortTest ((Get-FreeCodexPort) -ne $testPort) 'Selected an already listening port'
  Write-Output 'PASS: real loopback listener ownership and free-port selection'
} finally { $testListener.Stop() }
Assert-PortTest ($null -eq (Get-CodexListener -Port $testPort -ExecutablePath $testPath -Fast)) 'Fast probe must reject a closed port'
$publicListener=New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Any,0)
try {
  $publicListener.Start()
  $blocked=$false
  try { Get-CodexListener -Port $publicListener.LocalEndpoint.Port -ExecutablePath $testPath -Fast | Out-Null } catch {$blocked=$true}
  Assert-PortTest $blocked 'Fast probe must reject a public listener'
} finally { $publicListener.Stop() }
Write-Output 'PASS: native ownership, closed-port and public-listener rejection'

# 以下模拟系统返回的残留记录，防止 PID 0 再次触发占用错误。
function Get-NetTCPConnection {
  [CmdletBinding()]param($State,$LocalPort)
  $script:rows
}
function Get-Process {
  [CmdletBinding()]param($Id)
  [pscustomobject]@{Path=$script:ownerPath}
}
$script:ownerPath='C:\Official\ChatGPT.exe'
$script:rows=@([pscustomobject]@{State='Listen';LocalAddress='127.0.0.1';LocalPort=19341;RemotePort=0;OwningProcess=0})
Assert-PortTest ($null -eq (Get-CodexListener -Port 19341 -ExecutablePath $script:ownerPath)) 'PID 0 must be treated as unverified, not another owner'
$script:rows+= [pscustomobject]@{State=$null;LocalAddress='127.0.0.1';LocalPort=19341;RemotePort=0;OwningProcess=123}
Assert-PortTest ((Get-CodexListener -Port 19341 -ExecutablePath $script:ownerPath).OwningProcess -eq 123) 'Real owner must remain verifiable alongside stale entries'
$blocked=$false
try { Get-CodexListener -Port 19341 -ExecutablePath 'C:\Other\ChatGPT.exe' | Out-Null } catch {$blocked=$true}
Assert-PortTest $blocked 'Foreign owner must be blocked'
$script:rows[1].LocalAddress='0.0.0.0'
$blocked=$false
try { Get-CodexListener -Port 19341 -ExecutablePath $script:ownerPath | Out-Null } catch {$blocked=$true}
Assert-PortTest $blocked 'Non-loopback listener must be blocked'
Write-Output 'PASS: PID 0 residue, mixed records, foreign owner rejection, loopback enforcement'
