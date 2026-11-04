@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
set "PORT=4000"

echo 正在查找占用端口 !PORT! 的服务进程...
set "FOUND=0"
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /r /c:":!PORT! .*LISTENING"') do (
  set "PID=%%P"
  if not "!PID!"=="0" (
    echo 结束进程 PID=!PID!
    taskkill /f /pid !PID! >nul 2>nul
    set "FOUND=1"
  )
)

if "!FOUND!"=="0" echo 未发现运行中的服务(可能已停止)。
timeout /t 3 /nobreak >nul
endlocal
