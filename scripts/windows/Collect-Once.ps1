param([string]$OutputFile)
$ErrorActionPreference = 'Stop'
$quotaProject = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$quotaPrivate = Join-Path $env:USERPROFILE '.quota-wallpaper'
New-Item -ItemType Directory -Path $quotaPrivate -Force | Out-Null
$quotaNode = (Get-Command node -ErrorAction Stop).Source
$quotaArguments = '"' + (Join-Path $quotaProject 'collector/main.js') + '" --once'
if ($OutputFile) { $quotaArguments += ' --output "' + [IO.Path]::GetFullPath($OutputFile) + '"' }
$quotaProcess = Start-Process -FilePath $quotaNode -ArgumentList $quotaArguments -WorkingDirectory $quotaProject -WindowStyle Hidden -RedirectStandardOutput (Join-Path $quotaPrivate 'once.stdout.log') -RedirectStandardError (Join-Path $quotaPrivate 'once.stderr.log') -Wait -PassThru
exit $quotaProcess.ExitCode
