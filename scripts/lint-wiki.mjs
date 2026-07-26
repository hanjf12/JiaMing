import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const KNOWLEDGE = path.join(ROOT, "knowledge");
const RUNTIME = path.join(KNOWLEDGE, "runtime");
const bundle = JSON.parse(await readFile(path.join(RUNTIME, "wiki-bundle.json"), "utf8"));
const graph = JSON.parse(await readFile(path.join(RUNTIME, "graph.json"), "utf8"));

const errors = [];
const warnings = [];
const nodeIds = new Set();
for (const node of graph.nodes) {
  if (nodeIds.has(node.id)) errors.push(`重复页面 ID：${node.id}`);
  nodeIds.add(node.id);
  if (!node.title || !node.type || !node.category) errors.push(`页面字段不完整：${node.id}`);
}

const chunkIds = new Set();
const pagesWithChunks = new Set();
for (const chunk of bundle.chunks) {
  if (chunkIds.has(chunk.id)) errors.push(`重复分块 ID：${chunk.id}`);
  chunkIds.add(chunk.id);
  pagesWithChunks.add(chunk.pageId);
  for (const field of ["pageId", "title", "category", "source", "type", "status", "content"]) {
    if (!chunk[field]) errors.push(`分块 ${chunk.id} 缺少 ${field}`);
  }
  if (chunk.status === "draft") warnings.push(`草稿进入运行包：${chunk.pageId}`);
  if (chunk.content.length < 20) warnings.push(`内容过短：${chunk.id}`);
}

for (const edge of graph.edges) {
  if (!nodeIds.has(edge.source)) errors.push(`关联起点不存在：${edge.source}`);
  if (!nodeIds.has(edge.target)) errors.push(`断开的 Wiki 链接：${edge.source} -> ${edge.target}`);
}
for (const id of nodeIds) {
  if (!pagesWithChunks.has(id)) errors.push(`页面没有检索块：${id}`);
  const connected = graph.edges.some(edge => edge.source === id || edge.target === id);
  if (!connected) warnings.push(`孤立页面：${id}`);
}

const html = await readFile(path.join(ROOT, "public", "index.html"), "utf8");
const markerMatch = html.match(/const WIKI_META = (\{.*?\});\s*const WIKI_CHUNKS =/s);
if (!markerMatch) {
  errors.push("网页缺少编译后的 WIKI_META");
} else {
  const embeddedMeta = JSON.parse(markerMatch[1]);
  if (embeddedMeta.version !== bundle.meta.version) errors.push("网页内嵌知识版本与运行包不一致");
  if (embeddedMeta.chunks !== bundle.chunks.length) errors.push("网页内嵌分块数与运行包不一致");
}

const report = {
  version: bundle.meta.version,
  pages: graph.nodes.length,
  chunks: bundle.chunks.length,
  links: graph.edges.length,
  errors,
  warnings,
  ok: errors.length === 0,
};
await mkdir(path.join(KNOWLEDGE, "reports"), { recursive: true });
await writeFile(path.join(KNOWLEDGE, "reports", "lint.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");

if (errors.length) {
  console.error(`Wiki 校验失败：${errors.length} 个错误，${warnings.length} 个警告`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Wiki 校验通过：${report.pages} 页，${report.chunks} 块，${report.links} 条关联，${warnings.length} 个警告`);
}
