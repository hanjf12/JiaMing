#!/bin/sh
set -eu
cd "$(dirname "$0")"

if ! command -v codex >/dev/null 2>&1; then
  echo "未找到 Codex CLI。Codex 订阅模式需要先安装 Codex CLI。"
  echo "第三方模型模式也使用 Codex Agent，因此同样需要 Codex CLI。"
  printf "按回车键关闭…"
  read -r _
  exit 1
fi

if codex login status; then
  echo "Codex 订阅已经登录，无需配置 API Key。"
else
  echo "即将通过浏览器登录 ChatGPT / Codex 订阅。"
  codex login
  codex login status
fi
