@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
set "JIAMING_HOST=0.0.0.0"
set "CODEX_BIN=%USERPROFILE%\.codex\.sandbox-bin\codex.exe"

where node >nul 2>nul
if %errorlevel% equ 0 (
  node tools\codex-local-server.mjs
  goto :end
)

set "BUNDLED_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if exist "%BUNDLED_NODE%" (
  set "PATH=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;%PATH%"
  "%BUNDLED_NODE%" tools\codex-local-server.mjs
  goto :end
)

echo 未找到 Node.js。请安装 Node.js 22 或在 Codex 中运行本项目。

:end
if errorlevel 1 pause
endlocal
