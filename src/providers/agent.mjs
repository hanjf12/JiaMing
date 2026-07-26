import { spawn } from "node:child_process";
import { constants, existsSync } from "node:fs";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { ROOT } from "../config.mjs";
import { completedKnowledgeCommands } from "../knowledge-shell.mjs";
import { buildPrompts, normalizeAgentResult } from "../prompt.mjs";

const OUTPUT_SCHEMA = join(ROOT, "schemas", "agent-answer.schema.json");
const CUSTOM_PROVIDER_ID = "jiaming_third_party";
const CUSTOM_API_KEY_ENV = "JIAMING_AGENT_PROVIDER_API_KEY";
const DISABLED_AGENT_FEATURES = [
  "plugins",
  "apps",
  "hooks",
  "browser_use",
  "computer_use",
  "image_generation",
  "in_app_browser",
  "multi_agent",
  "skill_search",
  "tool_suggest",
];

function candidates(config) {
  const home = homedir();
  const localAppData = process.env.LOCALAPPDATA || "";
  return [
    config.codex?.bin,
    process.env.CODEX_BIN,
    process.platform === "win32" ? join(home, ".codex", ".sandbox-bin", "codex.exe") : "",
    process.platform === "win32" && localAppData
      ? join(localAppData, "OpenAI", "Codex", "codex.exe")
      : "",
    process.platform === "darwin" ? join(home, ".local", "bin", "codex") : "",
    process.platform === "darwin" ? "/opt/homebrew/bin/codex" : "",
    process.platform !== "win32" ? "/usr/local/bin/codex" : "",
    "codex",
  ].filter(Boolean);
}

export async function resolveCodex(config) {
  for (const candidate of candidates(config)) {
    if (candidate === "codex") return candidate;
    if (!existsSync(candidate)) continue;
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Try the next platform-specific location.
    }
  }
  return "codex";
}

function run(command, args, {
  input = "",
  timeout = 20_000,
  extraEnv = {},
} = {}) {
  return new Promise((resolvePromise, reject) => {
    const delimiter = process.platform === "win32" ? ";" : ":";
    const child = spawn(command, args, {
      cwd: ROOT,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        ...extraEnv,
        PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH || ""}`,
      },
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Codex Agent 响应超时"));
    }, timeout);
    child.stdout.on("data", (chunk) => { stdout = (stdout + chunk).slice(-262_144); });
    child.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-262_144); });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolvePromise({ stdout, stderr });
      else reject(new Error(stderr.trim() || stdout.trim() || `Codex 退出码 ${code}`));
    });
    child.stdin.end(input);
  });
}

function tomlString(value) {
  return JSON.stringify(String(value));
}

function tomlMap(record) {
  return `{ ${
    Object.entries(record || {})
      .map(([key, value]) => `${tomlString(key)} = ${tomlString(value)}`)
      .join(", ")
  } }`;
}

function validateThirdParty(config) {
  if (!config.thirdParty.baseUrl || !config.thirdParty.model) {
    const error = new Error("请配置 thirdParty.baseUrl 和 thirdParty.model");
    error.status = 503;
    throw error;
  }
  let url;
  try {
    url = new URL(config.thirdParty.baseUrl);
  } catch {
    throw new Error("thirdParty.baseUrl 不是有效 URL");
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("thirdParty.baseUrl 只允许 http 或 https");
  }
}

function customProviderArgs(config) {
  validateThirdParty(config);
  const provider = config.thirdParty;
  const args = [
    "--config", `model_provider=${tomlString(CUSTOM_PROVIDER_ID)}`,
    "--config", `model_providers.${CUSTOM_PROVIDER_ID}.name=${tomlString(provider.name)}`,
    "--config", `model_providers.${CUSTOM_PROVIDER_ID}.base_url=${tomlString(provider.baseUrl)}`,
    "--config", `model_providers.${CUSTOM_PROVIDER_ID}.wire_api="responses"`,
  ];
  if (provider.apiKey) {
    args.push(
      "--config",
      `model_providers.${CUSTOM_PROVIDER_ID}.env_key=${tomlString(CUSTOM_API_KEY_ENV)}`,
    );
  }
  if (Object.keys(provider.headers || {}).length) {
    args.push(
      "--config",
      `model_providers.${CUSTOM_PROVIDER_ID}.http_headers=${tomlMap(provider.headers)}`,
    );
  }
  if (Object.keys(provider.headerEnv || {}).length) {
    args.push(
      "--config",
      `model_providers.${CUSTOM_PROVIDER_ID}.env_http_headers=${tomlMap(provider.headerEnv)}`,
    );
  }
  if (Object.keys(provider.queryParams || {}).length) {
    args.push(
      "--config",
      `model_providers.${CUSTOM_PROVIDER_ID}.query_params=${tomlMap(provider.queryParams)}`,
    );
  }
  return args;
}

function selectedModel(config) {
  return config.provider === "codex"
    ? config.codex.model
    : config.thirdParty.model;
}

function selectedReasoning(config) {
  return config.provider === "codex"
    ? config.codex.reasoningEffort
    : config.thirdParty.reasoningEffort;
}

function selectedTimeout(config) {
  return config.provider === "codex"
    ? config.codex.timeoutMs
    : config.thirdParty.timeoutMs;
}

export function buildAgentInvocation(config, output) {
  const args = [
    "exec",
    "--json",
    "--ephemeral",
    "--sandbox", "read-only",
    "--skip-git-repo-check",
    "--color", "never",
    "--config", 'approval_policy="never"',
    "--config", "mcp_servers={}",
    "--output-schema", OUTPUT_SCHEMA,
    "--output-last-message", output,
  ];
  if (process.platform === "win32") {
    // Background CLI runs cannot rely on the desktop app's elevated sandbox
    // session. The native unelevated sandbox still enforces read-only ACLs.
    args.push("--config", 'windows.sandbox="unelevated"');
  }
  for (const feature of DISABLED_AGENT_FEATURES) args.push("--disable", feature);
  if (config.provider === "third-party") args.push(...customProviderArgs(config));
  else args.push("--config", 'model_provider="openai"');
  const model = selectedModel(config);
  if (model) args.push("--model", model);
  const reasoning = selectedReasoning(config);
  if (reasoning) {
    args.push("--config", `model_reasoning_effort=${tomlString(reasoning)}`);
  }
  args.push("-");
  return {
    args,
    extraEnv: config.provider === "third-party" && config.thirdParty.apiKey
      ? { [CUSTOM_API_KEY_ENV]: config.thirdParty.apiKey }
      : {},
  };
}

export async function agentStatus(config) {
  const command = await resolveCodex(config);
  if (config.provider === "codex") {
    try {
      const result = await run(command, ["login", "status"]);
      const loggedIn = /Logged in using ChatGPT/i.test(`${result.stdout}\n${result.stderr}`);
      return {
        configured: loggedIn,
        provider: "Codex 订阅",
        model: loggedIn ? config.codex.model || "Codex 默认模型" : "尚未登录",
        apiStyle: "Codex Agent + 只读 Shell",
        auth: loggedIn ? "ChatGPT 订阅已登录" : "未登录",
        detail: `${result.stdout}\n${result.stderr}`.trim(),
      };
    } catch (error) {
      return {
        configured: false,
        provider: "Codex 订阅",
        model: "Codex CLI 不可用",
        apiStyle: "Codex Agent + 只读 Shell",
        auth: "未配置",
        detail: error instanceof Error ? error.message : String(error),
      };
    }
  }

  try {
    validateThirdParty(config);
    const result = await run(command, ["--version"]);
    return {
      configured: true,
      provider: config.thirdParty.name || "第三方模型",
      model: config.thirdParty.model,
      apiStyle: "Codex Agent + Responses 兼容接口 + 只读 Shell",
      auth: config.thirdParty.apiKey
        ? `已从 ${config.thirdParty.apiKeyEnv} 读取密钥`
        : "未配置密钥（适用于本机免密接口）",
      baseUrl: config.thirdParty.baseUrl,
      detail: result.stdout.trim() || result.stderr.trim(),
    };
  } catch (error) {
    return {
      configured: false,
      provider: config.thirdParty.name || "第三方模型",
      model: config.thirdParty.model || "未配置",
      apiStyle: "Codex Agent + Responses 兼容接口 + 只读 Shell",
      auth: "未完成配置",
      baseUrl: config.thirdParty.baseUrl,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function askAgent(config, request) {
  const work = await mkdtemp(join(tmpdir(), "jiaming-agent-"));
  const output = join(work, "answer.json");
  try {
    if (config.provider === "third-party") validateThirdParty(config);
    const command = await resolveCodex(config);
    const prompts = buildPrompts(request);
    const prompt = [
      prompts.system,
      request.messages.length
        ? `近期对话：\n${request.messages.map((item) => `${item.role}：${item.content}`).join("\n")}`
        : "",
      prompts.user,
    ].filter(Boolean).join("\n\n");
    const invocation = buildAgentInvocation(config, output);
    const execution = await run(command, invocation.args, {
      input: prompt,
      timeout: selectedTimeout(config),
      extraEnv: invocation.extraEnv,
    });
    if (process.env.JIAMING_AGENT_DEBUG === "1") {
      process.stderr.write(`\n--- Agent events ---\n${execution.stdout}\n`);
      process.stderr.write(`\n--- Agent diagnostics ---\n${execution.stderr}\n`);
    }
    const raw = (await readFile(output, "utf8")).trim();
    if (!raw) throw new Error("Codex Agent 没有返回内容");
    return normalizeAgentResult(raw, completedKnowledgeCommands(execution.stdout));
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => {});
  }
}
