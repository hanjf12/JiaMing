@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

set "CODEX_BIN=%USERPROFILE%\.codex\.sandbox-bin\codex.exe"
if exist "%CODEX_BIN%" goto :found

set "CODEX_BIN=%LOCALAPPDATA%\OpenAI\Codex\codex.exe"
if exist "%CODEX_BIN%" goto :found

for /f "delims=" %%I in ('where codex 2^>nul') do (
  set "CODEX_BIN=%%I"
  goto :found
)

echo 未找到 Codex CLI。Codex 订阅模式需要先安装 Codex CLI。
echo 若使用 OpenAI 兼容模型，则不需要 Codex CLI。
pause
exit /b 1

:found
"%CODEX_BIN%" login status
if %errorlevel% equ 0 (
  echo.
  echo Codex 订阅已经登录，无需配置 API Key。
  pause
  exit /b 0
)

echo.
echo 即将登录 ChatGPT / Codex 订阅。
"%CODEX_BIN%" login --device-auth
if errorlevel 1 (
  echo 登录未完成，请稍后重试。
  pause
  exit /b 1
)

"%CODEX_BIN%" login status
pause
endlocal
