import { spawn } from "node:child_process";
import { constants, existsSync } from "node:fs";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { ROOT } from "../config.mjs";
import { buildPrompts, normalizeAgentResult } from "../prompt.mjs";

const OUTPUT_SCHEMA = join(ROOT, "schemas", "agent-answer.schema.json");

function candidates(config) {
  const home = homedir();
  const localAppData = process.env.LOCALAPPDATA || "";
  return [
    config.codex.bin,
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

function run(command, args, { input = "", timeout = 20_000 } = {}) {
  return new Promise((resolvePromise, reject) => {
    const delimiter = process.platform === "win32" ? ";" : ":";
    const child = spawn(command, args, {
      cwd: ROOT,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
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

function completedTools(jsonLines) {
  const tools = [];
  for (const line of String(jsonLines || "").split(/\r?\n/)) {
    try {
      const event = JSON.parse(line);
      const item = event?.item;
      if (
        event.type === "item.completed"
        && item?.type === "mcp_tool_call"
        && item?.server === "jiaming"
        && item?.status === "completed"
      ) tools.push(String(item.tool || ""));
    } catch {
      // Ignore CLI diagnostics that are not JSON events.
    }
  }
  return [...new Set(tools)].filter(Boolean);
}

export async function codexStatus(config) {
  const command = await resolveCodex(config);
  try {
    const result = await run(command, ["login", "status"]);
    const loggedIn = /Logged in using ChatGPT/i.test(`${result.stdout}\n${result.stderr}`);
    return {
      configured: loggedIn,
      provider: "Codex 订阅",
      model: loggedIn ? config.codex.model || "Codex 默认模型" : "尚未登录",
      apiStyle: "Codex CLI + MCP",
      auth: loggedIn ? "ChatGPT 订阅已登录" : "未登录",
      detail: `${result.stdout}\n${result.stderr}`.trim(),
    };
  } catch (error) {
    return {
      configured: false,
      provider: "Codex 订阅",
      model: "CLI 不可用",
      apiStyle: "Codex CLI + MCP",
      auth: "未配置",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function askCodex(config, request) {
  const work = await mkdtemp(join(tmpdir(), "jiaming-codex-"));
  const output = join(work, "answer.json");
  try {
    const command = await resolveCodex(config);
    const prompts = buildPrompts(request, "codex");
    const node = process.execPath.replaceAll("\\", "/").replaceAll('"', '\\"');
    const root = ROOT.replaceAll("\\", "/").replaceAll('"', '\\"');
    const prompt = [
      prompts.system,
      request.messages.length
        ? `近期对话：\n${request.messages.map((item) => `${item.role}：${item.content}`).join("\n")}`
        : "",
      prompts.user,
    ].filter(Boolean).join("\n\n");
    const args = [
      "exec",
      "--json",
      "--ephemeral",
      "--sandbox", "read-only",
      "--skip-git-repo-check",
      "--ignore-user-config",
      "--ignore-rules",
      "--color", "never",
      "--config", `mcp_servers.jiaming.command="${node}"`,
      "--config", 'mcp_servers.jiaming.args=["src/mcp-server.mjs"]',
      "--config", `mcp_servers.jiaming.cwd="${root}"`,
      "--config", "mcp_servers.jiaming.startup_timeout_sec=20",
      "--config", "mcp_servers.jiaming.tool_timeout_sec=30",
      "--output-schema", OUTPUT_SCHEMA,
      "--output-last-message", output,
    ];
    if (config.codex.model) args.push("--model", config.codex.model);
    if (config.codex.reasoningEffort) {
      args.push("--config", `model_reasoning_effort="${config.codex.reasoningEffort}"`);
    }
    args.push("-");
    const execution = await run(command, args, {
      input: prompt,
      timeout: config.codex.timeoutMs,
    });
    if (process.env.JIAMING_AGENT_DEBUG === "1") {
      process.stderr.write(`\n--- Codex events ---\n${execution.stdout}\n`);
      process.stderr.write(`\n--- Codex diagnostics ---\n${execution.stderr}\n`);
    }
    const raw = (await readFile(output, "utf8")).trim();
    if (!raw) throw new Error("Codex Agent 没有返回内容");
    return normalizeAgentResult(raw, completedTools(execution.stdout));
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => {});
  }
}
