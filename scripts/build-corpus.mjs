import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CORPUS_ROOT = path.join(ROOT, "knowledge", "corpus");
const POETRY_ROOT = path.join(CORPUS_ROOT, "vendor", "chinese-poetry");
const CLASSICS_ROOT = path.join(CORPUS_ROOT, "vendor", "chinese-classical-corpus");
const AUTHORIZED_ROOT = path.join(CORPUS_ROOT, "authorized");
const DB_FILE = path.join(CORPUS_ROOT, "classics.sqlite");
const MANIFEST_FILE = path.join(CORPUS_ROOT, "manifest.json");

async function exists(filename) {
  try {
    await stat(filename);
    return true;
  } catch {
    return false;
  }
}

async function walk(directory) {
  if (!(await exists(directory))) return [];
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory() && entry.name !== ".git") files.push(...await walk(full));
    else if (entry.isFile()) files.push(full);
  }
  return files;
}

function relativeUnix(filename, root) {
  return path.relative(root, filename).split(path.sep).join("/");
}

function classifyPoetryFile(filename) {
  const rel = relativeUnix(filename, POETRY_ROOT);
  if (/^全唐诗\/poet\.tang\./.test(rel)) return { corpus: "全唐诗", dynasty: "唐", category: "tang" };
  if (/^全唐诗\/poet\.song\./.test(rel)) return { corpus: "全宋诗", dynasty: "宋", category: "song-poetry" };
  if (/^宋词\/ci\.song\./.test(rel)) return { corpus: "全宋词", dynasty: "宋", category: "song" };
  if (rel.startsWith("元曲/")) return { corpus: "元曲", dynasty: "元", category: "yuan" };
  if (rel.startsWith("五代诗词/")) return { corpus: "五代诗词", dynasty: "五代", category: "five-dynasties" };
  if (rel.startsWith("曹操诗集/")) return { corpus: "曹操诗集", dynasty: "汉魏", category: "han-wei" };
  if (rel.startsWith("楚辞/")) return { corpus: "楚辞", dynasty: "先秦", category: "chuci" };
  if (rel.startsWith("诗经/")) return { corpus: "诗经", dynasty: "先秦", category: "shijing" };
  if (rel.startsWith("论语/")) return { corpus: "论语", dynasty: "先秦", category: "classics" };
  if (rel.startsWith("四书五经/")) return { corpus: "四书", dynasty: "先秦", category: "classics" };
  if (rel.startsWith("纳兰性德/")) return { corpus: "纳兰性德诗词", dynasty: "清", category: "qing" };
  return null;
}

function textFrom(record) {
  for (const key of ["paragraphs", "content", "para", "lines", "text"]) {
    const value = record?.[key];
    if (Array.isArray(value) && value.every(item => typeof item === "string")) return value.join("\n");
    if (typeof value === "string") return value;
  }
  return "";
}

function flattenRecords(value, context, fallbackTitle, output) {
  if (Array.isArray(value)) {
    for (const item of value) flattenRecords(item, context, fallbackTitle, output);
    return;
  }
  if (!value || typeof value !== "object") return;
  const content = textFrom(value).trim();
  if (content) {
    const title = String(value.title || value.rhythmic || value.chapter || value.section || fallbackTitle || "无题").trim();
    const author = String(value.author || context.author || "佚名").trim();
    const chapter = [value.chapter, value.section].filter(Boolean).join("·");
    output.push({
      corpus: context.corpus,
      dynasty: String(value.dynasty || context.dynasty || ""),
      category: context.category,
      title,
      author,
      chapter,
      content,
      sourceFile: context.sourceFile,
      sourceUrl: context.sourceUrl,
      license: context.license,
      status: context.status || "full-text",
    });
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (Array.isArray(nested) || (nested && typeof nested === "object")) {
      flattenRecords(nested, context, key, output);
    }
  }
}

function documentId(document) {
  return createHash("sha1")
    .update([document.corpus, document.author, document.title, document.content].join("\u0000"))
    .digest("hex");
}

function searchTokens(text) {
  const normalized = String(text || "").toLowerCase();
  const tokens = new Set(normalized.match(/[a-z0-9]{2,}/g) || []);
  for (const run of normalized.match(/[\u3400-\u9fff]+/g) || []) {
    if (run.length === 1) tokens.add(run);
    for (let width = 2; width <= 3; width += 1) {
      for (let index = 0; index <= run.length - width; index += 1) {
        tokens.add(run.slice(index, index + width));
      }
    }
  }
  return [...tokens].join(" ");
}

async function readJson(filename) {
  return JSON.parse(await readFile(filename, "utf8"));
}

async function collectChinesePoetry() {
  const records = [];
  const files = (await walk(POETRY_ROOT))
    .filter(filename => filename.toLowerCase().endsWith(".json"))
    .filter(filename => !/authors?|intro|preface/i.test(path.basename(filename)));
  let processed = 0;
  for (const filename of files) {
    const classification = classifyPoetryFile(filename);
    if (!classification) continue;
    const rel = relativeUnix(filename, POETRY_ROOT);
    const context = {
      ...classification,
      sourceFile: rel,
      sourceUrl: `https://github.com/chinese-poetry/chinese-poetry/blob/master/${rel.split("/").map(encodeURIComponent).join("/")}`,
      license: "MIT",
    };
    try {
      flattenRecords(await readJson(filename), context, path.basename(filename, ".json"), records);
    } catch (error) {
      console.warn(`跳过无法解析的文件 ${rel}：${error.message}`);
    }
    processed += 1;
    if (processed % 50 === 0) console.log(`已读取 ${processed}/${files.length} 个 chinese-poetry 文件`);
  }
  return records;
}

async function collectClassicalCorpus() {
  const records = [];
  if (!(await exists(CLASSICS_ROOT))) return records;
  const candidates = [
    path.join(CLASSICS_ROOT, "output", "corpus.jsonl"),
    ...await walk(path.join(CLASSICS_ROOT, "output", "sishu")),
    ...await walk(path.join(CLASSICS_ROOT, "output", "wujing")),
    ...await walk(path.join(CLASSICS_ROOT, "output", "shisanjing")),
  ].filter((value, index, array) => array.indexOf(value) === index);
  for (const filename of candidates) {
    if (!(await exists(filename)) || !/\.(json|jsonl)$/i.test(filename)) continue;
    const raw = await readFile(filename, "utf8");
    const values = filename.endsWith(".jsonl")
      ? raw.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line))
      : [JSON.parse(raw)];
    for (const value of values) {
      const list = Array.isArray(value) ? value : [value];
      for (const item of list) {
        if (!item || typeof item !== "object") continue;
        const source = String(item.source || item.title || "十三经");
        const isClassic = /大学|中庸|论语|孟子|诗经|尚书|礼记|周易|春秋|孝经|尔雅/.test(source);
        if (!isClassic) continue;
        const content = String(item.content || "").trim();
        if (!content) continue;
        records.push({
          corpus: source,
          dynasty: String(item.era || "先秦"),
          category: /诗经/.test(source) ? "shijing" : "classics",
          title: String(item.title || item.chapter || item.section || source),
          author: String(item.author || "佚名"),
          chapter: [item.chapter, item.subchapter, item.section].filter(Boolean).join("·"),
          content,
          sourceFile: relativeUnix(filename, CLASSICS_ROOT),
          sourceUrl: "https://github.com/gujilab/chinese-classical-corpus",
          license: "CC0-1.0",
          status: "full-text",
        });
      }
    }
  }
  return records;
}

async function collectAuthorized() {
  const records = [];
  for (const filename of await walk(AUTHORIZED_ROOT)) {
    if (/README\.md$/i.test(filename)) continue;
    const extension = path.extname(filename).toLowerCase();
    if (![".json", ".jsonl", ".txt", ".md"].includes(extension)) continue;
    const raw = await readFile(filename, "utf8");
    let values;
    if (extension === ".json") {
      const parsed = JSON.parse(raw);
      values = Array.isArray(parsed) ? parsed : [parsed];
    } else if (extension === ".jsonl") {
      values = raw.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
    } else {
      values = [{ title: path.basename(filename, extension), content: raw }];
    }
    for (const item of values) {
      const content = String(item.content || item.text || "").trim();
      if (!content) continue;
      records.push({
        corpus: String(item.source || "用户授权近现代文本"),
        dynasty: String(item.dynasty || item.period || "近现代"),
        category: "modern",
        title: String(item.title || path.basename(filename, extension)),
        author: String(item.author || "作者未注明"),
        chapter: "",
        content,
        sourceFile: relativeUnix(filename, CORPUS_ROOT),
        sourceUrl: "",
        license: String(item.license || "user-authorized"),
        status: "authorized-full-text",
      });
    }
  }
  return records;
}

async function collectModernMetadata() {
  const catalog = await readJson(path.join(CORPUS_ROOT, "modern-catalog.json"));
  return catalog.map(item => ({
    corpus: "毛泽东诗词目录",
    dynasty: "近现代",
    category: "modern",
    title: item.title,
    author: item.author,
    chapter: item.year,
    content: `目录记录：${item.title}，作者${item.author}，创作年份${item.year}。因著作权保护，程序未内置全文；取得合法授权后可导入本地授权区。`,
    sourceFile: "modern-catalog.json",
    sourceUrl: "https://www.npc.gov.cn/c2/c30834/202011/t20201119_308796.html",
    license: "metadata-only",
    status: "metadata-only",
  }));
}

await mkdir(CORPUS_ROOT, { recursive: true });
const poetry = await collectChinesePoetry();
const classics = await collectClassicalCorpus();
const authorized = await collectAuthorized();
const modernMetadata = await collectModernMetadata();
const all = [...poetry, ...classics, ...authorized, ...modernMetadata];
if (!all.length) throw new Error("没有发现可构建的原文语料，请先运行 npm run corpus:sync");

if (await exists(DB_FILE)) await rm(DB_FILE, { force: true });
const database = new DatabaseSync(DB_FILE);
database.exec(`
  PRAGMA journal_mode = OFF;
  PRAGMA synchronous = OFF;
  PRAGMA temp_store = MEMORY;
  CREATE TABLE documents (
    id TEXT NOT NULL UNIQUE,
    corpus TEXT NOT NULL,
    dynasty TEXT,
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    author TEXT,
    chapter TEXT,
    content TEXT NOT NULL,
    source_file TEXT,
    source_url TEXT,
    license TEXT,
    status TEXT NOT NULL
  );
  CREATE INDEX documents_category ON documents(category);
  CREATE INDEX documents_author ON documents(author);
  CREATE INDEX documents_title ON documents(title);
  CREATE VIRTUAL TABLE document_terms USING fts5(tokens, content='');
`);
const insert = database.prepare(`
  INSERT OR IGNORE INTO documents
  (id, corpus, dynasty, category, title, author, chapter, content, source_file, source_url, license, status)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertTerms = database.prepare("INSERT INTO document_terms(rowid, tokens) VALUES (?, ?)");
function insertBatch(documents) {
  database.exec("BEGIN");
  try {
    for (const document of documents) {
      const result = insert.run(
        documentId(document),
        document.corpus,
        document.dynasty,
        document.category,
        document.title,
        document.author,
        document.chapter,
        document.content,
        document.sourceFile,
        document.sourceUrl,
        document.license,
        document.status,
      );
      if (result.changes) {
        insertTerms.run(
          result.lastInsertRowid,
          searchTokens(`${document.title} ${document.author} ${document.corpus} ${document.chapter} ${document.content}`),
        );
      }
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}
for (let index = 0; index < all.length; index += 1000) {
  insertBatch(all.slice(index, index + 1000));
  if (index % 20000 === 0) console.log(`已索引 ${Math.min(index + 1000, all.length)}/${all.length} 条原文`);
}
database.exec("PRAGMA optimize;");
const total = Number(database.prepare("SELECT count(*) AS total FROM documents").get().total);
const byCorpus = database.prepare("SELECT corpus, count(*) AS count FROM documents GROUP BY corpus ORDER BY count DESC").all();
const byCategory = database.prepare("SELECT category, count(*) AS count FROM documents GROUP BY category ORDER BY count DESC").all();
database.close();

const manifest = {
  builtAt: new Date().toISOString(),
  documents: total,
  sourceRecords: {
    chinesePoetry: poetry.length,
    classicalCorpus: classics.length,
    authorized: authorized.length,
    modernMetadata: modernMetadata.length,
  },
  byCorpus,
  byCategory,
  database: "classics.sqlite",
  architecture: "SQLite FTS5 + Wiki hybrid retrieval",
  modernCopyrightPolicy: "metadata-only unless user-authorized",
};
await writeFile(MANIFEST_FILE, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`原文索引构建完成：${total} 条作品/章节`);
