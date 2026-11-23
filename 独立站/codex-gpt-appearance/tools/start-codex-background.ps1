#Requires -Version 5.1
param([switch]$CheckOnly)
$ErrorActionPreference='Stop'
$launchClock=[Diagnostics.Stopwatch]::StartNew()
$proxyEnvFile=Join-Path $env:USERPROFILE '.codex\.env'
if(Test-Path -LiteralPath $proxyEnvFile) {
  foreach($proxyLine in [IO.File]::ReadAllLines($proxyEnvFile)) {
    if($proxyLine -match '^\s*(HTTP_PROXY|HTTPS_PROXY|ALL_PROXY|NO_PROXY|NODE_USE_ENV_PROXY)\s*=\s*(.*?)\s*$') {
      [Environment]::SetEnvironmentVariable($matches[1],$matches[2].Trim('"',"'"),'Process')
    }
  }
}
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
. (Join-Path $PSScriptRoot 'restart-codex-host.ps1')
. (Join-Path $PSScriptRoot 'codex-port.ps1')
$package=Get-AppxPackage -Name OpenAI.Codex | Select-Object -First 1
if (-not $package -or $package.SignatureKind -ne 'Store') { throw 'Official Store Codex package not found.' }
$exe=Join-Path $package.InstallLocation 'app\ChatGPT.exe'
$node=Join-Path $package.InstallLocation 'app\resources\cua_node\bin\node.exe'
$stateRoot=Join-Path $env:LOCALAPPDATA 'OpenAI\ChatGPTFix'
$port=0
$portFile=Join-Path $stateRoot 'runtime-port.json'
$startedInjector=$false
New-Item -ItemType Directory -Path $stateRoot -Force | Out-Null
if ($CheckOnly) {
  [pscustomobject]@{exe=$exe;nodeAvailable=(Test-Path -LiteralPath $node);injectorAvailable=(Test-Path -LiteralPath (Join-Path $repo 'extension\windows-wallpaper.mjs'));portMode='automatic-loopback'} | ConvertTo-Json
  exit
}
$launchMutex=New-Object System.Threading.Mutex($false,'Local\CodexGptAppearanceLauncher')
try { $launchLock=$launchMutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $launchLock=$true }
if(-not $launchLock) { $launchMutex.Dispose(); exit 0 }
try {
  [pscustomobject]@{time=(Get-Date).ToString('o');status='starting'} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $stateRoot 'background-launch.json') -Encoding UTF8
  $listener=$null
  if(Test-Path -LiteralPath $portFile) {
    try {
      $record=Get-Content -LiteralPath $portFile -Raw | ConvertFrom-Json
      $port=[int]$record.port
      $listener=Get-CodexListener -Port $port -ExecutablePath $exe -Fast
    } catch { $listener=$null }
  }
  if (-not $listener) {
    $running=Get-Process -Name ChatGPT -ErrorAction SilentlyContinue | Where-Object {$_.Path -ieq $exe}
    if ($running) {
      if (-not (Request-CodexHostRestart -ExecutablePath $exe)) {
        [pscustomobject]@{time=(Get-Date).ToString('o');status='cancelled';reason='user-kept-current-session'} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $stateRoot 'background-launch.json') -Encoding UTF8
        exit 0
      }
    }
    $port=Get-FreeCodexPort
    $profile=Join-Path $env:APPDATA 'Codex\web\Codex'
    $readyPath=Join-Path $stateRoot ('startup-ready-'+[Guid]::NewGuid().ToString('N')+'.txt')
    $existingInjectors=Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object {$_.CommandLine -like ('*'+$repo+'\extension\windows-wallpaper.mjs*')}
    foreach($oldInjector in $existingInjectors) {Stop-Process -Id $oldInjector.ProcessId -ErrorAction SilentlyContinue}
    $appArguments='--remote-debugging-address=127.0.0.1 --remote-debugging-port='+$port+' --user-data-dir="'+$profile+'"'
    $gate=Join-Path $repo '.build\StartupGate.exe'
    if(-not(Test-Path -LiteralPath $gate)) {throw 'Run tools/install-windows.ps1 before launching.'}
    $gateArguments='"'+$exe+'" "'+$appArguments.Replace('"','\"')+'" "'+$readyPath+'"'
    Start-Process -FilePath $gate -ArgumentList $gateArguments -WindowStyle Hidden | Out-Null
    $verified=$false
    for($attempt=0;$attempt -lt 60;$attempt++) {
      Start-Sleep -Milliseconds 500
      $listener=Get-CodexListener -Port $port -ExecutablePath $exe -Fast
      if ($listener) {
        $verified=$true;break
      }
    }
    if (-not $verified) { throw 'Codex 未开放页面背景接口，背景未应用。官方安装包未修改。' }
    [pscustomobject]@{pid=@($listener)[0].OwningProcess;logRoot=(Join-Path $env:LOCALAPPDATA 'Codex\Logs')} | ConvertTo-Json -Compress | Set-Content -LiteralPath ($readyPath+'.host.json') -Encoding UTF8
    # 只有端口归属校验通过，才启动页面连接程序。
    Start-Process -FilePath $node -ArgumentList ('"'+(Join-Path $repo 'extension\windows-wallpaper.mjs')+'" '+$port+' "'+(Join-Path $stateRoot 'wallpaper-state.json')+'" "'+$readyPath+'"') -WindowStyle Hidden -RedirectStandardError (Join-Path $stateRoot 'wallpaper-error.log') | Out-Null
    $startedInjector=$true
  }
  [pscustomobject]@{port=$port;pid=$listener.OwningProcess;time=(Get-Date).ToString('o')} | ConvertTo-Json -Compress | Set-Content -LiteralPath $portFile -Encoding UTF8
  if(-not $startedInjector) {
    & $node (Join-Path $repo 'tools\open-existing-codex.mjs') $portFile $exe (Join-Path $env:APPDATA 'Codex\web\Codex')
    if($LASTEXITCODE -ne 0) {throw '重新显示窗口失败，请查看启动日志。'}
  }
  $alreadyRunning=Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object {$_.CommandLine -like ('*'+$repo+'\extension\windows-wallpaper.mjs*')}
  if (-not $alreadyRunning -and -not $startedInjector) {
    Start-Process -FilePath $node -ArgumentList ('"'+(Join-Path $repo 'extension\windows-wallpaper.mjs')+'" '+$port+' "'+(Join-Path $stateRoot 'wallpaper-state.json')+'"') -WindowStyle Hidden -RedirectStandardError (Join-Path $stateRoot 'wallpaper-error.log') | Out-Null
  }
  [pscustomobject]@{time=(Get-Date).ToString('o');status='connected';port=$port;pid=$listener.OwningProcess;elapsedMs=$launchClock.ElapsedMilliseconds} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $stateRoot 'background-launch.json') -Encoding UTF8
} catch {
  [pscustomobject]@{time=(Get-Date).ToString('o');status='failed';error=$_.Exception.Message} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $stateRoot 'background-launch.json') -Encoding UTF8
  Add-Type -AssemblyName System.Windows.Forms
  [void][System.Windows.Forms.MessageBox]::Show($_.Exception.Message,'Codex 背景启动')
  exit 1
} finally {
  $launchMutex.ReleaseMutex()
  $launchMutex.Dispose()
}
