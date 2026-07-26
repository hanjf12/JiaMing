# 嘉名文件知识库

这是给人和 LLM Agent 共同使用的文件原生知识库。入口、目录、知识页和原始语料都能用标准只读命令查看，不需要 MCP、向量数据库或专用查询程序。

## 从哪里开始

1. `llms.txt`：约一万字的精炼入口，列出所有 Wiki 页面和用途；优先 grep 定位，不要每次完整输出。
2. `wiki/index.md`：按来源、概念、比较、方法和姓名组织的互链目录。
3. `corpus/catalog.md`：四书五经、十三经及历代诗词的实际文件路径。
4. `llms-full.txt`：全部 Wiki 的合并文本，只在确实需要整体上下文时读取。

完整语料没有提交到 Git。维护者可运行 `npm run corpus:info` 查看夸克网盘固定版本，下载后用 `npm run corpus:install -- "<压缩包路径>"` 校验并安装；也可运行 `npm run corpus:sync` 从公开上游同步。

## Agent 的三步检索

### 1. Find：发现文件

首选跨平台的 ripgrep：

```bash
rg --files --no-ignore knowledge
rg --files --no-ignore knowledge/wiki
rg --files --no-ignore knowledge/corpus/vendor
```

`corpus/vendor/` 在 `.gitignore` 中。这里统一使用 `--no-ignore` 关闭忽略规则，同时继续排除隐藏的 `.git` 元数据；检查完整原文库是否安装时必须执行第三条命令，并用对应系统的回退命令复核，不能把普通 `rg --files knowledge` 的“未列出”当成“目录不存在”。

Windows 回退：

```powershell
Get-ChildItem -LiteralPath knowledge -Recurse -File -Force
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
rg -n -F --no-ignore -m 8 -B 12 -A 5 "人间有味是清欢" knowledge/corpus/vendor/chinese-poetry/宋词
```

`rg` 不可用时，Windows 可用 `Select-String`，macOS 可用 `grep -RIn`。不要用“清”“明”这类单个常见字扫描全部 34 万条语料。

当用户明确询问“珩”这类具体罕见字时，可以在 `catalog.md` 指定的目录中对该字做固定字符串搜索；Wiki 没有专页并不代表原文没有证据。

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
    ├── vendor/           # 上游原始 JSON，本机同步
    └── authorized/       # 用户有权使用的文本
```

## 引用与版权

- Wiki 引用写成 `knowledge/wiki/...md:行号`。
- 原文引用写成 `knowledge/corpus/vendor/...json:行号`，并从附近字段核对作者、篇名。
- 同一句在多个上游版本出现时，优先使用路径更明确、元数据更完整的一份，并注明版本差异。
- 在版权作品不收录目录或全文；用户自行导入 `authorized/` 时必须记录合法授权来源。
