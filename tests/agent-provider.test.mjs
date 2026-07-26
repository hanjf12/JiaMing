import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAgentInvocation,
} from "../src/providers/agent.mjs";
import { completedKnowledgeCommands } from "../src/knowledge-shell.mjs";
import {
  buildPrompts,
  normalizeAgentResult,
  sanitizeRequest,
} from "../src/prompt.mjs";

const codexConfig = {
  provider: "codex",
  codex: {
    model: "gpt-5.6-terra",
    reasoningEffort: "low",
    timeoutMs: 240_000,
  },
  thirdParty: {},
};

const thirdPartyConfig = {
  provider: "third-party",
  codex: {},
  thirdParty: {
    name: "测试模型",
    baseUrl: "http://127.0.0.1:8000/v1",
    apiKey: "secret-test-key",
    apiKeyEnv: "OPENAI_API_KEY",
    model: "test-model",
    reasoningEffort: "medium",
    timeoutMs: 240_000,
    headers: { "X-Client": "jiaming" },
    headerEnv: { "X-Tenant-Key": "TENANT_KEY" },
    queryParams: { "api-version": "2026-01-01" },
  },
};

test("both routes use the same read-only Codex Agent invocation without MCP", () => {
  const subscription = buildAgentInvocation(codexConfig, "answer.json");
  const custom = buildAgentInvocation(thirdPartyConfig, "answer.json");

  for (const invocation of [subscription, custom]) {
    assert.deepEqual(
      invocation.args.slice(0, 6),
      ["exec", "--json", "--ephemeral", "--sandbox", "read-only", "--skip-git-repo-check"],
    );
    assert.ok(!invocation.args.includes("--ignore-user-config"));
    assert.ok(!invocation.args.includes("--ignore-rules"));
    assert.ok(invocation.args.includes("mcp_servers={}"));
    assert.ok(invocation.args.includes('approval_policy="never"'));
    if (process.platform === "win32") {
      assert.ok(invocation.args.includes('windows.sandbox="unelevated"'));
    }
    assert.ok(invocation.args.includes("--output-schema"));
    for (const feature of ["plugins", "apps", "browser_use", "multi_agent"]) {
      const index = invocation.args.indexOf(feature);
      assert.equal(invocation.args[index - 1], "--disable");
    }
    assert.doesNotMatch(invocation.args.join(" "), /mcp_servers\.[a-z]/i);
  }
});

test("third-party route configures a Responses provider without exposing its key", () => {
  const invocation = buildAgentInvocation(thirdPartyConfig, "answer.json");
  const joined = invocation.args.join(" ");
  assert.match(joined, /model_provider="jiaming_third_party"/);
  assert.match(joined, /wire_api="responses"/);
  assert.match(joined, /base_url="http:\/\/127\.0\.0\.1:8000\/v1"/);
  assert.match(joined, /--model test-model/);
  assert.doesNotMatch(joined, /secret-test-key/);
  assert.equal(invocation.extraEnv.JIAMING_AGENT_PROVIDER_API_KEY, "secret-test-key");
});

test("agent prompt permits only file-native knowledge reads through shell", () => {
  const request = sanitizeRequest({
    question: "先核对出处，再推荐名字",
    retrievalScope: "all",
    topK: 5,
  });
  const prompt = buildPrompts(request).system;
  assert.match(prompt, /Codex 内置 shell 工具/);
  assert.match(prompt, /rg -n -F/);
  assert.match(prompt, /knowledge\/llms\.txt/);
  assert.match(prompt, /file_find、file_grep、file_read/);
  assert.doesNotMatch(prompt, /scripts\/knowledge\.mjs/);
  assert.match(prompt, /不要调用 MCP/);
  assert.match(prompt, /不得擅自推算喜用神或断言吉凶/);
});

test("completed shell commands are reported as knowledge usage", () => {
  const events = [
    JSON.stringify({
      type: "item.completed",
      item: {
        type: "command_execution",
        command: "rg --files knowledge/wiki",
        exit_code: 0,
        status: "completed",
      },
    }),
    JSON.stringify({
      type: "item.completed",
      item: {
        type: "command_execution",
        command: 'rg -n -F -m 8 "清欢" knowledge/corpus/vendor/chinese-poetry/宋词',
        exit_code: 0,
        status: "completed",
      },
    }),
    JSON.stringify({
      type: "item.completed",
      item: {
        type: "command_execution",
        command: "Get-Content -Encoding UTF8 knowledge/wiki/index.md",
        exit_code: -1,
        status: "declined",
      },
    }),
  ].join("\n");
  assert.deepEqual(
    completedKnowledgeCommands(events),
    ["file_find", "file_grep"],
  );
});

test("observed shell events override unverified model tool declarations", () => {
  const result = normalizeAgentResult(JSON.stringify({
    answer: "命令未执行。",
    citations: [],
    toolsUsed: ["file_find"],
  }), []);
  assert.deepEqual(result.toolsUsed, []);
});
