$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'codex-port.ps1')
$package=Get-AppxPackage -Name OpenAI.Codex | Select-Object -First 1
$node=Join-Path $package.InstallLocation 'app\resources\cua_node\bin\node.exe'
try {
  $portFile=Join-Path $env:LOCALAPPDATA 'OpenAI\ChatGPTFix\runtime-port.json'
  if(-not(Test-Path -LiteralPath $portFile)) {throw '请先从桌面 Codex Animation 启动，再打开图片设置。'}
  $record=Get-Content -LiteralPath $portFile -Raw | ConvertFrom-Json
  $listener=Get-CodexListener -Port ([int]$record.port) -ExecutablePath (Join-Path $package.InstallLocation 'app\ChatGPT.exe')
  if(-not $listener) {throw '动画入口当前未运行，请先打开桌面 Codex Animation。'}
  & $node (Join-Path $PSScriptRoot 'open-codex-settings.mjs') ([string]$record.port)
  if($LASTEXITCODE -ne 0) {throw '未能打开图片设置，请重新从动画入口启动。'}
} catch {
  Add-Type -AssemblyName System.Windows.Forms
  [void][System.Windows.Forms.MessageBox]::Show($_.Exception.Message,'Codex 图片设置')
  exit 1
}
