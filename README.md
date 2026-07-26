# 嘉名 · 中文宝宝起名

嘉名是一个本地优先、可追溯出处的中文宝宝起名项目。它将四书五经、十三经、唐诗、宋诗、宋词、元曲等本地语料做成可检索知识库，并让 Codex Agent 自主运行只读 Shell 命令核对原文、阅读 Wiki，再生成名字建议。

[English](README.en.md) · [模型配置](docs/configuration.zh-CN.md) · [产品与开源调研](docs/product-research.zh-CN.md)

## 功能

- 中文单姓、复姓，单字名和双字名。
- 典籍偏好、性别气质、包含字、避开字、收藏与导出。
- 接受用户已确认的出生四柱和五行用字倾向，仅作传统文化偏好。
- 104 页互链 Wiki 与 345,579 条本机经典原文索引。
- 统一 Agent 链路：知识库只通过 `node scripts/knowledge.mjs ...` 接入，不启动 MCP。
- 两种模型配置：
  - Codex 订阅：使用本机已登录的 Codex CLI，不需要 API Key。
  - 第三方模型：仍由同一个 Codex CLI Agent 运行，通过自定义 provider 连接 Responses 兼容接口。
- Windows 与 macOS 启动脚本；运行时不依赖 React、Next.js 或数据库服务。

## 环境要求

- Node.js 22.13 或更高版本。项目使用 Node 内置的 `node:sqlite`。
- Codex CLI。两种模式都使用它提供 Agent 循环和 Shell 工具。
- Codex 订阅模式需要有效的 ChatGPT/Codex 登录。
- 第三方模式要求端点兼容 OpenAI Responses API，并支持函数/工具调用。

项目没有第三方运行时依赖，克隆后无需执行 `npm install`。

## 快速开始

### Windows

双击 `start-windows.bat`，或在 PowerShell 中运行：

```powershell
.\start-windows.bat
```

### macOS

首次使用可赋予执行权限：

```bash
chmod +x start-macos.command configure-codex-macos.command
./start-macos.command
```

也可在任一平台运行：

```bash
node src/server.mjs
```

浏览器地址为 <http://127.0.0.1:4318/>。

## 选择模型

复制配置模板：

```powershell
# Windows
Copy-Item config.example.json config.local.json
Copy-Item .env.example .env
```

```bash
# macOS
cp config.example.json config.local.json
cp .env.example .env
```

### Codex 订阅

保持 `config.local.json` 中：

```json
{
  "provider": "codex"
}
```

Windows 双击 `configure-codex-windows.bat`；macOS 运行 `./configure-codex-macos.command`。登录凭据由 Codex CLI 管理，不写入本项目。

### 第三方模型

把提供方改成：

```json
{
  "provider": "third-party",
  "thirdParty": {
    "name": "我的模型服务",
    "baseUrl": "http://127.0.0.1:8000/v1",
    "apiKeyEnv": "OPENAI_API_KEY",
    "model": "your-agent-capable-model",
    "reasoningEffort": "low"
  }
}
```

然后在 `.env` 中填写：

```dotenv
OPENAI_API_KEY=你的密钥
```

本地免密服务可以把 `OPENAI_API_KEY` 留空。Codex 自定义 provider 当前只使用 Responses 协议；只实现 Chat Completions 的接口需要先加 Responses 转换层。完整选项见[模型配置](docs/configuration.zh-CN.md)。

## 知识库

仓库内包含 Wiki、构建脚本与少量编辑资料。因体积和上游许可差异，完整上游仓库与生成的 SQLite 索引不提交：

```text
knowledge/
├── purpose.md
├── schema.md
├── raw/
├── wiki/
├── runtime/
└── corpus/
    ├── vendor/             # 上游仓库，本机忽略
    ├── authorized/         # 用户有权使用的资料
    ├── classics.sqlite     # 生成的本机全文索引
    └── manifest.json
```

同步公开上游语料并重建索引：

```bash
npm run corpus:sync
```

只重建已有本地语料：

```bash
npm run corpus:build
npm run corpus:status
```

近现代仍受著作权保护的全文不会随项目分发。仅可将你有权使用的材料放入 `knowledge/corpus/authorized/`，并自行承担授权责任。

Agent 与人工诊断使用同一套 Shell 命令：

```bash
node scripts/knowledge.mjs status
node scripts/knowledge.mjs wiki-search --query "连姓音韵" --scope all --limit 6
node scripts/knowledge.mjs wiki-read --id concept-full-name-phonology
node scripts/knowledge.mjs corpus-search --query "人间有味是清欢" --scope song --limit 6
```

## 局域网

```powershell
.\start-windows.bat --lan
```

```bash
./start-macos.command --lan
```

同一可信网络中的设备可访问 `http://本机IPv4:4318/`。默认情况下，远端设备只能使用网页和本地检索，不能消耗 Codex 订阅或模型 API。只有明确设置 `JIAMING_ALLOW_LAN_AGENT=true` 才开放远端模型调用。不要直接把端口暴露到公网。

## 开发与校验

```bash
npm test
npm run wiki:lint
npm run check
```

主要目录：

```text
public/       单文件前端
src/          服务、统一 Codex Agent、Shell 知识接口
scripts/      Wiki 与原文库维护命令
schemas/      LLM 结构化输出 Schema
knowledge/    本地 Wiki 和语料索引
tests/        Node 内置测试
docs/         配置与调研文档
```

## 安全与文化边界

- Codex 运行在只读沙箱和临时会话中；项目规则只放行知识库 Shell 命令。
- 每次执行把 Codex MCP 配置覆盖为空，并关闭插件、应用等无关能力。
- 不凭模型记忆伪造原句、作者或出处，找不到时应明确说明。
- 八字和五行不被当作科学预测，不自动判断喜用神，不断言吉凶。
- `.env`、`config.local.json`、本地语料和 SQLite 索引均已忽略，提交前仍请自行检查敏感信息。

## 许可证

程序代码采用 [MIT License](LICENSE)。知识语料保持各自原始许可证或权利状态，详见 [NOTICE.md](NOTICE.md)。
