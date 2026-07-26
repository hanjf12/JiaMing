# 模型与本机服务配置

嘉名只运行一个本机 HTTP 服务，但可以选择两种互不依赖的模型提供方。配置优先级为：环境变量 > `.env` > `config.local.json` > 内置默认值。

## 公共准备

需要 Node.js 22.13 或更高版本，不需要安装项目依赖：

```bash
node --version
node src/server.mjs
```

首次配置可复制模板：

```text
config.example.json → config.local.json
.env.example        → .env
```

这两个本机文件都不会被 Git 提交。

## 方式一：Codex 订阅

适合已经拥有可用 ChatGPT/Codex 订阅的用户。

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

此模式需要 Codex CLI。订阅登录与 API Key 是两套不同的认证方式；不要把 Codex 登录令牌粘贴到 `.env` 或网页。

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

服务每次问答运行临时 `codex exec`，启用只读沙箱、结构化输出和本地 `jiaming` MCP 工具。临时回答文件在结束后删除。

可用环境变量：

```dotenv
JIAMING_PROVIDER=codex
CODEX_BIN=
JIAMING_CODEX_MODEL=gpt-5.6-terra
JIAMING_CODEX_REASONING=low
JIAMING_CODEX_TIMEOUT_MS=240000
```

## 方式二：OpenAI 兼容模型

此模式不需要 Codex CLI。它需要一个支持函数/工具调用的 OpenAI 格式端点。

Responses API 示例：

```json
{
  "provider": "openai",
  "openai": {
    "baseUrl": "https://api.openai.com/v1",
    "apiKeyEnv": "OPENAI_API_KEY",
    "model": "gpt-5.6-terra",
    "apiStyle": "responses",
    "reasoningEffort": "low",
    "timeoutMs": 120000,
    "maxToolRounds": 8
  }
}
```

Chat Completions 兼容服务：

```json
{
  "provider": "openai",
  "openai": {
    "baseUrl": "http://127.0.0.1:8000/v1",
    "apiKeyEnv": "OPENAI_API_KEY",
    "model": "your-tool-capable-model",
    "apiStyle": "chat-completions",
    "reasoningEffort": ""
  }
}
```

密钥放在 `.env`，不要写进 JSON：

```dotenv
JIAMING_PROVIDER=openai
OPENAI_API_KEY=你的密钥
```

本地免认证服务可留空。若兼容服务不接受 `reasoning_effort`，把 `reasoningEffort` 设为空字符串。额外固定请求头可在 `openai.headers` 中配置，但不要把含密钥的配置提交到 Git。

本项目自己执行模型提出的本地工具调用，并把结果送回模型。无论选择 Responses 还是 Chat Completions，使用的都是同一套只读知识工具：

- `knowledge_status`
- `wiki_search`
- `wiki_read`
- `corpus_search`

不支持工具调用的“仅文本兼容”模型无法完成基于 LLM 的知识库问答，可继续使用页面中的“仅本地检索（诊断）”。

### Codex CLI 能否接 OpenAI 兼容接口

可以，但它与本项目的直接 OpenAI 模式不是一回事。Codex CLI 支持在用户级 `~/.codex/config.toml` 中定义自定义 `model_providers`，可配置 `base_url`、`env_key` 和请求头；当前自定义 provider 的 `wire_api` 只支持 `responses`。官方也内置了 Ollama、LM Studio 等本地 provider。

嘉名的 `provider: "openai"` 选择直接调用接口，是因为：

- 同时兼容 Responses 和 Chat Completions；
- 不要求安装 Codex CLI；
- 项目配置与个人 Codex 全局配置互不影响；
- 本地知识工具执行逻辑更容易测试和审计。

因此，OpenAI 兼容模型建议使用嘉名的直接模式。Codex 订阅模式则保持使用已登录的官方 Codex CLI。参考 [Codex 高级配置](https://developers.openai.com/codex/config-advanced) 和 [配置字段参考](https://developers.openai.com/codex/config-reference)。

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

这会允许其他设备使用你的订阅额度或 API Key，务必谨慎。服务没有面向公网的账号、TLS、限流和审计机制，不应直接映射到互联网。

## 八字与隐私

- 程序只接受用户已经确认的四柱，不依据公历时间自动排盘。
- 用户自行指定“木、火、土、金、水”的用字倾向。
- 汉字五行归类流派不一，只作为候选排序偏好。
- 不自动判断喜用神，不提供确定性的吉凶、健康、婚姻或财富结论。
- 八字默认不发送给模型；只有页面中勾选授权后才进入模型请求。
