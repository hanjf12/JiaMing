import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, ROOT } from "./config.mjs";
import { corpusStatus, searchCorpus } from "./corpus.mjs";
import { KNOWLEDGE_SHELL_COMMANDS } from "./knowledge-shell.mjs";
import { sanitizeRequest } from "./prompt.mjs";
import { agentStatus, askAgent } from "./providers/agent.mjs";

const PAGE = join(ROOT, "public", "index.html");
const FAVICON = join(ROOT, "public", "favicon.svg");

function responseJson(response, data, status = 200) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(JSON.stringify(data));
}

function responseFile(response, content, contentType) {
  response.writeHead(200, {
    "content-type": contentType,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "content-security-policy": [
      "default-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-inline'",
      "connect-src 'self'",
      "img-src 'self' data:",
    ].join("; "),
  });
  response.end(content);
}

function isLoopbackRequest(request) {
  const address = request.socket.remoteAddress || "";
  return address === "127.0.0.1"
    || address === "::1"
    || address === "::ffff:127.0.0.1";
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
  let bytes = 0;
  let tooLarge = false;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 65_536) tooLarge = true;
    else content += chunk;
  }
  if (tooLarge) {
    const error = new Error("请求内容过大");
    error.status = 413;
    throw error;
  }
  try {
    return JSON.parse(content || "{}");
  } catch {
    const error = new Error("请求不是有效 JSON");
    error.status = 400;
    throw error;
  }
}

function remoteStatus(config) {
  return {
    configured: false,
    provider: "本地知识库",
    model: `局域网设备默认不开放 ${
      config.provider === "codex" ? "Codex 订阅" : "第三方模型"
    }`,
    apiStyle: "仅本地检索",
    auth: "受保护",
    detail: "取名表单与本地原文检索仍可使用；如确需开放，请在可信网络中设置 JIAMING_ALLOW_LAN_AGENT=1。",
  };
}

export function createAppServer(
  config = loadConfig(),
  dependencies = {},
) {
  const statusProvider = dependencies.statusProvider || agentStatus;
  const askProvider = dependencies.askProvider || askAgent;
  const loadPage = dependencies.loadPage || (() => readFile(PAGE));
  const loadFavicon = dependencies.loadFavicon || (() => readFile(FAVICON));
  let busy = false;

  return createServer(async (request, response) => {
    const base = `http://${request.headers.host || `${config.server.host}:${config.server.port}`}`;
    const url = new URL(request.url || "/", base);
    if (!isSameOrigin(request)) {
      return responseJson(response, { error: "仅允许同源访问" }, 403);
    }

    if (request.method === "GET" && url.pathname === "/api/chat") {
      if (!isLoopbackRequest(request) && !config.server.allowLanAgent) {
        return responseJson(response, remoteStatus(config));
      }
      try {
        return responseJson(response, await statusProvider(config));
      } catch (error) {
        return responseJson(response, {
          configured: false,
          provider: config.provider,
          model: "状态检查失败",
          detail: error instanceof Error ? error.message : String(error),
        }, 503);
      }
    }

    if (request.method === "GET" && url.pathname === "/api/kb/status") {
      try {
        return responseJson(response, corpusStatus());
      } catch (error) {
        return responseJson(response, {
          error: error instanceof Error ? error.message : "知识库状态读取失败",
        }, 500);
      }
    }

    if (
      request.method === "GET"
      && ["/api/agent/shell", "/api/agent/tools"].includes(url.pathname)
    ) {
      return responseJson(response, {
        interface: "shell",
        commands: KNOWLEDGE_SHELL_COMMANDS,
        mode: "read-only",
        network: false,
        mcp: false,
      });
    }

    if (request.method === "GET" && url.pathname === "/api/kb/search") {
      try {
        const query = String(url.searchParams.get("q") || "").trim().slice(0, 600);
        if (!query) return responseJson(response, { results: [] });
        const results = searchCorpus(query, {
          scope: String(url.searchParams.get("scope") || "all").slice(0, 40),
          limit: Math.max(1, Math.min(Number(url.searchParams.get("limit")) || 5, 20)),
        });
        return responseJson(response, { results });
      } catch (error) {
        return responseJson(response, {
          error: error instanceof Error ? error.message : "原文库检索失败",
        }, 500);
      }
    }

    if (request.method === "POST" && url.pathname === "/api/chat") {
      if (!isLoopbackRequest(request) && !config.server.allowLanAgent) {
        return responseJson(response, {
          error: "为保护本机订阅或模型凭据，局域网设备默认不能调用 LLM；请使用本地知识库模式。",
        }, 403);
      }
      if (busy) {
        return responseJson(response, { error: "上一条回答仍在生成，请稍候" }, 429);
      }
      busy = true;
      try {
        const body = await readJson(request);
        const sanitized = sanitizeRequest(body, config.conversation.maxHistoryMessages);
        if (!sanitized.question) {
          return responseJson(response, { error: "请输入问题" }, 400);
        }
        return responseJson(response, await askProvider(config, sanitized));
      } catch (error) {
        const message = error instanceof Error ? error.message : "模型调用失败";
        const status = Number(error?.status) || 502;
        return responseJson(response, { error: message }, status);
      } finally {
        busy = false;
      }
    }

    if (
      request.method === "GET"
      && ["/", "/index.html", "/baby-name.html"].includes(url.pathname)
    ) {
      try {
        return responseFile(response, await loadPage(), "text/html; charset=utf-8");
      } catch {
        return responseJson(response, { error: "找不到 public/index.html" }, 404);
      }
    }

    if (request.method === "GET" && url.pathname === "/favicon.svg") {
      try {
        return responseFile(response, await loadFavicon(), "image/svg+xml; charset=utf-8");
      } catch {
        return responseJson(response, { error: "找不到 favicon.svg" }, 404);
      }
    }

    return responseJson(response, { error: "Not found" }, 404);
  });
}

function openBrowser(url) {
  const command = process.platform === "win32"
    ? ["cmd.exe", ["/d", "/s", "/c", "start", "", url]]
    : process.platform === "darwin"
      ? ["open", [url]]
      : ["xdg-open", [url]];
  try {
    const child = spawn(command[0], command[1], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();
  } catch {
    // The URL is printed even when no desktop opener is available.
  }
}

export function startServer(config = loadConfig()) {
  const server = createAppServer(config);
  server.listen(config.server.port, config.server.host, () => {
    const url = `http://127.0.0.1:${config.server.port}/`;
    process.stdout.write([
      "",
      `嘉名已启动：${url}`,
      `模型提供方：${
        config.provider === "codex"
          ? "Codex 订阅"
          : config.thirdParty.name || "第三方模型"
      }`,
      config.server.host === "0.0.0.0"
        ? "已监听局域网；模型调用默认仅允许本机。"
        : "仅监听本机。",
      "按 Ctrl+C 停止服务。",
      "",
    ].join("\n"));
    if (config.server.openBrowser) openBrowser(url);
  });
  server.on("error", (error) => {
    process.stderr.write(`启动失败：${error.message}\n`);
    process.exitCode = 1;
  });
  return server;
}

const mainFile = process.argv[1] ? resolve(process.argv[1]) : "";
if (mainFile === fileURLToPath(import.meta.url)) startServer();
