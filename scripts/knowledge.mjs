import {
  knowledgeStatus,
  readWiki,
  searchOriginalCorpus,
  searchWiki,
} from "../src/knowledge.mjs";

function option(name, fallback = "") {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
}

function limit() {
  return Math.max(1, Math.min(Number(option("limit", 6)) || 6, 12));
}

async function main() {
  const command = process.argv[2] || "help";
  let result;
  if (command === "status") result = await knowledgeStatus();
  else if (command === "wiki-search") {
    result = await searchWiki(option("query"), {
      scope: option("scope", "all"),
      limit: limit(),
    });
  } else if (command === "wiki-read") result = await readWiki(option("id"));
  else if (command === "corpus-search") {
    result = await searchOriginalCorpus(option("query"), {
      scope: option("scope", "all"),
      limit: limit(),
    });
  } else {
    process.stdout.write([
      "嘉名知识库工具",
      "",
      "node scripts/knowledge.mjs status",
      "node scripts/knowledge.mjs wiki-search --query \"连姓音韵\" --limit 6",
      "node scripts/knowledge.mjs wiki-read --id concept-full-name-phonology",
      "node scripts/knowledge.mjs corpus-search --query \"人间有味是清欢\" --scope song",
      "",
    ].join("\n"));
    return;
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
