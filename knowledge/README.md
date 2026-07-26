# 嘉名文件知识库

这是给人和 LLM Agent 共同使用的文件原生知识库。入口、目录、知识页和原始语料都能用标准只读命令查看，不需要 MCP、向量数据库或专用查询程序。

## 从哪里开始

1. `llms.txt`：约一万字的精炼入口，列出所有 Wiki 页面和用途；优先 grep 定位，不要每次完整输出。
2. `wiki/index.md`：按来源、概念、比较、方法和姓名组织的互链目录。
3. `corpus/catalog.md`：四书五经、十三经及历代诗词的实际文件路径。
4. `corpus/manifest.json`：本机语料数量与构建状态。
5. `llms-full.txt`：全部 Wiki 的合并文本，只在确实需要整体上下文时读取。

## Agent 的三步检索

### 1. Find：发现文件

首选跨平台的 ripgrep：

```bash
rg --files knowledge
rg --files knowledge/wiki
```

Windows 回退：

```powershell
Get-ChildItem knowledge -Recurse -File
```

macOS 回退：

```bash
find knowledge -type f
```

### 2. Grep：定位证据

先搜小型 Wiki：

```bash
rg -n -i -m 20 "连姓|音韵" knowledge/wiki knowledge/llms.txt
```

核对原句时使用固定字符串，并按 `corpus/catalog.md` 缩小目录：

```bash
rg -n -F -m 8 -B 12 -A 5 "人间有味是清欢" knowledge/corpus/vendor/chinese-poetry/宋词
```

`rg` 不可用时，Windows 可用 `Select-String`，macOS 可用 `grep -RIn`。不要用“清”“明”这类单个常见字扫描全部 34 万条语料。

### 3. Read：读取局部

Windows：

```powershell
Get-Content -Encoding UTF8 knowledge/wiki/concepts/concept-full-name-phonology.md
```

macOS：

```bash
sed -n '1,220p' knowledge/wiki/concepts/concept-full-name-phonology.md
```

原始 JSON 较大，通常直接使用 `rg` 的前后文即可，不要整文件加载。引用时保留命中的相对路径和行号。

## 目录分层

```text
knowledge/
├── llms.txt              # LLM 小地图
├── llms-full.txt         # Wiki 合并全文
├── raw/                  # 编辑输入
├── wiki/                 # 人与 Agent 可读的 Markdown
├── runtime/              # 浏览器用的编译检索包
└── corpus/
    ├── catalog.md        # 语料路径表
    ├── manifest.json     # 构建统计
    ├── vendor/           # 上游原始 JSON，本机同步
    ├── authorized/       # 用户有权使用的近现代文本
    └── classics.sqlite   # 仅供网页诊断检索，不供 Agent 使用
```

## 引用与版权

- Wiki 引用写成 `knowledge/wiki/...md:行号`。
- 原文引用写成 `knowledge/corpus/vendor/...json:行号`，并从附近字段核对作者、篇名。
- 同一句在多个上游版本出现时，优先使用路径更明确、元数据更完整的一份，并注明版本差异。
- 近现代仍受保护作品默认只有目录元数据；除非用户已取得合法授权并放入 `authorized/`，否则不复制全文。
