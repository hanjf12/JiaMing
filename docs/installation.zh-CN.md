# 安装与运行

本文从空白电脑开始说明如何克隆并运行 JiaMing。项目本身没有第三方 npm 运行时依赖，但模型问答依赖 Node.js 和 Codex CLI。

## 1. 依赖

| 依赖 | 要求 | 是否必需 | 用途 |
| --- | --- | --- | --- |
| Git | 当前稳定版 | 克隆时需要 | 获取项目与后续更新 |
| Node.js | 22.13.0 或更高 | 必需 | HTTP 服务、Wiki 构建、测试及内置 SQLite |
| Codex CLI | 建议安装最新版 | 必需 | 两种模型模式统一使用的 Agent、结构化输出与只读 Shell |
| ChatGPT/Codex 登录 | 有效订阅 | 仅 Codex 订阅模式 | 使用订阅额度，不需要 API Key |
| Responses 兼容模型接口 | 支持工具调用与结构化输出 | 仅第三方模式 | 自定义模型服务 |
| 浏览器 | 当前版本 | 必需 | 使用本地网页 |
| ripgrep (`rg`) | 当前版本 | 可选 | 加快知识库检索；缺少时自动使用系统命令 |

JiaMing 当前要求 Codex CLI 支持以下 `codex exec` 能力：

```text
--ephemeral
--sandbox read-only
--json
--output-schema
--output-last-message
```

不要把 `@openai/codex` 写进项目的 `dependencies`：它是用户级 Agent 运行时，需要管理自己的登录凭据和全局配置。项目会在每次调用时覆盖模型 provider、MCP、只读沙箱和审批策略。

官方参考：

- [Codex CLI](https://developers.openai.com/codex/cli)
- [Codex 身份认证](https://developers.openai.com/codex/auth)
- [Codex 配置基础](https://developers.openai.com/codex/config-basic)

## 2. 准备系统环境

### Windows

1. 从 [Git for Windows](https://git-scm.com/download/win) 安装 Git。
2. 从 [Node.js](https://nodejs.org/) 安装 Node.js 22.13.0 或更高版本。
3. 关闭并重新打开 PowerShell，确认：

```powershell
git --version
node --version
npm --version
```

### macOS

可以先安装包含 Git 的 Command Line Tools：

```bash
xcode-select --install
```

再从 [Node.js](https://nodejs.org/) 安装 Node.js 22.13.0 或更高版本，并确认：

```bash
git --version
node --version
npm --version
```

## 3. 克隆项目

```bash
git clone https://github.com/hanjf12/JiaMing.git
cd JiaMing
```

确认 Node.js：

```bash
node --version
npm --version
```

`node --version` 必须不低于 `v22.13.0`。项目没有 npm 依赖，因此克隆后不需要执行 `npm install`。

## 4. 安装 Codex CLI

因为本项目已经要求 Node.js，Windows 与 macOS 都可以直接使用 npm 安装：

```bash
npm install -g @openai/codex@latest
codex --version
```

macOS 也可使用 OpenAI 官方独立安装器：

```bash
curl -fsSL https://chatgpt.com/codex/install.sh | sh
```

升级 npm 安装的 Codex CLI：

```bash
npm install -g @openai/codex@latest
```

如果安装完成后终端找不到 `codex`，关闭并重新打开终端，再检查 npm 全局可执行目录是否已加入 `PATH`。

## 5A. 使用 Codex 订阅

Codex 官方支持“使用 ChatGPT 登录”访问订阅，也支持 API Key 计费；本项目的 `provider: "codex"` 使用前者。

```bash
codex login
codex login status
```

登录过程会打开浏览器。凭据由 Codex CLI 存储，不要把登录令牌写入 `.env`、配置文件或提交到 Git。

复制项目配置：

```powershell
# Windows PowerShell
Copy-Item config.example.json config.local.json
Copy-Item .env.example .env
```

```bash
# macOS
cp config.example.json config.local.json
cp .env.example .env
```

保持 `config.local.json` 中：

```json
{
  "provider": "codex"
}
```

运行环境诊断：

```bash
npm run doctor
```

## 5B. 使用第三方模型

第三方模式不要求 ChatGPT 登录，但仍必须安装 Codex CLI，因为 Codex CLI 负责 Agent 循环、Shell 工具和结构化输出。

将 `config.local.json` 改为：

```json
{
  "provider": "third-party",
  "thirdParty": {
    "name": "我的模型服务",
    "baseUrl": "https://example.com/v1",
    "apiKeyEnv": "OPENAI_API_KEY",
    "model": "your-agent-capable-model",
    "reasoningEffort": "low",
    "timeoutMs": 240000,
    "headers": {},
    "headerEnv": {},
    "queryParams": {}
  }
}
```

在 `.env` 中填写：

```dotenv
JIAMING_PROVIDER=third-party
OPENAI_API_KEY=你的密钥
```

接口必须兼容 OpenAI Responses API，并支持工具调用和符合 JSON Schema 的结构化输出。只有 `/chat/completions` 的服务不能直接使用，需要先增加 Responses 转换层。本机免认证端点可以把密钥留空。

然后执行：

```bash
npm run doctor
```

## 6. 启动

### Windows

在 PowerShell 中：

```powershell
.\start-windows.bat
```

也可以双击 `start-windows.bat`。

### macOS

首次运行：

```bash
chmod +x start-macos.command configure-codex-macos.command
./start-macos.command
```

### 通用命令

```bash
npm start
```

浏览器打开：

```text
http://127.0.0.1:4318/
```

关闭服务时，在运行服务的终端按 `Ctrl+C`。

## 7. 局域网访问

Windows：

```powershell
.\start-windows.bat --lan
```

macOS：

```bash
./start-macos.command --lan
```

同一可信网络中的设备访问：

```text
http://本机IPv4地址:4318/
```

默认远端设备不能调用模型。只有明确设置以下变量才开放远端 Agent：

```dotenv
JIAMING_ALLOW_LAN_AGENT=true
```

该服务没有公网所需的登录、TLS、限流和审计，不要直接映射到互联网。

## 8. 完整语料与开发检查

仓库自带 Wiki 和语料清单，可直接启动。下载公开上游完整语料并构建本地索引：

```bash
npm run corpus:sync
```

只重建已有语料：

```bash
npm run corpus:build
```

运行全部检查：

```bash
npm run doctor
npm run check
```

## 9. 常见问题

### 页面显示“模型未配置”

先运行：

```bash
npm run doctor
```

Codex 订阅模式重点检查 `codex login status`；第三方模式检查 `baseUrl`、`model` 和密钥环境变量。

### `codex` 命令不存在

重新打开终端并执行：

```bash
npm install -g @openai/codex@latest
codex --version
```

### 第三方接口能聊天但 Agent 失败

普通聊天接口不等于 Agent 接口。确认服务实现 Responses API、工具调用和结构化输出，并允许模型按 JSON Schema 返回结果。

### 第一次问答很慢

每轮模型问答都会启动临时 `codex exec`，检索 Wiki 和原始语料，再生成结构化姓名卡。首次登录、模型冷启动或完整语料检索可能增加等待时间。

### Windows Shell 快照警告

项目已经关闭 `shell_snapshot`，并为后台服务使用只读的 Windows unelevated 沙箱回退。若仍出现旧日志，升级 Codex CLI 后重启服务。
