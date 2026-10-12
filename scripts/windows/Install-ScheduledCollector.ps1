param([int]$Minutes = 5, [string]$OutputFile)
$ErrorActionPreference = 'Stop'
if ($Minutes -lt 1 -or $Minutes -gt 1440) { throw 'Minutes must be 1..1440' }
$quotaProject = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$quotaShell = (Get-Command pwsh -ErrorAction SilentlyContinue).Source
if (!$quotaShell) { $quotaShell = (Get-Command powershell -ErrorAction Stop).Source }
$quotaArgs = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + (Join-Path $PSScriptRoot 'Collect-Once.ps1') + '"'
if ($OutputFile) { $quotaArgs += ' -OutputFile "' + [IO.Path]::GetFullPath($OutputFile) + '"' }
$quotaAction = New-ScheduledTaskAction -Execute $quotaShell -Argument $quotaArgs -WorkingDirectory $quotaProject
$quotaTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes $Minutes)
$quotaTaskSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 4)
Register-ScheduledTask -TaskName 'QuotaWallpaperCollector' -Action $quotaAction -Trigger $quotaTrigger -Settings $quotaTaskSettings -Description 'Read local quota and wallet snapshots for Quota Wallpaper.' -Force | Out-Null
Write-Host "已安装每 $Minutes 分钟运行的用户采集任务。不要同时运行常驻采集器。"
