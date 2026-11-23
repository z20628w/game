#Requires -Version 5.1

function Get-CodexHostProcesses {
  param([Parameter(Mandatory=$true)][string]$ExecutablePath)
  # 只匹配已验证的官方程序完整路径，避免关闭其他应用或命令行任务。
  @(Get-Process -Name ChatGPT -ErrorAction SilentlyContinue | Where-Object { $_.Path -ieq $ExecutablePath })
}

function Confirm-CodexHostRestart {
  Add-Type -AssemblyName System.Windows.Forms
  $message = "Codex 目前仍在后台运行，启用动画需要重新启动。`r`n`r`n重启会中断正在运行的任务，尚未发送的输入也可能丢失。请先保存工作。`r`n`r`n保存完成后，点击「是」自动关闭并重新启动；点击「否」保持当前状态。"
  $choice = [System.Windows.Forms.MessageBox]::Show($message, 'Codex 动画 · 保存后重启', [System.Windows.Forms.MessageBoxButtons]::YesNo, [System.Windows.Forms.MessageBoxIcon]::Question, [System.Windows.Forms.MessageBoxDefaultButton]::Button2)
  return ($choice -eq [System.Windows.Forms.DialogResult]::Yes)
}

function Request-CodexHostRestart {
  param([Parameter(Mandatory=$true)][string]$ExecutablePath)
  $processes = @(Get-CodexHostProcesses -ExecutablePath $ExecutablePath)
  if ($processes.Count -eq 0) { return $true }
  if (-not (Confirm-CodexHostRestart)) { return $false }

  foreach ($process in $processes) {
    if ($process.MainWindowHandle -ne [IntPtr]::Zero) { [void]$process.CloseMainWindow() }
  }
  Start-Sleep -Milliseconds 1500
  # 部分版本将关闭窗口解释为最小化到托盘；用户确认后才结束这些残留实例。
  foreach ($process in @(Get-CodexHostProcesses -ExecutablePath $ExecutablePath)) {
    try { $process.Kill() } catch {
      if (-not $process.HasExited) { throw }
    }
  }
  $deadline = [DateTime]::UtcNow.AddSeconds(15)
  while (@(Get-CodexHostProcesses -ExecutablePath $ExecutablePath).Count -gt 0) {
    if ([DateTime]::UtcNow -gt $deadline) { throw 'Codex 未能完全退出，请保存工作后从托盘退出，再重试。' }
    Start-Sleep -Milliseconds 250
  }
  Start-Sleep -Milliseconds 750
  return $true
}
