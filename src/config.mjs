import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const DEFAULTS = {
  provider: "codex",
  server: {
    host: "127.0.0.1",
    port: 4318,
    openBrowser: true,
    allowLanAgent: false,
  },
  codex: {
    model: "gpt-5.6-terra",
    reasoningEffort: "low",
    timeoutMs: 240_000,
  },
  openai: {
    baseUrl: "https://api.openai.com/v1",
    apiKeyEnv: "OPENAI_API_KEY",
    model: "gpt-5.6-terra",
    apiStyle: "responses",
    reasoningEffort: "low",
    timeoutMs: 120_000,
    maxToolRounds: 8,
  },
  conversation: {
    maxHistoryMessages: 8,
  },
};

function merge(base, override) {
  if (!override || typeof override !== "object" || Array.isArray(override)) return base;
  const result = { ...base };
  for (const [key, value] of Object.entries(override)) {
    result[key] = (
      value && typeof value === "object" && !Array.isArray(value)
      && base[key] && typeof base[key] === "object" && !Array.isArray(base[key])
    )
      ? merge(base[key], value)
      : value;
  }
  return result;
}

function loadDotEnv() {
  const filename = join(ROOT, ".env");
  if (!existsSync(filename)) return;
  for (const rawLine of readFileSync(filename, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index < 1) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}

function loadJsonConfig() {
  const filename = resolve(process.env.JIAMING_CONFIG || join(ROOT, "config.local.json"));
  if (!existsSync(filename)) return {};
  try {
    return JSON.parse(readFileSync(filename, "utf8"));
  } catch (error) {
    throw new Error(`配置文件不可读：${filename}：${error.message}`);
  }
}

function booleanValue(value, fallback) {
  if (value === undefined || value === "") return fallback;
  return /^(1|true|yes|on)$/i.test(String(value));
}

function numberValue(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(parsed, max));
}

function normalizeProvider(value) {
  const provider = String(value || "").toLowerCase();
  if (["codex", "codex-subscription"].includes(provider)) return "codex";
  if (["openai", "openai-compatible"].includes(provider)) return "openai";
  throw new Error(`不支持的模型提供方：${value}`);
}

export function loadConfig(args = process.argv.slice(2)) {
  loadDotEnv();
  let config = merge(DEFAULTS, loadJsonConfig());

  config.provider = normalizeProvider(process.env.JIAMING_PROVIDER || config.provider);
  config.server.host = args.includes("--lan")
    ? "0.0.0.0"
    : process.env.JIAMING_HOST || config.server.host;
  config.server.port = numberValue(
    process.env.JIAMING_PORT,
    config.server.port,
    1,
    65_535,
  );
  config.server.openBrowser = !args.includes("--no-open") && booleanValue(
    process.env.JIAMING_OPEN_BROWSER,
    config.server.openBrowser,
  );
  config.server.allowLanAgent = booleanValue(
    process.env.JIAMING_ALLOW_LAN_AGENT || process.env.JIAMING_ALLOW_LAN_AI,
    config.server.allowLanAgent,
  );

  config.codex.bin = args
    .find((value) => value.startsWith("--codex-bin="))
    ?.slice("--codex-bin=".length)
    || process.env.CODEX_BIN
    || config.codex.bin
    || "";
  config.codex.model = process.env.JIAMING_CODEX_MODEL ?? config.codex.model;
  config.codex.reasoningEffort = process.env.JIAMING_CODEX_REASONING
    ?? config.codex.reasoningEffort;
  config.codex.timeoutMs = numberValue(
    process.env.JIAMING_CODEX_TIMEOUT_MS,
    config.codex.timeoutMs,
    30_000,
    600_000,
  );

  config.openai.baseUrl = String(
    process.env.OPENAI_BASE_URL || config.openai.baseUrl,
  ).replace(/\/+$/, "");
  config.openai.model = process.env.OPENAI_MODEL || config.openai.model;
  config.openai.apiStyle = String(
    process.env.OPENAI_API_STYLE || config.openai.apiStyle,
  ).toLowerCase();
  if (!["responses", "chat-completions"].includes(config.openai.apiStyle)) {
    throw new Error("OPENAI_API_STYLE 必须是 responses 或 chat-completions");
  }
  config.openai.reasoningEffort = process.env.OPENAI_REASONING_EFFORT
    ?? config.openai.reasoningEffort;
  config.openai.timeoutMs = numberValue(
    process.env.OPENAI_TIMEOUT_MS,
    config.openai.timeoutMs,
    10_000,
    600_000,
  );
  config.openai.maxToolRounds = numberValue(
    process.env.OPENAI_MAX_TOOL_ROUNDS,
    config.openai.maxToolRounds,
    1,
    16,
  );
  config.openai.apiKey = process.env[config.openai.apiKeyEnv] || "";
  config.conversation.maxHistoryMessages = numberValue(
    process.env.JIAMING_MAX_HISTORY,
    config.conversation.maxHistoryMessages,
    2,
    20,
  );
  return config;
}

export function publicConfig(config) {
  if (config.provider === "codex") {
    return {
      configured: true,
      provider: "Codex 订阅",
      model: config.codex.model || "Codex 默认模型",
      apiStyle: "Codex CLI + MCP",
    };
  }
  return {
    configured: Boolean(config.openai.baseUrl && config.openai.model),
    provider: "OpenAI 兼容接口",
    model: config.openai.model || "未配置",
    apiStyle: config.openai.apiStyle,
    baseUrl: config.openai.baseUrl,
    hasApiKey: Boolean(config.openai.apiKey),
  };
}
