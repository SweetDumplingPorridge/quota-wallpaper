param([string]$OutputFile, [int]$Port = 18765)
$ErrorActionPreference = 'Stop'
$quotaProject = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$quotaPrivate = Join-Path $env:USERPROFILE '.quota-wallpaper'
New-Item -ItemType Directory -Path $quotaPrivate -Force | Out-Null
$quotaLock = Join-Path $quotaPrivate 'collector.lock'
if (Test-Path -LiteralPath $quotaLock) {
  $quotaExistingId = 0
  [void][int]::TryParse((Get-Content -LiteralPath $quotaLock -Raw).Trim(), [ref]$quotaExistingId)
  if ($quotaExistingId -gt 0) {
    $quotaExisting = Get-CimInstance Win32_Process -Filter "ProcessId=$quotaExistingId"
    if ($quotaExisting -and $quotaExisting.CommandLine -match 'collector[/\\]main\.js') { Write-Host '采集器已运行，未创建第二个实例。'; exit }
  }
}
$quotaNode = (Get-Command node -ErrorAction Stop).Source
$quotaArguments = '"' + (Join-Path $quotaProject 'collector/main.js') + '" --serve --port ' + $Port
if ($OutputFile) { $quotaArguments += ' --output "' + [IO.Path]::GetFullPath($OutputFile) + '"' }
$quotaProcess = Start-Process -FilePath $quotaNode -ArgumentList $quotaArguments -WorkingDirectory $quotaProject -WindowStyle Hidden -RedirectStandardOutput (Join-Path $quotaPrivate 'stdout.log') -RedirectStandardError (Join-Path $quotaPrivate 'stderr.log') -PassThru
Start-Sleep -Milliseconds 900
$quotaProcess.Refresh()
if ($quotaProcess.HasExited) { throw '采集器启动失败；请查看 stderr.log。已有 PID 记录没有修改。' }
$quotaProcess.Id | Set-Content -LiteralPath (Join-Path $quotaPrivate 'background.pid')
Write-Host "采集器已后台启动。管理链接位于 $quotaPrivate/stdout.log。"
