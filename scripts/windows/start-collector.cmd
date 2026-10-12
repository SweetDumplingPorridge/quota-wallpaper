@echo off
cd /d "%~dp0..\.."
node collector/main.js --serve
pause
