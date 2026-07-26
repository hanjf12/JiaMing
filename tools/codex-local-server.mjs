import { spawn } from "node:child_process";
import { constants, existsSync, readFileSync } from "node:fs";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { corpusStatus, searchCorpus } from "./corpus-search.mjs";

const ARGUMENTS = process.argv.slice(2);
const HOST = ARGUMENTS.includes("--lan")
  ? "0.0.0.0"
  : process.env.JIAMING_HOST || "127.0.0.1";
const PORT = Number(process.env.JIAMING_PORT || 4318);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = join(ROOT, "宝宝起名.html");
const AGENT_CONFIG_FILE = join(ROOT, "config", "local-agent.json");
const OUTPUT_SCHEMA = join(ROOT, "tools", "schemas", "agent-answer.schema.json");
const CODEX_ARGUMENT = ARGUMENTS.find((value) => value.startsWith("--codex-bin="))?.slice(12);
let busy = false;

function loadAgentConfig() {
  const defaults = {
    provider: "codex-subscription",
    model: "",
    reasoningEffort: "",
    timeoutMs: 240_000,
    maxHistoryMessages: 8,
  };
  if (!existsSync(AGENT_CONFIG_FILE)) return defaults;
  try {
    const local = JSON.parse(readFileSync(AGENT_CONFIG_FILE, "utf8"));
    return { ...defaults, ...local };
  } catch (error) {
    process.stderr.write(`本地 Agent 配置不可读，将使用默认值：${error.message}\n`);
    return defaults;
  }
}

const AGENT_CONFIG = loadAgentConfig();
const CODEX_MODEL = String(process.env.JIAMING_CODEX_MODEL || AGENT_CONFIG.model || "").trim();
const CODEX_REASONING = String(
  process.env.JIAMING_CODEX_REASONING || AGENT_CONFIG.reasoningEffort || "",
).trim();
const CODEX_TIMEOUT_MS = Math.max(
  30_000,
  Math.min(
    Number(process.env.JIAMING_CODEX_TIMEOUT_MS || AGENT_CONFIG.timeoutMs) || 240_000,
    600_000,
  ),
);

function codexCandidates() {
  const home = homedir();
  const localAppData = process.env.LOCALAPPDATA || "";
  return [
    CODEX_ARGUMENT,
    process.env.CODEX_BIN,
    process.platform === "win32" ? join(home, ".codex", ".sandbox-bin", "codex.exe") : "",
    process.platform === "win32" && localAppData
      ? join(localAppData, "OpenAI", "Codex", "codex.exe")
      : "",
    "codex",
  ].filter(Boolean);
}

async function resolveCodex() {
  for (const candidate of codexCandidates()) {
    if (candidate === "codex") return candidate;
    if (!existsSync(candidate)) continue;
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Continue to the next known installation.
    }
  }
  return "codex";
}

function run(command, args, { input = "", timeout = 20_000 } = {}) {
  return new Promise((resolvePromise, reject) => {
    const nodeDirectory = dirname(process.execPath);
    const delimiter = process.platform === "win32" ? ";" : ":";
    const child = spawn(command, args, {
      cwd: ROOT,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        PATH: `${nodeDirectory}${delimiter}${process.env.PATH || ""}`,
      },
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Codex 响应超时"));
    }, timeout);
    child.stdout.on("data", (chunk) => { stdout = (stdout + chunk).slice(-131_072); });
    child.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-131_072); });
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

function responseJson(response, data, status = 200) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(JSON.stringify(data));
}

function isLoopbackRequest(request) {
  const address = request.socket.remoteAddress || "";
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function isSameOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.host;
  } catch {
    return false;
  }
}

async function readJson(request) {
  let content = "";
  for await (const chunk of request) {
    content += chunk;
    if (Buffer.byteLength(content) > 65_536) throw new Error("请求内容过大");
  }
  return JSON.parse(content || "{}");
}

function clean(value, limit = 1200) {
  return String(value || "").trim().slice(0, limit);
}

function buildAgentPrompt(body) {
  const attachments = Array.isArray(body.context)
    ? body.context.slice(0, 8).map((item, index) => ({
        index: index + 1,
        title: clean(item.title, 120),
        source: clean(item.source, 180),
        content: clean(item.content, 1800),
      }))
    : [];
  const profile = body.profile && typeof body.profile === "object" ? body.profile : {};
  const history = Array.isArray(body.messages)
    ? body.messages
        .slice(-Math.max(2, Math.min(Number(AGENT_CONFIG.maxHistoryMessages) || 8, 16)))
        .map((item) => `${item.role === "assistant" ? "助手" : "用户"}：${clean(item.content)}`)
        .join("\n")
    : "";
  const attachmentText = attachments.length
    ? attachments
        .map((item) => `[自建资料 ${item.index}] ${item.title}\n来源：${item.source}\n${item.content}`)
        .join("\n\n")
    : "无。";
  const requestedScope = clean(body.retrievalScope, 40) || "all";
  const requestedLimit = Math.max(3, Math.min(Number(body.topK) || 6, 12));
  return [
    "你是“问典”，一个运行在本机只读沙箱中的中文宝宝起名知识 Agent。",
    "必须自主读取项目的 AGENTS.md，并使用其中列出的知识库工具完成检索；不要只依赖模型记忆。",
    `工具运行时使用 Node.js 命令 node，当前项目目录是：${ROOT}`,
    `本次用户选择的检索范围是 ${requestedScope}，期望优先保留约 ${requestedLimit} 条最相关证据。你可以根据问题调整检索词并进行多轮工具调用。`,
    "优先直接调用 jiaming MCP 工具。回答姓名建议时至少调用 knowledge_status 和 wiki_search；涉及诗句、古籍原句、篇名或作者时还要调用 corpus_search；需要方法或语境判断时沿 links 使用 wiki_read。",
    "不得访问网络，不得修改任何文件，也不得运行与本地知识检索无关的命令。",
    "最终只输出符合指定 JSON Schema 的对象。answer 是直接给用户看的简洁中文，引用按 citations 数组顺序使用 [1]、[2]；每个 [n] 必须准确对应 citations[n-1]，原文引句优先对应 corpus_search 的原文记录。提交前逐项检查编号，不要在 answer 中描述工具调用过程。",
    "严禁伪造原句、篇名、作者或出处。检索不到时明确说明，不用记忆补写。",
    body.strict === false ? "" : "严格引用模式：资料未提供的出处要明确说明，不要凭印象补写。",
    "八字与五行只作为传统民俗文化偏好，不是科学预测；不得断言吉凶。",
    "若只有四柱而没有用户明确指定五行倾向，不得擅自推算或声称已判断喜用神。",
    `用户资料：${JSON.stringify(profile)}`,
    history ? `近期对话：\n${history}` : "",
    `用户在浏览器中导入、并明确随本次问题提供的自建资料：\n${attachmentText}`,
    `当前问题：${clean(body.question)}`,
  ].filter(Boolean).join("\n\n");
}

async function codexStatus() {
  const command = await resolveCodex();
  try {
    const result = await run(command, ["login", "status"]);
    const loggedIn = /Logged in using ChatGPT/i.test(`${result.stdout}\n${result.stderr}`);
    return {
      configured: loggedIn,
      provider: "Codex Agent",
      model: loggedIn
        ? CODEX_MODEL || "订阅默认模型"
        : "尚未登录",
      auth: loggedIn ? "ChatGPT 订阅已登录" : "未配置",
      agentTools: ["wiki_search", "wiki_read", "corpus_search"],
      detail: `${result.stdout}\n${result.stderr}`.trim(),
    };
  } catch (error) {
    return {
      configured: false,
      provider: "Codex Agent",
      model: "CLI 不可用",
      auth: "未配置",
      agentTools: [],
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

function normalizeAgentResult(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { answer: raw, citations: [], toolsUsed: [] };
  }
  const citations = Array.isArray(parsed.citations)
    ? parsed.citations.slice(0, 12).map((item) => ({
        title: clean(item?.title, 160),
        source: clean(item?.source, 240),
        verified: Boolean(item?.verified),
      })).filter((item) => item.title && item.source)
    : [];
  const allowedTools = new Set([
    "knowledge_status",
    "wiki_search",
    "wiki_read",
    "corpus_search",
  ]);
  const toolsUsed = Array.isArray(parsed.toolsUsed)
    ? [...new Set(parsed.toolsUsed.map(String).filter((item) => allowedTools.has(item)))]
    : [];
  return {
    answer: clean(parsed.answer, 16_000) || "Codex Agent 没有返回可显示的回答",
    citations,
    toolsUsed,
  };
}

function completedAgentTools(jsonLines) {
  const tools = [];
  for (const line of String(jsonLines || "").split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line);
      const item = event?.item;
      if (
        event.type === "item.completed"
        && item?.type === "mcp_tool_call"
        && item?.server === "jiaming"
        && item?.status === "completed"
      ) {
        tools.push(String(item.tool || ""));
      }
    } catch {
      // Ignore non-JSON diagnostics.
    }
  }
  return [...new Set(tools)].filter(Boolean);
}

async function askCodex(body) {
  if (!clean(body.question)) throw new Error("请输入问题");
  if (busy) throw new Error("上一条 Codex 回答仍在生成，请稍候");
  busy = true;
  const work = await mkdtemp(join(tmpdir(), "jiaming-codex-"));
  const output = join(work, "answer.txt");
  try {
    const command = await resolveCodex();
    const prompt = buildAgentPrompt(body);
    const mcpNode = process.execPath.replaceAll("\\", "/").replaceAll('"', '\\"');
    const mcpRoot = ROOT.replaceAll("\\", "/").replaceAll('"', '\\"');
    const args = [
      "exec",
      "--json",
      "--ephemeral",
      "--sandbox", "read-only",
      "--skip-git-repo-check",
      "--ignore-user-config",
      "--ignore-rules",
      "--color", "never",
      "--config", `mcp_servers.jiaming.command="${mcpNode}"`,
      "--config", 'mcp_servers.jiaming.args=["tools/jiaming-mcp-server.mjs"]',
      "--config", `mcp_servers.jiaming.cwd="${mcpRoot}"`,
      "--config", "mcp_servers.jiaming.startup_timeout_sec=20",
      "--config", "mcp_servers.jiaming.tool_timeout_sec=30",
      "--output-schema", OUTPUT_SCHEMA,
      "--output-last-message", output,
    ];
    if (CODEX_MODEL) args.push("--model", CODEX_MODEL);
    if (CODEX_REASONING) {
      args.push("--config", `model_reasoning_effort="${CODEX_REASONING}"`);
    }
    args.push("-");
    const execution = await run(command, args, { input: prompt, timeout: CODEX_TIMEOUT_MS });
    if (process.env.JIAMING_AGENT_DEBUG === "1") {
      process.stderr.write(`\n--- Codex Agent JSON events ---\n${execution.stdout}\n`);
      process.stderr.write(`\n--- Codex Agent diagnostics ---\n${execution.stderr}\n`);
    }
    const raw = (await readFile(output, "utf8")).trim();
    if (!raw) throw new Error("Codex Agent 没有返回内容");
    const result = normalizeAgentResult(raw);
    const actualTools = completedAgentTools(execution.stdout);
    if (actualTools.length) result.toolsUsed = actualTools;
    return result;
  } finally {
    busy = false;
    await rm(work, { recursive: true, force: true }).catch(() => {});
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${HOST}:${PORT}`);
  if (!isSameOrigin(request)) {
    return responseJson(response, { error: "仅允许本机同源访问" }, 403);
  }

  if (request.method === "GET" && url.pathname === "/api/chat") {
    if (!isLoopbackRequest(request) && process.env.JIAMING_ALLOW_LAN_AI !== "1") {
      return responseJson(response, {
        configured: false,
        provider: "本地知识库",
        model: "局域网设备默认不开放 Codex",
        detail: "取名、八字排序与本地检索仍可正常使用",
      });
    }
    return responseJson(response, await codexStatus());
  }
  if (request.method === "GET" && url.pathname === "/api/kb/status") {
    return responseJson(response, corpusStatus());
  }
  if (request.method === "GET" && url.pathname === "/api/agent/tools") {
    return responseJson(response, {
      tools: [
        { name: "knowledge_status", description: "查看 Wiki 与原文库状态" },
        { name: "wiki_search", description: "检索互链 Wiki" },
        { name: "wiki_read", description: "读取完整 Wiki 页面" },
        { name: "corpus_search", description: "检索历代经典原文" },
      ],
      mode: "read-only",
      network: false,
    });
  }
  if (request.method === "GET" && url.pathname === "/api/kb/search") {
    try {
      const query = clean(url.searchParams.get("q"), 600);
      if (!query) return responseJson(response, { results: [] });
      const results = searchCorpus(query, {
        scope: clean(url.searchParams.get("scope"), 40) || "all",
        limit: Number(url.searchParams.get("limit") || 5),
      });
      return responseJson(response, { results });
    } catch (error) {
      return responseJson(response, {
        error: error instanceof Error ? error.message : "原文库检索失败",
      }, 500);
    }
  }
  if (request.method === "POST" && url.pathname === "/api/chat") {
    if (!isLoopbackRequest(request) && process.env.JIAMING_ALLOW_LAN_AI !== "1") {
      return responseJson(response, {
        error: "为保护 Codex 订阅，局域网设备默认不能调用 AI；请使用本地知识库模式。",
      }, 403);
    }
    try {
      const body = await readJson(request);
      const result = await askCodex(body);
      return responseJson(response, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Codex 调用失败";
      return responseJson(response, { error: message }, /过大/.test(message) ? 413 : 502);
    }
  }
  if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/baby-name.html")) {
    try {
      const html = await readFile(PAGE);
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:",
      });
      return response.end(html);
    } catch {
      return responseJson(response, { error: "找不到宝宝起名.html" }, 404);
    }
  }
  return responseJson(response, { error: "Not found" }, 404);
});

server.listen(PORT, HOST, () => {
  const url = `http://127.0.0.1:${PORT}/`;
  process.stdout.write(`\n嘉名已启动：${url}\n关闭本窗口即可停止服务。\n\n`);
  if (process.platform === "win32" && process.env.JIAMING_NO_OPEN !== "1" && !ARGUMENTS.includes("--no-open")) {
    const opener = spawn("cmd.exe", ["/d", "/s", "/c", "start", "", url], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    opener.unref();
  }
});

server.on("error", (error) => {
  process.stderr.write(`启动失败：${error.message}\n`);
  process.exitCode = 1;
});
