$ErrorActionPreference = 'Stop'
$quotaPidFile = Join-Path $env:USERPROFILE '.quota-wallpaper/background.pid'
if (!(Test-Path -LiteralPath $quotaPidFile)) { Write-Host '没有后台 PID 记录。'; exit }
$quotaPidValue = [int](Get-Content -LiteralPath $quotaPidFile)
$quotaProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$quotaPidValue"
if ($quotaProcess -and $quotaProcess.Name -eq 'node.exe' -and $quotaProcess.CommandLine -match 'collector[/\\]main\.js') { & taskkill.exe /PID $quotaPidValue /T /F | Out-Null; Write-Host '采集器及其子进程已停止。' }
else { Write-Host '记录的进程不是采集器，未停止其他进程。' }
Remove-Item -LiteralPath $quotaPidFile -ErrorAction SilentlyContinue
