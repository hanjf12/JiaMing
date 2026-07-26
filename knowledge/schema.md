# 嘉名 Wiki Schema

每个知识页使用 YAML frontmatter，正文使用 Markdown 与 `[[wikilink]]`。

## 必填字段

| 字段 | 含义 |
| --- | --- |
| `id` | 全库唯一、稳定的 ASCII 标识 |
| `type` | `name`、`method`、`source`、`concept`、`comparison` 之一 |
| `title` | 页面标题 |
| `category` | `classics`、`tang`、`song`、`shijing`、`chuci`、`guide` |
| `source` | 证据来源或编辑责任说明 |
| `status` | `verified`、`review`、`draft` |
| `updated` | `YYYY-MM-DD` |
| `keywords` | 用于检索的关键词列表 |

姓名页还必须包含 `record_id`、拼音、原句、字义和整体寓意。

## 链接规则

- 使用 `[[page-id|显示文字]]`。
- 姓名页至少链接到一个来源页和一个方法/概念页。
- 来源页应链接到来源核验方法；方法页可链接到相关概念或比较页。
- 构建时生成反向链接，运行时对直接命中页面的一跳邻居加权。

## 证据等级

- `verified`：程序已有明确篇名/作者/原句，且作为可追溯候选使用。
- `review`：编辑性方法知识或来源概览，需要持续复核。
- `draft`：尚未完成核验，不进入默认严格回答。

## 分块规则

- 一个姓名页通常一个检索块。
- 较长方法页按二级标题或约 700 汉字切块。
- 每块继承页面元数据与链接，保留 `pageId` 和 `chunkIndex`。

## 冲突与不确定性

用以下显式标记记录：

- `<!-- CONTRADICTION: ... -->`
- `<!-- NEEDS_REVIEW: ... -->`
- `<!-- SOURCE_GAP: ... -->`

`wiki:lint` 会把这些标记纳入报告。
