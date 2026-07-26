@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if %errorlevel% equ 0 (
  node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)"
  if errorlevel 1 goto :old_node
  node src\server.mjs %*
  goto :end
)

set "BUNDLED_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if exist "%BUNDLED_NODE%" (
  "%BUNDLED_NODE%" -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)"
  if errorlevel 1 goto :old_node
  "%BUNDLED_NODE%" src\server.mjs %*
  goto :end
)

:old_node
echo 未找到 Node.js 22.13 或更高版本。
echo 请从 https://nodejs.org/ 安装 Node.js 后重试。

:end
if errorlevel 1 pause
endlocal
