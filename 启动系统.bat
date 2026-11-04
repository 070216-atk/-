@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
cd /d "%~dp0"

REM ============================================================
REM  快递异常处理系统 - 便携版一键启动
REM  免安装、免联网。双击本文件即可启动并在浏览器中打开。
REM ============================================================

set "PORT=4000"
set "NODE_CMD="
set "RUN_AS_NODE=0"

REM 1) 优先使用系统安装的 node
where node >nul 2>nul
if !errorlevel! == 0 (
  set "NODE_CMD=node"
)

REM 2) 回退:使用 Qoder 自带的 Node(Electron 以 Node 模式运行)
if not defined NODE_CMD (
  for %%P in (
    "%USERPROFILE%\Desktop\Qoder CN\Qoder CN.exe"
    "%LOCALAPPDATA%\Programs\Qoder CN\Qoder CN.exe"
    "%LOCALAPPDATA%\Qoder CN\Qoder CN.exe"
    "C:\Program Files\Qoder CN\Qoder CN.exe"
    "C:\Program Files (x86)\Qoder CN\Qoder CN.exe"
  ) do (
    if not defined NODE_CMD if exist %%P (
      set "NODE_CMD=%%~P"
      set "RUN_AS_NODE=1"
    )
  )
)

if not defined NODE_CMD (
  echo [错误] 未找到可用的 Node 运行时。
  echo        请安装 Node.js ^(https://nodejs.org^),或安装并启动一次 Qoder。
  echo.
  pause
  exit /b 1
)

if "!RUN_AS_NODE!"=="1" set "ELECTRON_RUN_AS_NODE=1"

echo 使用运行时: !NODE_CMD!

REM 端口检测:若已在运行则直接打开界面
powershell -NoProfile -Command "if (Test-NetConnection -ComputerName 127.0.0.1 -Port !PORT! -InformationLevel Quiet -WarningAction SilentlyContinue) { exit 10 } else { exit 0 }" 2>nul
if !errorlevel! == 10 (
  echo 检测到服务已在运行,直接打开界面。
  goto OPEN
)

echo 正在启动服务(端口 !PORT!)...
start "快递异常处理系统 - 服务(关闭此窗口即停止)" /min "!NODE_CMD!" server\src\index.js

REM 等待服务就绪(最多约 8 秒),每 2 秒探测一次端口
set "TRY=0"
:WAITLOOP
set /a TRY+=1
powershell -NoProfile -Command "if (Test-NetConnection -ComputerName 127.0.0.1 -Port !PORT! -InformationLevel Quiet -WarningAction SilentlyContinue) { exit 10 } else { exit 0 }" 2>nul
if !errorlevel! == 10 goto OPEN
timeout /t 2 /nobreak >nul
if !TRY! LSS 4 goto WAITLOOP

REM 服务未能启动:保留窗口并提示,避免"闪一下就没了"
echo.
echo [错误] 服务未能在端口 !PORT! 启动。常见原因:
echo        1^) 端口被占用  2^) Node 运行时异常  3^) server\src\index.js 报错
echo        请查看最小化的"服务"窗口中的报错信息。
echo.
pause
exit /b 1

:OPEN
REM 优先用 Edge/Chrome 的"应用模式"打开一个独立小窗口(无地址栏/标签页)
set "PROFILE=%~dp0.webapp-profile"
set "BROWSER="
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" set "BROWSER=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"

if defined BROWSER goto LAUNCH_APP
start "" "http://localhost:!PORT!/"
echo 未找到 Edge/Chrome,已用默认浏览器打开。
goto DONE

:LAUNCH_APP
start "快递异常处理系统" "!BROWSER!" --app=http://localhost:!PORT!/ --user-data-dir="!PROFILE!" --window-size=1280,860 --window-position=120,80 --no-first-run
echo 已用独立应用窗口打开: !BROWSER!

:DONE
echo.
echo 地址: http://localhost:!PORT!/
echo 提示: 关闭应用窗口即退出界面;要彻底停止后台服务,双击"停止系统"或关闭最小化的"服务"窗口。
echo 本窗口可在 5 秒后自动关闭。
timeout /t 5 /nobreak >nul
endlocal
