@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
cd /d "%~dp0"

REM ============================================================
REM  Read-only data viewer (users / tickets / H2 demo tables).
REM  Writes nothing. All Chinese text is printed by 查看数据.mjs,
REM  because cmd.exe mis-parses multi-byte characters inside .bat.
REM  Usage: (no args = all)  or  查看数据.bat users|tickets|h2
REM ============================================================

set "NODE_CMD="
where node >nul 2>nul
if !errorlevel! == 0 set "NODE_CMD=node"

if not defined NODE_CMD if exist "%USERPROFILE%\Desktop\Qoder CN\Qoder CN.exe" (
  set "NODE_CMD=%USERPROFILE%\Desktop\Qoder CN\Qoder CN.exe"
  set "RUN_AS_NODE=1"
)

if not defined NODE_CMD (
  echo [ERROR] No Node runtime found. Install Node.js or start Qoder once.
  pause
  exit /b 1
)

if "!RUN_AS_NODE!"=="1" set "ELECTRON_RUN_AS_NODE=1"

"!NODE_CMD!" "查看数据.mjs" %*

pause
endlocal
