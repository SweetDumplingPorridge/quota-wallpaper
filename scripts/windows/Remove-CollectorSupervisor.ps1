$ErrorActionPreference = 'Stop'
Unregister-ScheduledTask -TaskName 'QuotaWallpaperSupervisor' -Confirm:$false -ErrorAction SilentlyContinue
Write-Host 'Removed QuotaWallpaperSupervisor. The existing collector is left running.'
