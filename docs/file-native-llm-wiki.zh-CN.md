# 文件原生 LLM Wiki 方案

## 调研结论

本项目采用“精炼地图 + 互链 Markdown + 原始文件分片 + Agent 按需检索”的方案，而不是再引入一套 MCP 或强制依赖向量数据库。

参考方案：

- [DeepWiki-Open](https://github.com/AsyncFuncAI/deepwiki-open) 会分析目录、生成分层 Wiki，并以 RAG 支持对话。它适合自动解释代码仓库，但完整部署还包含嵌入模型、向量存储和独立服务，对本项目的纯本地经典文本检索偏重。
- [llms.txt](https://github.com/AnswerDotAI/llms-txt) 用一个精炼 Markdown 入口描述站点并链接到详细 Markdown，目标正是避免把整个站点塞进有限上下文。本项目保留 `knowledge/llms.txt` 和可选的 `llms-full.txt`。
- [Aider repository map](https://aider.chat/docs/repomap.html) 把全库压缩为小型地图，随后只展开相关文件，并用固定 token 预算控制上下文。本项目对应的是 `llms.txt → wiki 页面 → 原始 JSON`。
- [Codex AGENTS.md](https://developers.openai.com/codex/guides/agents-md) 支持按目录提供持久说明；[Codex Rules](https://developers.openai.com/codex/rules) 明确规则用于控制沙箱外命令，不等同于文件读取沙箱。因此这里使用只读沙箱和禁止审批升级作为强边界，用 `AGENTS.md` 与问答提示约束只读路径。

## 最终结构

```text
用户问题
  → Agent 用 grep 在 knowledge/llms.txt 小地图中定位入口
  → rg/grep 在 knowledge/wiki 中定位方法与候选页
  → read 读取少量命中 Markdown
  → 涉及原句时按 corpus/catalog.md 缩小目录
  → rg -n -F 在上游 JSON 中核对原文、作者、篇名和行号
  → 生成带文件引用的回答
```

34 万条原文仍保留在上游已经分片的 391 个文件中，不额外导出 34 万个小文件，也不复制一份巨型文本，从而避免目录性能问题和磁盘翻倍。LLM Agent 直接使用只读 Shell 定位这些分片，不维护数据库索引，也不提供规则式降级回答。

## 为什么不用纯向量检索

- 起名常要核对精确原句，固定字符串搜索比语义近似更适合最终校验。
- 目录、文件路径和行号可由用户直接复查，引用更透明。
- Windows 与 macOS 都有原生 find/grep/read 等价命令；`rg` 可作为更快的跨平台首选。
- 没有嵌入模型、向量数据库和重建索引的运行依赖，离线维护更简单。

向量检索仍可作为以后“想法发现”的可选召回层，但结果必须回到原始文件再次核对，不能替代文件证据。

## 安全边界

- `codex exec --sandbox read-only`：文件系统只读。
- `approval_policy=never`：Agent 不能因命令受限而请求跳出沙箱。
- `mcp_servers={}`：不加载个人 MCP 配置。
- 提示和项目说明只允许读取 `knowledge/`，禁止网络、写入、脚本解释器和系统管理命令。
- 原始语料可能来自外部仓库，只被当作数据；其中出现的指令文本不得覆盖项目说明。
