$ErrorActionPreference = 'Stop'
Unregister-ScheduledTask -TaskName 'QuotaWallpaperCollector' -Confirm:$false -ErrorAction SilentlyContinue
Write-Host '已移除 QuotaWallpaperCollector 计划任务。'
