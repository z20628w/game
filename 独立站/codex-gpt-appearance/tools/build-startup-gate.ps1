#Requires -Version 5.1
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$build=Join-Path $repo '.build'
New-Item -ItemType Directory -Path $build -Force | Out-Null
$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if(-not(Test-Path -LiteralPath $compiler)) {throw '.NET Framework C# compiler not found.'}
& $compiler /nologo /target:winexe /reference:System.Windows.Forms.dll /reference:System.Drawing.dll ('/out:'+(Join-Path $build 'StartupGate.exe')) (Join-Path $repo 'windows\StartupGate.cs')
if($LASTEXITCODE -ne 0) {throw 'Startup gate compilation failed.'}
Write-Output 'StartupGate built successfully.'
& $compiler /nologo /target:exe ('/out:'+(Join-Path $build 'WindowActivator.exe')) (Join-Path $repo 'windows\WindowActivator.cs')
if($LASTEXITCODE -ne 0) {throw 'Window activator compilation failed.'}
Write-Output 'WindowActivator built successfully.'
& $compiler /nologo /target:exe ('/out:'+(Join-Path $build 'PortOwner.exe')) (Join-Path $repo 'windows\PortOwner.cs')
if($LASTEXITCODE -ne 0) {throw 'Port owner compilation failed.'}
Write-Output 'PortOwner built successfully.'
