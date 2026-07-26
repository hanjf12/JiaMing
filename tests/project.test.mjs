import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

function runNode(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: new URL("..", import.meta.url),
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr || stdout || `exit ${code}`));
    });
  });
}

test("static page is self-contained and provider-neutral", async () => {
  const html = await read("../public/index.html");
  assert.match(html, /<title>嘉名 · 中文宝宝起名<\/title>/);
  assert.match(html, /本地知识 Agent · 自主检索/);
  assert.match(html, /LLM Agent（自主检索）/);
  assert.match(html, /<link rel="icon" href="\/favicon\.svg"/);
  assert.doesNotMatch(html, /value="codex"|本机 Codex Agent/);
  assert.doesNotMatch(html, /<script[^>]+src=|<link[^>]+stylesheet/);
});

test("Codex provider is read-only and OpenAI provider has both API styles", async () => {
  const codex = await read("../src/providers/codex.mjs");
  const openai = await read("../src/providers/openai.mjs");
  const prompt = await read("../src/prompt.mjs");
  assert.match(codex, /"--sandbox", "read-only"/);
  assert.match(codex, /"--ephemeral"/);
  assert.match(codex, /src\/mcp-server\.mjs/);
  assert.match(openai, /"\/responses"/);
  assert.match(openai, /"\/chat\/completions"/);
  assert.match(prompt, /不得擅自推算喜用神或断言吉凶/);
});

test("knowledge CLI reports the checked-in wiki", async () => {
  const result = await runNode(["scripts/knowledge.mjs", "status"]);
  const status = JSON.parse(result.stdout);
  assert.ok(status.wiki.pages >= 100);
});

test("package has no third-party runtime dependencies", async () => {
  const pkg = JSON.parse(await read("../package.json"));
  assert.equal(pkg.type, "module");
  assert.equal(pkg.license, "MIT");
  assert.deepEqual(pkg.dependencies || {}, {});
  assert.deepEqual(pkg.devDependencies || {}, {});
});
