import {
  knowledgeStatus,
  readWiki,
  searchOriginalCorpus,
  searchWiki,
} from "./knowledge.mjs";

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

export const KNOWLEDGE_TOOLS = [
  {
    name: "knowledge_status",
    description: "查看本地 Wiki、知识图谱与经典原文库的状态和数量。",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
    annotations: READ_ONLY,
  },
  {
    name: "wiki_search",
    description: "检索互链 Wiki 中的姓名、方法、来源、音韵、用字和八字边界。",
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
    annotations: READ_ONLY,
  },
  {
    name: "wiki_read",
    description: "按 pageId 读取一个 Wiki Markdown 页面，用于沿 links/backlinks 深入核对。",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["pageId"],
      properties: {
        pageId: { type: "string", pattern: "^[A-Za-z0-9-]+$" },
      },
    },
    annotations: READ_ONLY,
  },
  {
    name: "corpus_search",
    description: "检索四书五经、十三经、唐宋诗词、五代词、元曲、清代专题及合法授权原文。",
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
    annotations: READ_ONLY,
  },
];

export async function callKnowledgeTool(name, args = {}) {
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
  throw new Error(`未知知识工具：${name}`);
}

export function chatCompletionTools() {
  return KNOWLEDGE_TOOLS.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  }));
}

export function responseApiTools() {
  return KNOWLEDGE_TOOLS.map((tool) => ({
    type: "function",
    name: tool.name,
    description: tool.description,
    parameters: tool.inputSchema,
    strict: true,
  }));
}
