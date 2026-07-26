import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Codex bridge protects remote AI and uses a read-only ephemeral exec", async () => {
  const source = await readFile(
    new URL("../tools/codex-local-server.mjs", import.meta.url),
    "utf8",
  );

  assert.match(source, /process\.env\.JIAMING_HOST \|\| "127\.0\.0\.1"/);
  assert.match(source, /isLoopbackRequest/);
  assert.match(source, /JIAMING_ALLOW_LAN_AI/);
  assert.match(source, /"exec"/);
  assert.match(source, /"--ephemeral"/);
  assert.match(source, /"--sandbox", "read-only"/);
  assert.match(source, /"--ignore-rules"/);
  assert.doesNotMatch(source, /dangerously-bypass-approvals-and-sandbox|--yolo/);
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
