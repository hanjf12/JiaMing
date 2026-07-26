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
  thirdParty: {
    name: "第三方模型",
    baseUrl: "",
    apiKeyEnv: "OPENAI_API_KEY",
    model: "",
    reasoningEffort: "low",
    timeoutMs: 240_000,
    headers: {},
    headerEnv: {},
    queryParams: {},
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
  if (
    ["third-party", "thirdparty", "custom", "openai", "openai-compatible"]
      .includes(provider)
  ) return "third-party";
  throw new Error(`不支持的模型提供方：${value}`);
}

function recordValue(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, item]) => [String(key).trim(), String(item).trim()])
      .filter(([key, item]) => key && item),
  );
}

export function loadConfig(args = process.argv.slice(2)) {
  loadDotEnv();
  const local = loadJsonConfig();
  let config = merge(DEFAULTS, local);
  // Keep existing local files usable while moving from the old direct adapter.
  if (local.openai && !local.thirdParty) {
    config.thirdParty = merge(config.thirdParty, local.openai);
  }
  const legacyApiStyle = process.env.OPENAI_API_STYLE || local.openai?.apiStyle;
  if (
    legacyApiStyle
    && String(legacyApiStyle).toLowerCase() !== "responses"
  ) {
    throw new Error(
      "统一 Codex Agent 仅支持 Responses 兼容接口；请移除 chat-completions 配置或增加 Responses 转换层",
    );
  }

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

  config.thirdParty.name = process.env.JIAMING_THIRD_PARTY_NAME
    || config.thirdParty.name;
  config.thirdParty.baseUrl = String(
    process.env.JIAMING_THIRD_PARTY_BASE_URL
      || process.env.OPENAI_BASE_URL
      || config.thirdParty.baseUrl,
  ).replace(/\/+$/, "");
  config.thirdParty.model = process.env.JIAMING_THIRD_PARTY_MODEL
    || process.env.OPENAI_MODEL
    || config.thirdParty.model;
  config.thirdParty.reasoningEffort = process.env.JIAMING_THIRD_PARTY_REASONING
    ?? process.env.OPENAI_REASONING_EFFORT
    ?? config.thirdParty.reasoningEffort;
  config.thirdParty.timeoutMs = numberValue(
    process.env.JIAMING_THIRD_PARTY_TIMEOUT_MS || process.env.OPENAI_TIMEOUT_MS,
    config.thirdParty.timeoutMs,
    30_000,
    600_000,
  );
  config.thirdParty.apiKeyEnv = String(
    process.env.JIAMING_THIRD_PARTY_API_KEY_ENV
      || config.thirdParty.apiKeyEnv
      || "OPENAI_API_KEY",
  );
  config.thirdParty.apiKey = process.env[config.thirdParty.apiKeyEnv] || "";
  config.thirdParty.headers = recordValue(config.thirdParty.headers);
  config.thirdParty.headerEnv = recordValue(config.thirdParty.headerEnv);
  config.thirdParty.queryParams = recordValue(config.thirdParty.queryParams);
  config.conversation.maxHistoryMessages = numberValue(
    process.env.JIAMING_MAX_HISTORY,
    config.conversation.maxHistoryMessages,
    2,
    20,
  );
  return config;
}
