import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the finished naming application", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>嘉名 · 中文宝宝起名<\/title>/);
  assert.match(html, /src="\/baby-name\.html"/);
  assert.doesNotMatch(html, /codex-preview|SkeletonPreview|react-loading-skeleton/);
});

test("ships a self-contained local naming tool", async () => {
  const html = await readFile(
    new URL("../public/baby-name.html", import.meta.url),
    "utf8",
  );

  assert.match(html, /纯本地 · 信息不上传/);
  assert.match(html, /四书五经/);
  assert.match(html, /唐诗/);
  assert.match(html, /宋词/);
  assert.match(html, /诗经/);
  assert.match(html, /楚辞/);
  assert.match(html, /jiaming-favorites/);
  assert.match(html, /导出收藏/);
  assert.match(html, /问典/);
  assert.match(html, /本机 Codex Agent · 自主检索/);
  assert.match(html, /模型会自行搜索本地 Wiki/);
  assert.match(html, /历代完整原文（本机）/);
  assert.match(html, /const WIKI_META = \{.*?"pages":104/);
  assert.match(html, /const WIKI_CHUNKS = \[/);
  assert.match(html, /retrieveFullCorpus/);
  assert.match(html, /Codex Agent（自主检索）/);
  assert.match(html, /Agent 已使用/);
  assert.match(html, /出生八字/);
  assert.match(html, /不得据此断言吉凶或擅自推算喜用神/);
  assert.match(html, /jiaming-custom-knowledge/);
  assert.match(html, /retrieveKnowledge/);
  assert.match(html, /\.assistant\s*\{[\s\S]*?grid-column:\s*2;/);
  assert.match(html, /@media \(max-width: 900px\)[\s\S]*?\.assistant\s*\{\s*grid-column:\s*1;/);
  assert.doesNotMatch(html, /https?:\/\//);

  const records = html.match(/id:"[cstpq][0-9]+"/g) ?? [];
  assert.ok(records.length >= 60, `expected at least 60 names, got ${records.length}`);

  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script, "embedded application script is missing");
  assert.doesNotThrow(() => new Function(script));
});
