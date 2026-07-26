# 嘉名 · 中文宝宝起名

一个纯本地优先的中文起名程序，支持四书五经、诗经、楚辞、唐诗、宋诗、宋词、五代词、元曲与清代专题语料，并可使用本机 Codex 订阅组织带出处的回答。

## 打开方式

- 首次使用可双击 `配置Codex订阅.bat`：检查或完成 ChatGPT/Codex 订阅登录，不需要 API Key。
- 双击 `启动Codex订阅版.bat`：启动本机 Codex Agent，支持模型自主读取 Wiki 与调用完整原文检索工具。
- 双击 `启动局域网版.bat`：同一 Wi-Fi 下其他设备可访问；为保护订阅，局域网设备默认只能使用本地检索，不能调用 Codex。
- 直接打开 `宝宝起名.html`：单文件离线版，支持 104 页 Wiki，但不加载 459 MB 的完整原文索引。

默认地址：

```text
http://127.0.0.1:4318/
```

局域网地址请把 `127.0.0.1` 换成本机 IPv4，例如 `http://192.168.31.148:4318/`。

## 知识库结构

本项目参考 LLM Wiki 的三层方式：

```text
knowledge/
├── purpose.md                 # 目标、范围和边界
├── schema.md                  # 页面字段、链接与状态规则
├── raw/                       # 姓名、方法、编辑资料
├── wiki/                      # 互链 Markdown 页面
├── runtime/                   # 网页检索包与知识图谱
└── corpus/
    ├── vendor/                # 上游完整原文（本机，不提交）
    ├── authorized/            # 用户有权使用的近现代全文
    ├── classics.sqlite        # 作品级全文索引（本机）
    └── manifest.json          # 数量、来源与构建统计
```

当前编译结果：

- 104 个 Wiki 页面、104 个检索块、283 条 Wiki 关联。
- 62 个精选姓名候选、10 个基础方法页。
- 典籍来源、音韵/用字/八字边界等概念页与方案比较页。
- 345,579 条完整原文或篇章元数据。
- 57,600 条唐诗、254,195 条宋诗、21,049 条宋词、10,906 条元曲。
- 完整四书五经/十三经按篇章索引。

Codex Agent 问答流程是：

```text
问题
  ↓
Codex Agent 读取 AGENTS.md，自主规划检索
  ├─ status：确认知识库状态
  ├─ wiki-search：搜索编辑性 Wiki
  ├─ wiki-read：沿互链读取完整页面
  └─ corpus-search：SQLite FTS5 检索经典原文
  ↓
结构化回答 + 本次实际引用来源
```

Agent 工具入口为 `tools/knowledge-agent-tools.mjs`，全部只读；Codex 运行在 `read-only` 沙箱、临时会话中，不允许修改文件或访问网络。直接打开单文件版时仍保留仅本地检索，作为离线与诊断后备。

非敏感 Agent 设置位于本机忽略文件 `config/local-agent.json`。当前配置使用 `gpt-5.6-terra` 和低推理强度，兼顾工具调用质量与响应速度；把 `model` 或 `reasoningEffort` 改为空字符串可恢复 Codex 默认值。订阅凭证由 Codex CLI 自己管理，不写入项目。

## 构建与维护

```powershell
# 重新生成 Wiki、网页内嵌包和知识图谱
npm run wiki:build
npm run wiki:lint

# 首次下载完整公开语料并建立本地全文索引
npm run corpus:sync

# 原文已下载时，只重建 SQLite 索引
npm run corpus:build

# 查看原文库统计
npm run corpus:status

# 直接测试 Agent 的只读知识工具
npm run agent:status
npm run agent:wiki -- --query "连姓音韵"
npm run agent:corpus -- --query "人间有味是清欢" --scope song

# 构建与测试应用
npm run lint
npm test
```

新资料先放入 `knowledge/inbox/`，审核来源后再合并到 `raw/`。不要直接手改 `wiki/` 的生成页。

## 数据来源与许可

- [chinese-poetry/chinese-poetry](https://github.com/chinese-poetry/chinese-poetry)，MIT：全唐诗、全宋诗、全宋词及其他古典选集。
- [gujilab/chinese-classical-corpus](https://github.com/gujilab/chinese-classical-corpus)，数据 CC0：完整四书五经/十三经。

古典原文本身属于公有领域，但整理数据可能有单独许可；程序保存上游来源、文件路径与许可字段。上游也可能含异文、重出或录入错误，正式定名时应复核可靠版本。

毛泽东诗词等近现代作品默认只收录目录元数据，不随程序复制全文。用户取得合法授权后，可把 JSON、JSONL、TXT 或 Markdown 放入 `knowledge/corpus/authorized/`，再运行 `npm run corpus:build`。

## 隐私与八字

- 姓氏、出生信息、八字和收藏默认只在本机页面处理。
- 八字和五行只作用户主动选择的民俗文化偏好，不自动推算喜用神，不断言吉凶。
- 调用 Codex 时发送当前问题、有限的对话历史、用户明确授权的资料与允许共享的八字偏好；Wiki 和完整原文由 Agent 在本机工具中自行读取。
- ChatGPT/Codex 登录令牌由 Codex CLI 保存和使用，本项目不读取、不复制也不显示令牌。
