#Requires -Version 5.1
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'restart-codex-host.ps1')

# 完全模拟进程和确认框；测试绝不访问或终止真实应用进程。
$script:fakeProcesses = @()
$script:approved = $false
$script:confirmations = 0
function Get-Process {
  [CmdletBinding()] param([string]$Name)
  @($script:fakeProcesses | Where-Object { -not $_.HasExited })
}
function Start-Sleep { param([int]$Milliseconds) }
function Confirm-CodexHostRestart {
  $script:confirmations++
  return $script:approved
}
function Assert-True { param([bool]$Value, [string]$Message) if (-not $Value) { throw $Message } }
function New-FakeProcess {
  param([string]$Path)
  $fake = [pscustomobject]@{Path=$Path; MainWindowHandle=[IntPtr]1; HasExited=$false; Closed=$false; Killed=$false}
  $fake | Add-Member ScriptMethod CloseMainWindow { $this.Closed=$true; return $true }
  $fake | Add-Member ScriptMethod Kill { $this.Killed=$true; $this.HasExited=$true }
  return $fake
}
$official = 'C:\TestOfficial\ChatGPT.exe'
Assert-True (Request-CodexHostRestart -ExecutablePath $official) 'Empty host should proceed'
Assert-True ($script:confirmations -eq 0) 'Empty host must not prompt'

$owned = New-FakeProcess $official
$unrelated = New-FakeProcess 'C:\Other\ChatGPT.exe'
$script:fakeProcesses = @($owned,$unrelated)
Assert-True (-not (Request-CodexHostRestart -ExecutablePath $official)) 'Cancelled restart must stop'
Assert-True (-not $owned.Closed -and -not $owned.Killed) 'Cancel must preserve host'

$script:approved = $true
Assert-True (Request-CodexHostRestart -ExecutablePath $official) 'Approved restart should proceed'
Assert-True ($owned.Closed -and $owned.Killed) 'Tray-resident host should exit after confirmation'
Assert-True (-not $unrelated.Closed -and -not $unrelated.Killed) 'Other paths must remain untouched'
Write-Output 'PASS: no host, cancel, confirmed tray exit, unrelated process isolation'
