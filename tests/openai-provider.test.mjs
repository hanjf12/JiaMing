import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import test from "node:test";
import { sanitizeRequest } from "../src/prompt.mjs";
import { askOpenAI } from "../src/providers/openai.mjs";

async function readJson(request) {
  let text = "";
  for await (const chunk of request) text += chunk;
  return JSON.parse(text);
}

async function withMock(handler, callback) {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  try {
    await callback(`http://127.0.0.1:${port}/v1`);
  } finally {
    server.close();
    await once(server, "close");
  }
}

function config(baseUrl, apiStyle) {
  return {
    openai: {
      baseUrl,
      apiKey: "test-key",
      model: "mock-tool-model",
      apiStyle,
      reasoningEffort: "",
      timeoutMs: 10_000,
      maxToolRounds: 4,
    },
  };
}

const request = sanitizeRequest({
  question: "先检查知识库，再推荐一个名字",
  retrievalScope: "all",
  topK: 5,
});

test("Chat Completions-compatible provider executes local tools", async () => {
  let calls = 0;
  await withMock(async (incoming, response) => {
    calls += 1;
    const body = await readJson(incoming);
    assert.equal(incoming.url, "/v1/chat/completions");
    assert.equal(incoming.headers.authorization, "Bearer test-key");
    assert.equal(body.tools[0].function.name, "knowledge_status");
    response.setHeader("content-type", "application/json");
    if (calls === 1) {
      response.end(JSON.stringify({
        choices: [{
          message: {
            role: "assistant",
            content: null,
            tool_calls: [{
              id: "call_1",
              type: "function",
              function: { name: "knowledge_status", arguments: "{}" },
            }],
          },
        }],
      }));
      return;
    }
    assert.equal(body.messages.at(-1).role, "tool");
    response.end(JSON.stringify({
      choices: [{
        message: {
          role: "assistant",
          content: JSON.stringify({
            answer: "本地知识库可用。",
            citations: [],
            toolsUsed: ["knowledge_status"],
          }),
        },
      }],
    }));
  }, async (baseUrl) => {
    const result = await askOpenAI(config(baseUrl, "chat-completions"), request);
    assert.equal(result.answer, "本地知识库可用。");
    assert.deepEqual(result.toolsUsed, ["knowledge_status"]);
  });
  assert.equal(calls, 2);
});

test("Responses-compatible provider executes local tools", async () => {
  let calls = 0;
  await withMock(async (incoming, response) => {
    calls += 1;
    const body = await readJson(incoming);
    assert.equal(incoming.url, "/v1/responses");
    assert.equal(body.tools[0].name, "knowledge_status");
    response.setHeader("content-type", "application/json");
    if (calls === 1) {
      response.end(JSON.stringify({
        output: [{
          type: "function_call",
          call_id: "call_2",
          name: "knowledge_status",
          arguments: "{}",
        }],
      }));
      return;
    }
    assert.equal(body.input.at(-1).type, "function_call_output");
    response.end(JSON.stringify({
      output: [{
        type: "message",
        content: [{
          type: "output_text",
          text: JSON.stringify({
            answer: "Responses 工具调用成功。",
            citations: [],
            toolsUsed: ["knowledge_status"],
          }),
        }],
      }],
    }));
  }, async (baseUrl) => {
    const result = await askOpenAI(config(baseUrl, "responses"), request);
    assert.equal(result.answer, "Responses 工具调用成功。");
    assert.deepEqual(result.toolsUsed, ["knowledge_status"]);
  });
  assert.equal(calls, 2);
});
