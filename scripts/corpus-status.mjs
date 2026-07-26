import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "knowledge", "corpus");
try {
  const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"));
  const database = await stat(path.join(root, manifest.database));
  console.log(`原文库：${manifest.documents} 条，索引 ${(database.size / 1024 / 1024).toFixed(1)} MB`);
  for (const item of manifest.byCorpus.slice(0, 20)) console.log(`- ${item.corpus}: ${item.count}`);
} catch {
  console.log("原文库尚未构建，请运行 npm run corpus:sync");
  process.exitCode = 1;
}
