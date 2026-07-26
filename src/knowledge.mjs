import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { corpusStatus, searchCorpus } from "./corpus.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const KNOWLEDGE = join(ROOT, "knowledge");
const BUNDLE_FILE = join(KNOWLEDGE, "runtime", "wiki-bundle.json");
const MAX_LIMIT = 12;

function normalize(text) {
  return String(text || "").toLowerCase().replace(/\s+/g, "");
}

function terms(text) {
  const value = normalize(text);
  const result = new Set(value.match(/[a-z0-9]{2,}/g) || []);
  for (const run of value.match(/[\u3400-\u9fff]+/g) || []) {
    for (let width = Math.min(4, run.length); width >= 1; width -= 1) {
      for (let index = 0; index <= run.length - width; index += 1) {
        result.add(run.slice(index, index + width));
      }
    }
  }
  return [...result].slice(0, 64);
}

async function loadBundle() {
  return JSON.parse(await readFile(BUNDLE_FILE, "utf8"));
}

function wikiSearch(bundle, query, { scope = "all", limit = 6 } = {}) {
  const queryTerms = terms(query);
  const normalizedQuery = normalize(query);
  if (!queryTerms.length) return [];
  return bundle.chunks
    .filter((chunk) =>
      scope === "all"
      || scope === "wiki"
      || chunk.category === scope
      || chunk.type === scope,
    )
    .map((chunk) => {
      const title = normalize(chunk.title);
      const source = normalize(chunk.source);
      const keywordText = normalize((chunk.keywords || []).join(" "));
      const content = normalize(chunk.content);
      let score = 0;
      if (normalizedQuery && title.includes(normalizedQuery)) score += 40;
      for (const term of queryTerms) {
        if (title.includes(term)) score += 12;
        if (source.includes(term)) score += 7;
        if (keywordText.includes(term)) score += 6;
        if (content.includes(term)) score += term.length >= 2 ? 3 : 0.4;
      }
      return { chunk, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ chunk, score }) => ({
      pageId: chunk.pageId,
      title: chunk.title,
      source: chunk.source,
      category: chunk.category,
      type: chunk.type,
      status: chunk.status,
      verified: Boolean(chunk.verified),
      content: chunk.content,
      links: chunk.links || [],
      backlinks: chunk.backlinks || [],
      score: Number(score.toFixed(2)),
    }));
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

async function readWikiPage(bundle, pageId) {
  if (!/^[a-z0-9-]+$/i.test(pageId)) throw new Error("无效的 Wiki 页面 ID");
  if (pageId === "index" || pageId === "overview" || pageId === "log") {
    return {
      pageId,
      path: `knowledge/wiki/${pageId}.md`,
      markdown: await readFile(join(KNOWLEDGE, "wiki", `${pageId}.md`), "utf8"),
    };
  }
  const chunk = bundle.chunks.find((item) => item.pageId === pageId);
  if (!chunk) throw new Error(`找不到 Wiki 页面：${pageId}`);
  const folder = pageFolder(chunk.type);
  if (!folder) throw new Error(`不支持的 Wiki 页面类型：${chunk.type}`);
  const relativePath = `knowledge/wiki/${folder}/${pageId}.md`;
  return {
    pageId,
    path: relativePath,
    markdown: await readFile(join(ROOT, relativePath), "utf8"),
  };
}

export async function knowledgeStatus() {
  const bundle = await loadBundle();
  return {
    ok: true,
    wiki: bundle.meta,
    corpus: corpusStatus(),
    tools: ["knowledge_status", "wiki_search", "wiki_read", "corpus_search"],
  };
}

export async function searchWiki(query, options = {}) {
  const bundle = await loadBundle();
  return {
    query,
    results: wikiSearch(bundle, query, {
      scope: options.scope || "all",
      limit: Math.max(1, Math.min(Number(options.limit) || 6, MAX_LIMIT)),
    }),
  };
}

export async function readWiki(pageId) {
  return readWikiPage(await loadBundle(), pageId);
}

export async function searchOriginalCorpus(query, options = {}) {
  return {
    query,
    results: searchCorpus(query, {
      scope: options.scope || "all",
      limit: Math.max(1, Math.min(Number(options.limit) || 6, MAX_LIMIT)),
    }),
  };
}
