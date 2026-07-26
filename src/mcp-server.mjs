import { createInterface } from "node:readline";
import { callKnowledgeTool, KNOWLEDGE_TOOLS } from "./agent-tools.mjs";

const SERVER_INFO = { name: "jiaming-knowledge", version: "1.0.0" };

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
    response(message.id, { tools: KNOWLEDGE_TOOLS });
    return;
  }
  if (message.method === "tools/call") {
    try {
      const result = await callKnowledgeTool(
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
