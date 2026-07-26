@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

set "CODEX_BIN=%USERPROFILE%\.codex\.sandbox-bin\codex.exe"
if not exist "%CODEX_BIN%" (
  for /f "delims=" %%I in ('where codex 2^>nul') do (
    set "CODEX_BIN=%%I"
    goto :found
  )
)

:found
if not exist "%CODEX_BIN%" (
  echo 未找到 Codex CLI。请先安装或打开 Codex 桌面版。
  pause
  exit /b 1
)

"%CODEX_BIN%" login status >nul 2>nul
if %errorlevel% equ 0 (
  echo.
  echo Codex 订阅已登录，无需配置 API Key。
  "%CODEX_BIN%" login status
  echo.
  pause
  exit /b 0
)

echo 即将使用浏览器或设备码登录 ChatGPT / Codex 订阅。
"%CODEX_BIN%" login --device-auth
if errorlevel 1 (
  echo 登录未完成，请稍后重试。
  pause
  exit /b 1
)

echo.
"%CODEX_BIN%" login status
pause
endlocal
