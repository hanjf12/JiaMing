import { spawn } from "node:child_process";
import { constants, existsSync } from "node:fs";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ARGUMENTS = process.argv.slice(2);
const HOST = ARGUMENTS.includes("--lan")
  ? "0.0.0.0"
  : process.env.JIAMING_HOST || "127.0.0.1";
const PORT = Number(process.env.JIAMING_PORT || 4318);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = join(ROOT, "宝宝起名.html");
const CODEX_ARGUMENT = ARGUMENTS.find((value) => value.startsWith("--codex-bin="))?.slice(12);
let busy = false;

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
    const child = spawn(command, args, {
      cwd: ROOT,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
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

function buildPrompt(body) {
  const context = Array.isArray(body.context)
    ? body.context.slice(0, 8).map((item, index) => ({
        index: index + 1,
        title: clean(item.title, 120),
        source: clean(item.source, 180),
        content: clean(item.content, 1800),
      }))
    : [];
  const profile = body.profile && typeof body.profile === "object" ? body.profile : {};
  const history = Array.isArray(body.messages)
    ? body.messages.slice(-6).map((item) => `${item.role === "assistant" ? "助手" : "用户"}：${clean(item.content)}`).join("\n")
    : "";
  const sources = context.length
    ? context.map((item) => `[${item.index}] ${item.title}\n来源：${item.source}\n${item.content}`).join("\n\n")
    : "无命中资料。";
  return [
    "你是“问典”，一个中文宝宝起名助手。",
    "请直接输出给用户看的简洁中文回答，不要描述你的工作过程，不要调用工具或访问文件。",
    "优先依据下方检索资料，引用时使用 [1]、[2]。严禁伪造原句、篇名、作者或出处。",
    body.strict === false ? "" : "严格引用模式：资料未提供的出处要明确说明，不要凭印象补写。",
    "八字与五行只作为传统民俗文化偏好，不是科学预测；不得断言吉凶。",
    "若只有四柱而没有用户明确指定五行倾向，不得擅自推算或声称已判断喜用神。",
    `用户资料：${JSON.stringify(profile)}`,
    history ? `近期对话：\n${history}` : "",
    `检索资料：\n${sources}`,
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
      provider: "Codex 订阅",
      model: loggedIn ? "ChatGPT 已登录" : "尚未登录",
      detail: `${result.stdout}\n${result.stderr}`.trim(),
    };
  } catch (error) {
    return {
      configured: false,
      provider: "Codex 订阅",
      model: "CLI 不可用",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

async function askCodex(body) {
  if (!clean(body.question)) throw new Error("请输入问题");
  if (busy) throw new Error("上一条 Codex 回答仍在生成，请稍候");
  busy = true;
  const work = await mkdtemp(join(tmpdir(), "jiaming-codex-"));
  const output = join(work, "answer.txt");
  try {
    const command = await resolveCodex();
    const prompt = buildPrompt(body);
    await run(command, [
      "exec",
      "--ephemeral",
      "--sandbox", "read-only",
      "--skip-git-repo-check",
      "--ignore-user-config",
      "--ignore-rules",
      "--color", "never",
      "--output-last-message", output,
      "-",
    ], { input: prompt, timeout: 180_000 });
    const answer = (await readFile(output, "utf8")).trim();
    if (!answer) throw new Error("Codex 没有返回内容");
    return answer;
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
  if (request.method === "POST" && url.pathname === "/api/chat") {
    if (!isLoopbackRequest(request) && process.env.JIAMING_ALLOW_LAN_AI !== "1") {
      return responseJson(response, {
        error: "为保护 Codex 订阅，局域网设备默认不能调用 AI；请使用本地知识库模式。",
      }, 403);
    }
    try {
      const body = await readJson(request);
      const answer = await askCodex(body);
      return responseJson(response, { answer });
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
