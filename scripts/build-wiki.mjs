import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const KNOWLEDGE = path.join(ROOT, "knowledge");
const RAW = path.join(KNOWLEDGE, "raw");
const WIKI = path.join(KNOWLEDGE, "wiki");
const RUNTIME = path.join(KNOWLEDGE, "runtime");
const HTML_FILES = [path.join(ROOT, "public", "index.html")];
const BUILD_DATE = "2026-07-26";

function extractArray(source, variableName) {
  const declaration = `const ${variableName} =`;
  const declarationIndex = source.indexOf(declaration);
  if (declarationIndex < 0) throw new Error(`未找到 ${variableName}`);
  const start = source.indexOf("[", declarationIndex + declaration.length);
  if (start < 0) throw new Error(`${variableName} 缺少数组起始符`);

  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "[") depth += 1;
    if (char === "]") {
      depth -= 1;
      if (depth === 0) {
        const literal = source.slice(start, index + 1);
        return vm.runInNewContext(`(${literal})`, Object.create(null));
      }
    }
  }
  throw new Error(`${variableName} 数组未闭合`);
}

function yamlValue(value) {
  return JSON.stringify(String(value));
}

function yamlList(values) {
  return `[${values.map(yamlValue).join(", ")}]`;
}

function wikilinks(ids, pageMap) {
  return ids
    .filter(id => pageMap.has(id))
    .map(id => `[[${id}|${pageMap.get(id).title}]]`)
    .join("、");
}

function sourcePageId(item) {
  if (item.cat === "tang") return "source-tang-poetry";
  if (item.cat === "song") return "source-song-ci";
  if (item.cat === "shijing") return "source-shijing";
  if (item.cat === "chuci") return "source-chuci";
  if (item.work.includes("论语")) return "source-lunyu";
  if (item.work.includes("大学")) return "source-daxue";
  if (item.work.includes("中庸")) return "source-zhongyong";
  if (item.work.includes("周易")) return "source-zhouyi";
  if (item.work.includes("礼记")) return "source-liji";
  return "concept-source-verification";
}

const guideLinks = {
  g01: ["concept-direct-or-inspired", "concept-source-verification"],
  g02: ["concept-full-name-phonology", "concept-tone-pattern"],
  g03: ["concept-standard-characters", "concept-rare-characters"],
  g04: ["concept-compound-surname", "comparison-one-vs-two-character"],
  g05: ["concept-dialect-homophone", "concept-full-name-phonology"],
  g06: ["comparison-classic-vs-practical", "concept-long-term-use"],
  g07: ["concept-gender-temperament", "concept-long-term-use"],
  g08: ["concept-generation-name", "comparison-one-vs-two-character"],
  g09: ["concept-bazi-boundary", "concept-five-elements"],
  g10: ["concept-long-term-use", "concept-standard-characters"],
};

function pageMarkdown(page, pageMap) {
  const frontmatter = [
    "---",
    `id: ${yamlValue(page.id)}`,
    `type: ${yamlValue(page.type)}`,
    `title: ${yamlValue(page.title)}`,
    `category: ${yamlValue(page.category)}`,
    `source: ${yamlValue(page.source)}`,
    `status: ${yamlValue(page.status)}`,
    `updated: ${yamlValue(page.updated)}`,
    `keywords: ${yamlList(page.keywords)}`,
    ...(page.recordId ? [`record_id: ${yamlValue(page.recordId)}`] : []),
    "---",
  ];
  const related = wikilinks(page.links, pageMap) || "暂无";
  const backlinks = wikilinks(page.backlinks, pageMap) || "暂无";

  if (page.type === "name") {
    const item = page.item;
    return `${frontmatter.join("\n")}

# ${page.title}

- 拼音：${item.p}
- 类别：${item.tag}
- 出处：${item.work}
- 气质：${item.t.join("、")}

## 原句

> ${item.q}

## 字义

${item.cm.map(value => `- ${value}`).join("\n")}

## 整体寓意

${item.m}

## 关联

- 前向链接：${related}
- 反向链接：${backlinks}

> 本页提供文化灵感，不代表户籍审核结论；八字与五行只作用户主动选择的民俗偏好。
`;
  }

  return `${frontmatter.join("\n")}

# ${page.title}

${page.summary}

## 说明

${page.body}

## 关联

- 前向链接：${related}
- 反向链接：${backlinks}
`;
}

function chunkText(text, limit = 700) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) return [normalized];
  const sentences = normalized.split(/(?<=[。！？；])/u);
  const chunks = [];
  let current = "";
  for (const sentence of sentences) {
    if (current && current.length + sentence.length > limit) {
      chunks.push(current.trim());
      current = "";
    }
    current += sentence;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

function pageFolder(type) {
  return {
    name: "names",
    method: "methods",
    source: "sources",
    concept: "concepts",
    comparison: "comparisons",
  }[type];
}

async function ensureEmptyGeneratedFolders() {
  const folders = ["names", "methods", "sources", "concepts", "comparisons"];
  await mkdir(WIKI, { recursive: true });
  for (const folder of folders) {
    const target = path.resolve(WIKI, folder);
    if (!target.startsWith(`${path.resolve(WIKI)}${path.sep}`)) {
      throw new Error(`拒绝清理知识库目录之外的路径：${target}`);
    }
    await rm(target, { recursive: true, force: true });
    await mkdir(target, { recursive: true });
  }
  await mkdir(RUNTIME, { recursive: true });
}

async function updateEmbeddedBundle(bundle) {
  const startMarker = "/* WIKI_BUNDLE_START */";
  const endMarker = "/* WIKI_BUNDLE_END */";
  const block = `${startMarker}
      const WIKI_META = ${JSON.stringify(bundle.meta)};
      const WIKI_CHUNKS = ${JSON.stringify(bundle.chunks)};
      ${endMarker}`;

  for (const filename of HTML_FILES) {
    const html = await readFile(filename, "utf8");
    const start = html.indexOf(startMarker);
    const end = html.indexOf(endMarker);
    if (start < 0 || end < start) {
      throw new Error(`${path.basename(filename)} 缺少 Wiki 注入标记`);
    }
    const next = `${html.slice(0, start)}${block}${html.slice(end + endMarker.length)}`;
    await writeFile(filename, next, "utf8");
  }
}

const canonicalHtml = await readFile(HTML_FILES[0], "utf8");
const names = extractArray(canonicalHtml, "NAMES");
const guides = extractArray(canonicalHtml, "GUIDE_DOCS");
const editorial = JSON.parse(await readFile(path.join(RAW, "editorial.json"), "utf8"));

const namePages = names.map(item => ({
  id: `name-${item.id}`,
  type: "name",
  title: item.n,
  category: item.cat,
  tag: item.tag,
  source: item.work,
  status: "verified",
  updated: BUILD_DATE,
  recordId: item.id,
  item,
  summary: `${item.n}（${item.p}），出自${item.work}。`,
  body: `原句：${item.q} 字义：${item.cm.join("；")}。整体寓意：${item.m}`,
  keywords: [item.n, item.p, item.tag, item.work, ...item.t, ...item.cm.map(value => value.split("：")[0])],
  links: [sourcePageId(item), "concept-full-name-phonology", "concept-long-term-use"],
}));

const methodPages = guides.map(item => ({
  id: `method-${item.id}`,
  type: "method",
  title: item.title,
  category: item.cat,
  tag: item.tag,
  source: item.source,
  status: "verified",
  updated: BUILD_DATE,
  summary: item.content.split("。")[0] + "。",
  body: item.content,
  keywords: [item.title, item.tag, item.source.replace(/^.*·/, "")],
  links: guideLinks[item.id] || ["concept-long-term-use"],
}));

const editorialPages = editorial.map(item => ({
  ...item,
  updated: BUILD_DATE,
  keywords: Array.isArray(item.keywords) ? item.keywords : [],
  links: Array.isArray(item.links) ? item.links : [],
}));

const pages = [...namePages, ...methodPages, ...editorialPages];
const pageMap = new Map(pages.map(page => [page.id, page]));
for (const page of pages) page.backlinks = [];
for (const page of pages) {
  for (const link of page.links) {
    if (pageMap.has(link)) pageMap.get(link).backlinks.push(page.id);
  }
}

await ensureEmptyGeneratedFolders();
await writeFile(path.join(RAW, "names.json"), `${JSON.stringify(names, null, 2)}\n`, "utf8");
await writeFile(path.join(RAW, "guides.json"), `${JSON.stringify(guides, null, 2)}\n`, "utf8");

for (const page of pages) {
  const folder = pageFolder(page.type);
  await writeFile(path.join(WIKI, folder, `${page.id}.md`), pageMarkdown(page, pageMap), "utf8");
}

const chunks = pages.flatMap(page => {
  const text = page.type === "name"
    ? `姓名：${page.item.n}。拼音：${page.item.p}。原句：${page.item.q}。字义：${page.item.cm.join("；")}。整体寓意：${page.item.m}。气质：${page.item.t.join("、")}。关联知识：${page.links.map(id => pageMap.get(id)?.title).filter(Boolean).join("、")}。`
    : `${page.summary} ${page.body}`;
  return chunkText(text).map((content, index) => ({
    id: `${page.id}:chunk-${index + 1}`,
    pageId: page.id,
    chunkIndex: index + 1,
    title: page.title,
    category: page.category,
    tag: page.tag,
    source: page.source,
    type: page.type,
    status: page.status,
    verified: page.status === "verified",
    recordId: page.recordId || "",
    keywords: page.keywords,
    links: page.links,
    backlinks: page.backlinks,
    content,
  }));
});

const edges = [];
for (const page of pages) {
  for (const target of page.links) {
    edges.push({ source: page.id, target, type: "wikilink" });
  }
}
const categoryCounts = Object.fromEntries(
  [...new Set(pages.map(page => page.category))]
    .sort()
    .map(category => [category, pages.filter(page => page.category === category).length]),
);
const typeCounts = Object.fromEntries(
  [...new Set(pages.map(page => page.type))]
    .sort()
    .map(type => [type, pages.filter(page => page.type === type).length]),
);
const contentHash = createHash("sha256")
  .update(JSON.stringify({ names, guides, editorial }))
  .digest("hex")
  .slice(0, 12);
const meta = {
  architecture: "LLM Wiki",
  version: contentHash,
  builtAt: BUILD_DATE,
  pages: pages.length,
  chunks: chunks.length,
  links: edges.length,
  names: namePages.length,
  methods: methodPages.length,
  sources: editorialPages.filter(page => page.type === "source").length,
  concepts: editorialPages.filter(page => page.type === "concept").length,
  comparisons: editorialPages.filter(page => page.type === "comparison").length,
  categoryCounts,
  typeCounts,
};
const bundle = { meta, chunks };

await writeFile(path.join(RUNTIME, "wiki-bundle.json"), `${JSON.stringify(bundle, null, 2)}\n`, "utf8");
await writeFile(
  path.join(RUNTIME, "graph.json"),
  `${JSON.stringify({
    nodes: pages.map(page => ({ id: page.id, title: page.title, type: page.type, category: page.category })),
    edges,
  }, null, 2)}\n`,
  "utf8",
);

const grouped = ["source", "concept", "comparison", "method", "name"];
const indexSections = grouped.map(type => {
  const title = { source: "典籍与来源", concept: "方法概念", comparison: "方案比较", method: "原有方法知识", name: "姓名候选" }[type];
  const links = pages
    .filter(page => page.type === type)
    .map(page => `- [[${page.id}|${page.title}]] · ${page.category} · ${page.status}`)
    .join("\n");
  return `## ${title}\n\n${links}`;
}).join("\n\n");
await writeFile(
  path.join(WIKI, "index.md"),
  `# 嘉名知识目录\n\n> 版本 ${meta.version} · ${meta.pages} 页 · ${meta.chunks} 检索块 · ${meta.links} 条关联\n\n${indexSections}\n`,
  "utf8",
);
await writeFile(
  path.join(WIKI, "overview.md"),
  `# 嘉名知识库概览

本库采用“原始资料 → 互链 Wiki → 浏览器检索包”的三层结构。

| 类型 | 数量 |
| --- | ---: |
| 姓名候选 | ${meta.names} |
| 原有方法页 | ${meta.methods} |
| 典籍与来源页 | ${meta.sources} |
| 方法概念页 | ${meta.concepts} |
| 方案比较页 | ${meta.comparisons} |
| 总页面 | ${meta.pages} |
| 检索块 | ${meta.chunks} |
| Wiki 关联 | ${meta.links} |

从 [[concept-source-verification|出处核验]]、[[concept-full-name-phonology|连姓音韵]]、[[concept-long-term-use|长期使用检查]] 开始，可以快速了解本库的取名判断框架。
`,
  "utf8",
);

const logFile = path.join(WIKI, "log.md");
let log = "# 知识库构建日志\n";
try {
  log = await readFile(logFile, "utf8");
} catch {}
if (!log.includes(`版本 ${meta.version}`)) {
  log += `\n- ${BUILD_DATE}：版本 ${meta.version}，编译 ${meta.pages} 页、${meta.chunks} 块、${meta.links} 条关联。\n`;
}
await writeFile(logFile, log, "utf8");

const llmsIndex = pages
  .map(page => `- [${page.title}](wiki/${pageFolder(page.type)}/${page.id}.md): ${page.summary}`)
  .join("\n");
await writeFile(
  path.join(KNOWLEDGE, "llms.txt"),
  `# 嘉名本地知识库\n\n> 中文宝宝起名的可追溯、互链知识库。\n\n- [Agent 文件检索指南](README.md)\n- [知识库目标](purpose.md)\n- [数据结构](schema.md)\n- [总目录](wiki/index.md)\n- [概览](wiki/overview.md)\n- [完整语料路径表](corpus/catalog.md)\n- [语料构建清单](corpus/manifest.json)\n- [近现代作品目录](corpus/modern-catalog.json)\n\n## 页面\n\n${llmsIndex}\n`,
  "utf8",
);
await writeFile(
  path.join(KNOWLEDGE, "llms-full.txt"),
  `${pages.map(page => pageMarkdown(page, pageMap)).join("\n\n---\n\n")}\n`,
  "utf8",
);

await updateEmbeddedBundle(bundle);

console.log(`Wiki 构建完成：${meta.pages} 页，${meta.chunks} 块，${meta.links} 条关联，版本 ${meta.version}`);
