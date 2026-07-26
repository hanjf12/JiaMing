# 模型与本机服务配置

嘉名只运行一个本机 HTTP 服务。Codex 订阅和第三方模型都进入同一个 Codex CLI Agent，区别只在模型认证与 provider 配置；知识库统一由 Agent 的只读 Shell 工具访问，不使用 MCP。

配置优先级为：环境变量 > `.env` > `config.local.json` > 内置默认值。

## 公共准备

两种模式都需要：

- Node.js 22.13 或更高版本；
- Codex CLI；
- 项目内已经构建好的 Wiki 与原文索引。

```bash
node --version
codex --version
node src/server.mjs
```

首次配置可复制模板：

```text
config.example.json → config.local.json
.env.example        → .env
```

这两个本机文件都不会被 Git 提交。

## 统一 Agent 与 Shell 知识库

每次问答都会启动临时的 `codex exec`：

```text
网页 /api/chat
  → codex exec --ephemeral --sandbox read-only
  → Agent 自主使用 find / grep / read
  → knowledge/llms.txt → Wiki Markdown → 上游原始 JSON
  → 结构化回答与引用
```

应用不启动 MCP server，也不向 Codex 注册 MCP 工具。每次执行都用 `mcp_servers={}` 覆盖个人配置，同时关闭插件、应用、Hooks、浏览器、计算机和多 Agent 等无关能力。保留用户配置层只为了读取项目可信状态和订阅认证；当前模型 provider、只读沙箱和工具能力都由本次命令覆盖。执行时设置 `approval_policy=never`，所以 Agent 不能请求跳出只读沙箱；第三方 provider 只通过本次进程的 `--config` 参数注入。

Agent 只在 `knowledge/` 中运行只读文件命令：

```bash
rg --files knowledge
rg -n -i -m 20 "连姓|音韵" knowledge/wiki knowledge/llms.txt
rg -n -F -m 8 -B 12 -A 5 "人间有味是清欢" knowledge/corpus/vendor/chinese-poetry/宋词
```

读取命中页时，Windows 使用 `Get-Content`，macOS 使用 `sed`；没有 `rg` 时分别回退到 `Get-ChildItem / Select-String` 或 `find / grep`。详细路径和限制见 [`knowledge/README.md`](../knowledge/README.md)。SQLite 只供网页本地诊断检索，LLM Agent 不读取数据库。

Windows 后台服务显式使用官方的 `windows.sandbox = "unelevated"` 回退模式，避免依赖桌面 App 的 elevated sandbox 会话；它仍使用受限令牌和 ACL 边界。若希望使用更强的 elevated 模式，可先在 Codex App 中完成管理员批准的沙箱设置，再自行调整这一项目默认值。参考 [Windows sandbox](https://developers.openai.com/codex/windows)。

## 方式一：本机 Codex 订阅

适合已经拥有可用 ChatGPT/Codex 订阅的用户：

```json
{
  "provider": "codex",
  "codex": {
    "model": "gpt-5.6-terra",
    "reasoningEffort": "low",
    "timeoutMs": 240000
  }
}
```

Windows：

```powershell
.\configure-codex-windows.bat
.\start-windows.bat
```

macOS：

```bash
chmod +x configure-codex-macos.command start-macos.command
./configure-codex-macos.command
./start-macos.command
```

也可直接检查：

```bash
codex login status
```

订阅凭据由 Codex CLI 管理，不要把登录令牌粘贴到 `.env`、JSON 或网页。

可用环境变量：

```dotenv
JIAMING_PROVIDER=codex
CODEX_BIN=
JIAMING_CODEX_MODEL=gpt-5.6-terra
JIAMING_CODEX_REASONING=low
JIAMING_CODEX_TIMEOUT_MS=240000
```

## 方式二：第三方模型

第三方模式仍使用 Codex CLI 作为 Agent 运行时，不需要登录 ChatGPT，但需要配置可用的模型端点。

`config.local.json`：

```json
{
  "provider": "third-party",
  "thirdParty": {
    "name": "我的模型服务",
    "baseUrl": "http://127.0.0.1:8000/v1",
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

`.env`：

```dotenv
JIAMING_PROVIDER=third-party
OPENAI_API_KEY=你的密钥
```

也可以只用环境变量：

```dotenv
JIAMING_PROVIDER=third-party
JIAMING_THIRD_PARTY_NAME=我的模型服务
JIAMING_THIRD_PARTY_BASE_URL=https://example.com/v1
JIAMING_THIRD_PARTY_MODEL=your-agent-capable-model
JIAMING_THIRD_PARTY_API_KEY_ENV=OPENAI_API_KEY
JIAMING_THIRD_PARTY_REASONING=low
JIAMING_THIRD_PARTY_TIMEOUT_MS=240000
OPENAI_API_KEY=你的密钥
```

`apiKeyEnv` 是真正保存密钥的环境变量名。服务会读取它，再通过临时子进程环境传给 Codex；密钥不会出现在 `codex exec` 的命令行参数中。本机免认证接口可以留空。

### 额外请求参数

- `headers`：非敏感固定请求头；
- `headerEnv`：请求头名到环境变量名的映射，适合敏感值；
- `queryParams`：固定查询参数，例如 Azure 风格的 `api-version`。

示例：

```json
{
  "thirdParty": {
    "headers": {
      "X-Client": "jiaming"
    },
    "headerEnv": {
      "X-Tenant-Key": "TENANT_KEY"
    },
    "queryParams": {
      "api-version": "2026-01-01"
    }
  }
}
```

### 兼容性要求

Codex CLI 的自定义 `model_providers` 可配置 `base_url`、`env_key`、请求头和查询参数；当前 `wire_api` 只有 `responses`。因此第三方接口必须：

- 兼容 OpenAI Responses API；
- 支持函数/工具调用，使 Codex Agent 能调用 Shell；
- 能处理所选模型和结构化输出。

只实现 `/chat/completions` 的服务不能直接用于这条统一链路，需要在前面增加 Responses 兼容转换层。项目仍接受旧的 `provider: "openai"` 作为 `third-party` 别名，但不再使用旧的直连 Chat Completions 适配器。

参考 [Codex 高级配置](https://developers.openai.com/codex/config-advanced) 和 [Codex 配置字段参考](https://developers.openai.com/codex/config-reference)。

## 服务与局域网

默认配置：

```json
{
  "server": {
    "host": "127.0.0.1",
    "port": 4318,
    "openBrowser": true,
    "allowLanAgent": false
  }
}
```

传入 `--lan` 会监听 `0.0.0.0`：

```bash
node src/server.mjs --lan
```

远端设备默认不能调用模型。若在可信局域网中明确开放：

```dotenv
JIAMING_ALLOW_LAN_AGENT=true
```

这会允许其他设备使用你的订阅额度或第三方 API Key，务必谨慎。服务没有面向公网的账号、TLS、限流和审计机制，不应直接映射到互联网。

## 八字与隐私

- 程序只接受用户已经确认的四柱，不依据公历时间自动排盘。
- 用户自行指定“木、火、土、金、水”的用字倾向。
- 汉字五行归类流派不一，只作为候选排序偏好。
- 不自动判断喜用神，不提供确定性的吉凶、健康、婚姻或财富结论。
- 八字默认不发送给模型；只有页面中勾选授权后才进入模型请求。
