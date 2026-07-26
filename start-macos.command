#!/bin/sh
set -eu
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "未找到 Node.js 22.13 或更高版本。"
  echo "请从 https://nodejs.org/ 安装 Node.js 后重试。"
  printf "按回车键关闭…"
  read -r _
  exit 1
fi

if ! node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)'; then
  echo "Node.js 版本过低，请安装 22.13 或更高版本。"
  printf "按回车键关闭…"
  read -r _
  exit 1
fi

exec node src/server.mjs "$@"
