import { createInterface } from "node:readline";
import {
  knowledgeStatus,
  readWiki,
  searchOriginalCorpus,
  searchWiki,
} from "./knowledge-agent-tools.mjs";

const SERVER_INFO = { name: "jiaming-knowledge", version: "1.0.0" };

const TOOLS = [
  {
    name: "knowledge_status",
    description: "查看嘉名本地 Wiki、知识图谱与完整经典原文库的状态和数量。",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
  },
  {
    name: "wiki_search",
    description: "检索编辑整理过的互链 Wiki，适合姓名、起名方法、典籍来源、音韵、用字和八字边界。",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["query"],
      properties: {
        query: { type: "string", minLength: 1 },
        scope: { type: "string", default: "all" },
        limit: { type: "integer", minimum: 1, maximum: 12, default: 6 },
      },
    },
  },
  {
    name: "wiki_read",
    description: "按 pageId 读取一个 Wiki Markdown 页面，供 Agent 沿 links/backlinks 深入核对。",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["pageId"],
      properties: {
        pageId: { type: "string", pattern: "^[A-Za-z0-9-]+$" },
      },
    },
  },
  {
    name: "corpus_search",
    description: "检索四书五经、十三经、唐诗、宋诗、宋词、五代词、元曲、清代专题及合法授权原文。",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["query"],
      properties: {
        query: { type: "string", minLength: 1 },
        scope: { type: "string", default: "all" },
        limit: { type: "integer", minimum: 1, maximum: 12, default: 6 },
      },
    },
  },
];

function response(id, result) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
}

function errorResponse(id, code, message) {
  process.stdout.write(`${JSON.stringify({
    jsonrpc: "2.0",
    id,
    error: { code, message },
  })}\n`);
}

async function callTool(name, args = {}) {
  if (name === "knowledge_status") return knowledgeStatus();
  if (name === "wiki_search") {
    return searchWiki(String(args.query || ""), {
      scope: args.scope,
      limit: args.limit,
    });
  }
  if (name === "wiki_read") return readWiki(String(args.pageId || ""));
  if (name === "corpus_search") {
    return searchOriginalCorpus(String(args.query || ""), {
      scope: args.scope,
      limit: args.limit,
    });
  }
  throw new Error(`未知工具：${name}`);
}

async function handle(message) {
  if (!message || message.jsonrpc !== "2.0") return;
  if (message.method === "initialize") {
    response(message.id, {
      protocolVersion: message.params?.protocolVersion || "2025-03-26",
      capabilities: { tools: { listChanged: false } },
      serverInfo: SERVER_INFO,
    });
    return;
  }
  if (message.method === "ping") {
    response(message.id, {});
    return;
  }
  if (message.method === "tools/list") {
    response(message.id, { tools: TOOLS });
    return;
  }
  if (message.method === "tools/call") {
    try {
      const result = await callTool(
        String(message.params?.name || ""),
        message.params?.arguments || {},
      );
      response(message.id, {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        isError: false,
      });
    } catch (error) {
      response(message.id, {
        content: [{
          type: "text",
          text: error instanceof Error ? error.message : String(error),
        }],
        isError: true,
      });
    }
    return;
  }
  if (message.id !== undefined) errorResponse(message.id, -32601, "Method not found");
}

const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of lines) {
  if (!line.trim()) continue;
  try {
    await handle(JSON.parse(line));
  } catch (error) {
    errorResponse(null, -32700, error instanceof Error ? error.message : "Parse error");
  }
}
