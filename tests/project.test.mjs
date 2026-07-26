import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

function runNode(args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: new URL("..", import.meta.url),
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ...env },
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

test("both providers share the read-only Codex Agent and file-native knowledge path", async () => {
  const agent = await read("../src/providers/agent.mjs");
  const prompt = await read("../src/prompt.mjs");
  const shell = await read("../src/knowledge-shell.mjs");
  assert.match(agent, /"--sandbox", "read-only"/);
  assert.match(agent, /"--ephemeral"/);
  assert.match(agent, /approval_policy="never"/);
  assert.match(agent, /wire_api="responses"/);
  assert.match(agent, /"mcp_servers=\{\}"/);
  assert.doesNotMatch(agent, /mcp_servers\.[a-z]|mcp-server/);
  assert.match(shell, /rg --files knowledge/);
  assert.match(shell, /Get-Content/);
  assert.match(shell, /find knowledge -type f/);
  assert.doesNotMatch(shell, /scripts\/knowledge\.mjs/);
  assert.match(prompt, /不要调用 MCP/);
  assert.match(prompt, /不得擅自推算喜用神或断言吉凶/);
});

test("file-native knowledge map points to the checked-in wiki and corpus", async () => {
  const llms = await read("../knowledge/llms.txt");
  const guide = await read("../knowledge/README.md");
  const catalog = await read("../knowledge/corpus/catalog.md");
  assert.match(llms, /wiki\/index\.md/);
  assert.match(guide, /rg --files knowledge/);
  assert.match(catalog, /poet\.tang\.\*\.json/);
});

test("environment variables select the third-party Codex provider", async () => {
  const result = await runNode([
    "--input-type=module",
    "-e",
    "import {loadConfig} from './src/config.mjs'; const c=loadConfig(['--no-open']); console.log(JSON.stringify({provider:c.provider,name:c.thirdParty.name,baseUrl:c.thirdParty.baseUrl,model:c.thirdParty.model,hasKey:Boolean(c.thirdParty.apiKey)}));",
  ], {
    JIAMING_PROVIDER: "third-party",
    JIAMING_THIRD_PARTY_NAME: "Mock Provider",
    JIAMING_THIRD_PARTY_BASE_URL: "http://127.0.0.1:8000/v1/",
    JIAMING_THIRD_PARTY_MODEL: "mock-model",
    JIAMING_THIRD_PARTY_API_KEY_ENV: "TEST_PROVIDER_KEY",
    TEST_PROVIDER_KEY: "test-secret",
    OPENAI_API_STYLE: "",
  });
  assert.deepEqual(JSON.parse(result.stdout), {
    provider: "third-party",
    name: "Mock Provider",
    baseUrl: "http://127.0.0.1:8000/v1",
    model: "mock-model",
    hasKey: true,
  });
});

test("legacy Chat Completions mode fails with a migration message", async () => {
  await assert.rejects(
    runNode([
      "--input-type=module",
      "-e",
      "import {loadConfig} from './src/config.mjs'; loadConfig(['--no-open']);",
    ], {
      JIAMING_PROVIDER: "third-party",
      OPENAI_API_STYLE: "chat-completions",
    }),
    /仅支持 Responses 兼容接口/,
  );
});

test("package has no third-party runtime dependencies", async () => {
  const pkg = JSON.parse(await read("../package.json"));
  assert.equal(pkg.type, "module");
  assert.equal(pkg.license, "MIT");
  assert.deepEqual(pkg.dependencies || {}, {});
  assert.deepEqual(pkg.devDependencies || {}, {});
});
