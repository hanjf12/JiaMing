# 嘉名 · 中文宝宝起名

嘉名是一个本地优先、可追溯出处的中文宝宝起名项目。它将四书五经、十三经、唐诗、宋诗、宋词、元曲等本地语料做成可检索知识库，并让 Codex Agent 自主运行只读 Shell 命令核对原文、阅读 Wiki，再生成名字建议。

[English](README.en.md) · [完整安装与运行](docs/installation.zh-CN.md) · [模型配置](docs/configuration.zh-CN.md) · [文件原生 LLM Wiki](docs/file-native-llm-wiki.zh-CN.md) · [产品与开源调研](docs/product-research.zh-CN.md)

## 功能

- 中文单姓、复姓，单字名和双字名。
- 典籍偏好、性别气质、包含字、避开字、收藏与导出。
- 接受用户已确认的出生四柱和五行用字倾向，仅作传统文化偏好。
- 105 页互链 Wiki，以及可按需同步的历代经典原始语料。
- Agent 采用“原文直取、同篇化用、跨典合意”三条候选路线，先扩展候选池，再按出处、语境、连姓音韵与长期使用成本筛选。
- 问答中的姓名卡片会标明构成方式、原句、组合理由、音律和风险提醒，不用本地文件路径干扰选择。
- 统一 Agent 链路：直接用 `read / grep / find` 等只读 Shell 命令查看文件知识库，不启动 MCP。
- 两种模型配置：
  - Codex 订阅：使用本机已登录的 Codex CLI，不需要 API Key。
  - 第三方模型：仍由同一个 Codex CLI Agent 运行，通过自定义 provider 连接 Responses 兼容接口。
- Windows 与 macOS 启动脚本；运行时不依赖 React、Next.js 或数据库服务。

## 环境要求

- Git，用于克隆和更新仓库。
- Node.js 22.13 或更高版本。
- 最新版 Codex CLI；两种模式都使用它提供 Agent 循环、结构化输出和只读 Shell。
- Codex 订阅模式需要有效的 ChatGPT/Codex 登录。
- 第三方模式要求端点兼容 OpenAI Responses API，并支持工具调用与结构化输出。
- `rg` 为可选加速工具；没有时自动回退到 PowerShell 或 macOS 原生命令。

项目没有第三方 npm 运行时依赖，克隆后无需执行 `npm install`。Codex CLI 是用户级 Agent 运行时，应全局安装，不写入本项目的 `dependencies`。详见[完整安装与运行说明](docs/installation.zh-CN.md)。

## 快速开始

克隆并进入项目：

```bash
git clone https://github.com/hanjf12/JiaMing.git
cd JiaMing
```

安装 Codex CLI：

```bash
npm install -g @openai/codex@latest
codex --version
```

Codex 订阅用户登录：

```bash
codex login
codex login status
```

检查当前电脑是否具备全部运行条件：

```bash
npm run doctor
```

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

OpenAI 官方说明：[Codex CLI](https://developers.openai.com/codex/cli) · [身份认证](https://developers.openai.com/codex/auth) · [配置基础](https://developers.openai.com/codex/config-basic)。

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

仓库内包含 Wiki、构建脚本与少量编辑资料。因体积和上游许可差异，完整上游仓库不提交：

```text
knowledge/
├── README.md             # Agent 文件检索指南
├── llms.txt              # 精炼知识地图
├── llms-full.txt         # Wiki 合并全文
├── purpose.md
├── schema.md
├── raw/
├── wiki/
├── runtime/
└── corpus/
    ├── catalog.md         # 完整语料路径表
    ├── vendor/             # 上游仓库，本机忽略
    └── authorized/         # 用户有权使用的资料
```

同步公开上游原始语料：

```bash
npm run corpus:sync
```

近现代仍受著作权保护的全文不会随项目分发。仅可将你有权使用的材料放入 `knowledge/corpus/authorized/`，并自行承担授权责任。

Agent 先读小地图，再直接检索和读取文件。`rg` 是跨平台首选；没有 `rg` 时分别使用 PowerShell 或 macOS 原生命令：

```bash
rg --files knowledge
rg -n -i -m 20 "连姓|音韵" knowledge/wiki knowledge/llms.txt
rg -n -F -m 8 -B 12 -A 5 "人间有味是清欢" knowledge/corpus/vendor/chinese-poetry/宋词
```

读取具体页面：

```powershell
# Windows
Get-Content -Encoding UTF8 knowledge\wiki\concepts\concept-full-name-phonology.md
```

```bash
# macOS
sed -n '1,220p' knowledge/wiki/concepts/concept-full-name-phonology.md
```

完整流程和文件路径见[文件知识库指南](knowledge/README.md)。

## 局域网

```powershell
.\start-windows.bat --lan
```

```bash
./start-macos.command --lan
```

同一可信网络中的设备可访问 `http://本机IPv4:4318/`。默认情况下，远端设备不能调用 Agent；页面不会降级生成本地回答。只有明确设置 `JIAMING_ALLOW_LAN_AGENT=true` 才开放远端模型调用。不要直接把端口暴露到公网。

## 开发与校验

```bash
npm run doctor
npm test
npm run wiki:lint
npm run check
```

主要目录：

```text
public/       单文件前端
src/          服务、统一 Codex Agent、Shell 知识接口
scripts/      Wiki 与原始语料维护命令
schemas/      LLM 结构化输出 Schema
knowledge/    本地 Wiki 和原始语料
tests/        Node 内置测试
docs/         配置与调研文档
```

## 安全与文化边界

- Codex 运行在只读沙箱和临时会话中，并使用 `approval_policy=never` 禁止请求跳出沙箱。
- 每次执行把 Codex MCP 配置覆盖为空，并关闭插件、应用等无关能力。
- Agent 只能读取 `knowledge/`，使用文件发现、文本检索和局部读取命令，不运行项目脚本。
- Agent 调用失败时直接返回配置或连接错误，不使用规则模板或本地检索生成降级答案。
- 不凭模型记忆伪造原句、作者或出处，找不到时应明确说明。
- 八字和五行不被当作科学预测，不自动判断喜用神，不断言吉凶。
- `.env`、`config.local.json` 和本地同步语料均已忽略，提交前仍请自行检查敏感信息。

## 许可证

程序代码采用 [MIT License](LICENSE)。知识语料保持各自原始许可证或权利状态，详见 [NOTICE.md](NOTICE.md)。
