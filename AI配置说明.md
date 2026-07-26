# 嘉名：本机 Codex Agent 配置

## 推荐运行方式

本机 Agent 模式把“检索什么、是否继续阅读关联页、何时核对原文”交给 LLM，而不是由网页预先固定召回一批片段。

首次使用：

1. 双击 `配置Codex订阅.bat`。
2. 若已有 Codex/ChatGPT 登录，脚本只显示状态。
3. 若尚未登录，脚本通过官方 Codex CLI 启动设备登录。
4. 双击 `启动Codex订阅版.bat`。
5. 打开 `http://127.0.0.1:4318/`；默认回答模式即为“Codex Agent（自主检索）”。

订阅凭证不写入 `.env`、网页或项目配置。它由 Codex CLI 管理，本项目只是运行已登录的 `codex exec`。因此 ChatGPT 订阅不是 API Key，也不要把登录令牌粘贴进网页。

检查登录状态：

```powershell
codex login status
```

## 本机 Agent 设置

非敏感设置位于 `config/local-agent.json`：

```json
{
  "provider": "codex-subscription",
  "model": "gpt-5.6-terra",
  "reasoningEffort": "low",
  "timeoutMs": 240000,
  "maxHistoryMessages": 8
}
```

- 当前使用 `gpt-5.6-terra` 与 `low` 推理强度，适合多次本地检索和日常起名问答。
- 把 `model` 或 `reasoningEffort` 改为空字符串，可恢复 Codex 当前默认值。
- `timeoutMs`：单次 Agent 问答最长等待时间。
- `maxHistoryMessages`：发送给 Agent 的最近对话条数。

也可以用环境变量临时覆盖：

```powershell
$env:JIAMING_CODEX_MODEL=""
$env:JIAMING_CODEX_REASONING=""
$env:JIAMING_CODEX_TIMEOUT_MS="240000"
```

如果 Codex CLI 位于特殊位置，可在启动前设置 `CODEX_BIN` 为完整路径。

## Agent 如何使用知识库

项目根目录的 `AGENTS.md` 描述了工具与引用规则。Agent 可以自主调用：

```powershell
node tools/knowledge-agent-tools.mjs status
node tools/knowledge-agent-tools.mjs wiki-search --query "连姓音韵" --limit 6
node tools/knowledge-agent-tools.mjs wiki-read --id concept-full-name-phonology
node tools/knowledge-agent-tools.mjs corpus-search --query "人间有味是清欢" --scope song
```

这些工具只读本机文件和 SQLite 数据库，不访问网络：

- `status`：确认 Wiki 版本与完整原文库状态。
- `wiki-search`：搜索姓名、方法、典籍来源、音韵、用字和八字边界。
- `wiki-read`：沿 `links`、`backlinks` 阅读完整 Markdown 页面。
- `corpus-search`：搜索四书五经、十三经及历代诗词原文。

Codex 每次回答使用只读沙箱、临时会话、结构化输出和临时结果文件；回答结束后临时目录会被清理。页面展示的引用是 Agent 本次回答实际采用的资料。

页面中的“仅本地检索（诊断）”不调用 LLM，只用于订阅故障或离线检查。正常问答请选择默认的 Codex Agent 模式。

## 直接打开单文件版

双击 `宝宝起名.html` 仍可使用姓名生成、收藏、内嵌 Wiki 和诊断性本地回答，但无法加载约 459 MB 的完整原文库，也无法调用 Codex Agent。

## 手机或其他电脑

双击 `启动局域网版.bat` 后，同一可信局域网设备可访问本机 IPv4 地址和 `4318` 端口，例如：

```text
http://192.168.1.20:4318/
```

为保护订阅，局域网设备默认不能调用 Codex Agent。本机仍可通过 `http://127.0.0.1:4318/` 使用模型。不要把 `4318` 端口直接映射到公网。

## 八字与隐私

- 程序只接受用户已经确认的四柱，不依据公历时间自动排盘。
- 用户需要自行指定“木、火、土、金、水”的用字倾向。
- 汉字五行归类流派不一，本程序只将其作为透明的候选排序偏好。
- 不推算或声称已判断“喜用神”，不提供吉凶、健康、婚姻、财富等确定性结论。
- 八字默认不发送给模型；只有勾选“允许把八字与五行倾向发给本机模型”后才会进入请求。

## 官方参考

- [Codex 身份验证](https://developers.openai.com/codex/auth)
- [Codex CLI `exec` 命令](https://developers.openai.com/codex/cli/reference)
