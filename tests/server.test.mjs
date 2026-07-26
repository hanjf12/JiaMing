import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { createAppServer } from "../src/server.mjs";

async function withServer(server, callback) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  try {
    await callback(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
    await once(server, "close");
  }
}

const config = {
  provider: "third-party",
  server: {
    host: "127.0.0.1",
    port: 4318,
    allowLanAgent: false,
  },
  thirdParty: {},
  conversation: { maxHistoryMessages: 8 },
};

test("local server exposes the page, status, tools, and chat endpoint", async () => {
  const server = createAppServer(config, {
    loadPage: async () => Buffer.from("<!doctype html><title>嘉名</title>"),
    loadFavicon: async () => Buffer.from("<svg/>"),
    statusProvider: async () => ({
      configured: true,
      provider: "mock",
      model: "mock-model",
    }),
    askProvider: async (_config, request) => ({
      answer: `收到：${request.question}`,
      citations: [],
      toolsUsed: [],
    }),
  });

  await withServer(server, async (base) => {
    const page = await fetch(`${base}/`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /<title>嘉名<\/title>/);

    const status = await fetch(`${base}/api/chat`).then((response) => response.json());
    assert.equal(status.configured, true);
    assert.equal(status.model, "mock-model");

    const tools = await fetch(`${base}/api/agent/shell`).then((response) => response.json());
    assert.equal(tools.interface, "shell");
    assert.equal(tools.mode, "read-only");
    assert.equal(tools.mcp, false);
    assert.deepEqual(
      tools.commands.map((command) => command.id),
      ["file_find", "file_grep", "file_read"],
    );

    const removedSearch = await fetch(`${base}/api/kb/search?q=清欢`);
    assert.equal(removedSearch.status, 404);

    const chat = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: "推荐一个名字" }),
    });
    assert.equal(chat.status, 200);
    assert.equal((await chat.json()).answer, "收到：推荐一个名字");

    const denied = await fetch(`${base}/api/chat`, {
      headers: { origin: "https://example.test" },
    });
    assert.equal(denied.status, 403);
  });
});

test("chat validates empty and oversized requests", async () => {
  const server = createAppServer(config, {
    statusProvider: async () => ({ configured: true }),
    askProvider: async () => ({ answer: "unexpected" }),
  });

  await withServer(server, async (base) => {
    const empty = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(empty.status, 400);

    const oversized = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: "字".repeat(70_000) }),
    });
    assert.equal(oversized.status, 413);
  });
});
