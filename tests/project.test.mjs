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
  const visibleText = html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  assert.match(html, /<title>嘉名 · 中文宝宝起名<\/title>/);
  assert.match(html, /第二步 · 问答主入口/);
  assert.match(html, /左侧资料会自动带入每次提问/);
  assert.match(html, /data-chat-ask/);
  assert.match(html, /嘉名暂时无法回答/);
  assert.match(html, /function cardSourceText/);
  assert.match(html, /function compositionModeLabel/);
  assert.match(html, /构成说明/);
  assert.match(html, /跨典合意/);
  assert.match(html, /const references = hasNameCards \? "" : citationMarkup/);
  assert.match(html, /嘉名正在查阅相关典籍/);
  assert.match(html, /嘉名正在查阅典籍与原文，请稍候/);
  assert.match(html, /<div class="citation-title">参考出处<\/div>/);
  assert.doesNotMatch(visibleText, /问典|Agent|Shell|Wiki|LLM|Codex|Responses|模型|检索|知识库|原文库/);
  assert.match(html, /<link rel="icon" href="\/favicon\.svg"/);
  assert.doesNotMatch(html, /即时灵感|换一批灵感|id="cards"|function buildCandidates|jiaming-favorites/);
  assert.doesNotMatch(html, />和“问典”|>带着资料 · 请问典推荐<|>问典回答<|Agent 正在通过|个 Wiki 页面|Shell 检索|LLM Agent 正在自主规划|Agent 调用失败/);
  assert.doesNotMatch(html, /value="codex"|本机 Codex Agent|仅本地检索|\/api\/kb\/search/);
  assert.doesNotMatch(html, /<script[^>]+src=|<link[^>]+stylesheet/);
});

test("structured Agent schema requires every declared top-level field", async () => {
  const schema = JSON.parse(await read("../schemas/agent-answer.schema.json"));
  assert.deepEqual(
    [...schema.required].sort(),
    Object.keys(schema.properties).sort(),
  );
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
  assert.match(shell, /rg --files --no-ignore knowledge/);
  assert.match(shell, /rg --files --no-ignore knowledge\/corpus\/vendor/);
  assert.match(shell, /--no-ignore/);
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
  assert.match(guide, /rg --files --no-ignore knowledge/);
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
  assert.equal(pkg.repository.url, "git+https://github.com/hanjf12/JiaMing.git");
  assert.equal(pkg.scripts.doctor, "node scripts/doctor.mjs");
  assert.equal(pkg.scripts["corpus:info"], "node scripts/corpus-info.mjs");
  assert.equal(pkg.scripts["corpus:verify"], "node scripts/install-corpus.mjs --verify-only");
  assert.equal(pkg.scripts["corpus:install"], "node scripts/install-corpus.mjs");
  assert.equal(pkg.scripts["corpus:build"], undefined);
  assert.equal(pkg.scripts["corpus:status"], undefined);
  assert.deepEqual(pkg.dependencies || {}, {});
  assert.deepEqual(pkg.devDependencies || {}, {});
});

test("installation guide documents system dependencies and both model routes", async () => {
  const guide = await read("../docs/installation.zh-CN.md");
  assert.match(guide, /git clone https:\/\/github\.com\/hanjf12\/JiaMing\.git/);
  assert.match(guide, /npm install -g @openai\/codex@latest/);
  assert.match(guide, /codex login/);
  assert.match(guide, /npm run doctor/);
  assert.match(guide, /Responses API/);
  assert.match(guide, /Windows/);
  assert.match(guide, /macOS/);
});

test("corpus package is versioned and installable without npm dependencies", async () => {
  const manifest = JSON.parse(await read("../knowledge/corpus/corpus-package.json"));
  const info = await read("../scripts/corpus-info.mjs");
  const installer = await read("../scripts/install-corpus.mjs");
  assert.equal(manifest.packageVersion, "2026.07.26");
  assert.equal(manifest.fileName, "jiaming-corpus-v2026.07.26.tar.gz");
  assert.equal(manifest.sizeBytes, 60469138);
  assert.match(manifest.sha256, /^[a-f0-9]{64}$/);
  assert.equal(manifest.download.shareUrl, "https://pan.quark.cn/s/0f58be1b7b2e");
  assert.match(info, /corpus-package\.json/);
  assert.match(installer, /createHash\("sha256"\)/);
  assert.match(installer, /--verify-only/);
  assert.match(installer, /压缩包包含不安全路径/);
  assert.match(installer, /为避免覆盖/);
});
