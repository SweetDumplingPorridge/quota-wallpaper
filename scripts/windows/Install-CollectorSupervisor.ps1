param([int]$Minutes = 5, [string]$OutputFile)
$ErrorActionPreference = 'Stop'
if ($Minutes -lt 1 -or $Minutes -gt 1440) { throw 'Minutes must be 1..1440' }
$quotaProject = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
# wscript is a GUI host: unlike a direct console executable it cannot flash a console.
$quotaShell = Join-Path $env:WINDIR 'System32/wscript.exe'
$quotaArgs = '//B //NoLogo "' + (Join-Path $PSScriptRoot 'Launch-CollectorHidden.vbs') + '"'
if ($OutputFile) { $quotaArgs += ' "' + [IO.Path]::GetFullPath($OutputFile) + '"' }
$quotaAction = New-ScheduledTaskAction -Execute $quotaShell -Argument $quotaArgs -WorkingDirectory $quotaProject
$quotaUser = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$quotaPrincipal = New-ScheduledTaskPrincipal -UserId $quotaUser -LogonType Interactive -RunLevel Limited
$quotaLogin = New-ScheduledTaskTrigger -AtLogOn -User $quotaUser
$quotaPeriodic = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes $Minutes)
$quotaSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 2)
if (Get-ScheduledTask -TaskName 'QuotaWallpaperCollector' -ErrorAction SilentlyContinue) {
    throw 'Remove the snapshot-only QuotaWallpaperCollector task before enabling the supervisor.'
}
Register-ScheduledTask -TaskName 'QuotaWallpaperSupervisor' -Action $quotaAction -Trigger @($quotaLogin, $quotaPeriodic) -Principal $quotaPrincipal -Settings $quotaSettings -Description 'Start the Quota Wallpaper collector at sign-in and recover it if it exits.' -Force | Out-Null
Start-ScheduledTask -TaskName 'QuotaWallpaperSupervisor'
Write-Host "Collector supervisor installed: sign-in plus a liveness check every $Minutes minutes."
