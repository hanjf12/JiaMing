import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CORPUS_ROOT = path.join(ROOT, "knowledge", "corpus");
const DATABASE_FILE = path.join(CORPUS_ROOT, "classics.sqlite");
const MANIFEST_FILE = path.join(CORPUS_ROOT, "manifest.json");
let database;

const STOP_PHRASES = new Set([
  "宝宝", "名字", "姓名", "起名", "取名", "推荐", "适合", "一个", "两个",
  "女孩", "男孩", "女宝", "男宝", "姓氏", "给我", "想要", "希望", "有没有",
  "怎么", "怎样", "如何", "比较", "可以", "这个", "那个", "经典", "原文",
]);

function getDatabase() {
  if (!existsSync(DATABASE_FILE)) return null;
  if (!database) {
    database = new DatabaseSync(DATABASE_FILE, { readOnly: true });
    database.exec("PRAGMA query_only = ON;");
  }
  return database;
}

function queryTerms(text) {
  const normalized = String(text || "").toLowerCase();
  const terms = new Set(normalized.match(/[a-z0-9]{2,}/g) || []);
  for (const run of normalized.match(/[\u3400-\u9fff]+/g) || []) {
    for (let width = 3; width >= 2; width -= 1) {
      for (let index = 0; index <= run.length - width; index += 1) {
        const term = run.slice(index, index + width);
        if (!STOP_PHRASES.has(term)) terms.add(term);
      }
    }
  }
  return [...terms]
    .filter(term => ![...STOP_PHRASES].some(stop => stop.includes(term) && term.length <= 2))
    .slice(0, 24);
}

const SCOPE_CATEGORIES = {
  classics: ["classics", "shijing"],
  tang: ["tang"],
  song: ["song"],
  "song-poetry": ["song-poetry"],
  shijing: ["shijing"],
  chuci: ["chuci"],
  "five-dynasties": ["five-dynasties"],
  yuan: ["yuan"],
  qing: ["qing"],
  "han-wei": ["han-wei"],
  modern: ["modern"],
};

export function corpusStatus() {
  if (!existsSync(MANIFEST_FILE) || !existsSync(DATABASE_FILE)) {
    return { available: false, documents: 0, message: "完整原文库尚未构建" };
  }
  try {
    return {
      available: true,
      ...JSON.parse(readFileSync(MANIFEST_FILE, "utf8")),
    };
  } catch {
    return { available: false, documents: 0, message: "原文库清单不可读" };
  }
}

export function searchCorpus(query, { scope = "all", limit = 5 } = {}) {
  const db = getDatabase();
  if (!db) return [];
  const terms = queryTerms(query);
  if (!terms.length) return [];
  const match = terms.map(term => `"${term.replaceAll('"', '""')}"`).join(" OR ");
  const categories = SCOPE_CATEGORIES[scope] || [];
  const categoryClause = categories.length
    ? ` AND d.category IN (${categories.map(() => "?").join(", ")})`
    : "";
  const statement = db.prepare(`
    SELECT
      d.id, d.corpus, d.dynasty, d.category, d.title, d.author, d.chapter,
      d.content, d.source_file, d.source_url, d.license, d.status,
      bm25(document_terms) AS rank
    FROM document_terms
    JOIN documents d ON d.rowid = document_terms.rowid
    WHERE document_terms MATCH ?${categoryClause}
    ORDER BY rank
    LIMIT ?
  `);
  return statement.all(match, ...categories, Math.max(1, Math.min(Number(limit) || 5, 12))).map(item => ({
    id: `corpus-${item.id}`,
    pageId: `corpus-${item.id}`,
    title: item.title,
    category: item.category,
    tag: item.corpus,
    source: [item.dynasty, item.author, item.corpus, item.chapter].filter(Boolean).join(" · "),
    type: "corpus",
    status: item.status,
    verified: false,
    content: item.content.slice(0, 1800),
    sourceUrl: item.source_url,
    license: item.license,
    score: Math.abs(Number(item.rank) || 0),
    links: [],
    backlinks: [],
  }));
}
