import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);

test("Codex bridge protects remote AI and uses a read-only ephemeral exec", async () => {
  const source = await readFile(
    new URL("../tools/codex-local-server.mjs", import.meta.url),
    "utf8",
  );

  assert.match(source, /process\.env\.JIAMING_HOST \|\| "127\.0\.0\.1"/);
  assert.match(source, /isLoopbackRequest/);
  assert.match(source, /JIAMING_ALLOW_LAN_AI/);
  assert.match(source, /\/api\/kb\/search/);
  assert.match(source, /searchCorpus/);
  assert.match(source, /"exec"/);
  assert.match(source, /"--ephemeral"/);
  assert.match(source, /"--sandbox", "read-only"/);
  assert.match(source, /"--ignore-rules"/);
  assert.match(source, /"--output-schema", OUTPUT_SCHEMA/);
  assert.match(source, /mcp_servers\.jiaming\.command/);
  assert.match(source, /knowledge_status/);
  assert.match(source, /wiki_search/);
  assert.match(source, /wiki_read/);
  assert.match(source, /corpus_search/);
  assert.match(source, /必须自主读取项目的 AGENTS\.md/);
  assert.doesNotMatch(source, /不要调用工具或访问文件/);
  assert.doesNotMatch(source, /dangerously-bypass-approvals-and-sandbox|--yolo/);
});

test("knowledge agent tools search Wiki and expose linked pages", async () => {
  const tool = new URL("../tools/knowledge-agent-tools.mjs", import.meta.url);
  const { stdout } = await run(process.execPath, [
    fileURLToPath(tool),
    "wiki-search",
    "--query", "连姓音韵",
    "--limit", "3",
  ], { encoding: "utf8" });
  const result = JSON.parse(stdout);
  assert.ok(result.results.length > 0);
  assert.ok(result.results.some((item) => item.pageId === "concept-full-name-phonology"));
  assert.ok(result.results.every((item) => Array.isArray(item.links)));
});

test("full corpus builder keeps modern copyrighted text metadata-only", async () => {
  const source = await readFile(
    new URL("../tools/build-corpus-index.mjs", import.meta.url),
    "utf8",
  );
  assert.match(source, /modernMetadata/);
  assert.match(source, /metadata-only/);
  assert.match(source, /authorized-full-text/);
});

test("AI routes keep bazi advice non-deterministic", async () => {
  const route = await readFile(
    new URL("../app/api/chat/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(route, /不得断言吉凶/);
  assert.match(route, /不得擅自推算或声称已判断“喜用神”/);
  assert.match(route, /AbortSignal\.timeout/);
});
