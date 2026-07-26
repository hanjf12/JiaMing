import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { ROOT, loadConfig } from "../src/config.mjs";
import { resolveCodex } from "../src/providers/agent.mjs";

const REQUIRED_NODE = [22, 13, 0];
const REQUIRED_CODEX_FLAGS = [
  "--ephemeral",
  "--output-schema",
  "--output-last-message",
  "--sandbox",
  "--json",
];

function versionAtLeast(current, required) {
  const parts = String(current).replace(/^v/, "").split(".").map(Number);
  for (let index = 0; index < required.length; index += 1) {
    if ((parts[index] || 0) > required[index]) return true;
    if ((parts[index] || 0) < required[index]) return false;
  }
  return true;
}

function command(commandName, args) {
  return spawnSync(commandName, args, {
    cwd: ROOT,
    encoding: "utf8",
    windowsHide: true,
  });
}

function line(ok, label, detail) {
  process.stdout.write(`${ok ? "✓" : "✗"} ${label}${detail ? `：${detail}` : ""}\n`);
}

let failed = false;
const nodeOk = versionAtLeast(process.versions.node, REQUIRED_NODE);
line(nodeOk, "Node.js", `v${process.versions.node}（要求 >=22.13.0）`);
failed ||= !nodeOk;

let config;
try {
  config = loadConfig(["--no-open"]);
  line(true, "配置文件", `provider=${config.provider}`);
} catch (error) {
  line(false, "配置文件", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
  process.exit();
}

const codex = await resolveCodex(config);
const codexVersion = command(codex, ["--version"]);
const codexOk = codexVersion.status === 0;
line(
  codexOk,
  "Codex CLI",
  codexOk
    ? (codexVersion.stdout || codexVersion.stderr).trim()
    : "未找到；请安装最新版 @openai/codex",
);
failed ||= !codexOk;

if (codexOk) {
  const execHelp = command(codex, ["exec", "--help"]);
  const helpText = `${execHelp.stdout || ""}\n${execHelp.stderr || ""}`;
  const missingFlags = REQUIRED_CODEX_FLAGS.filter((flag) => !helpText.includes(flag));
  const capabilitiesOk = execHelp.status === 0 && missingFlags.length === 0;
  line(
    capabilitiesOk,
    "Codex Agent 能力",
    capabilitiesOk ? "结构化输出、临时会话和只读沙箱可用" : `缺少 ${missingFlags.join("、")}`,
  );
  failed ||= !capabilitiesOk;

  if (config.provider === "codex") {
    const login = command(codex, ["login", "status"]);
    const loginText = `${login.stdout || ""}\n${login.stderr || ""}`.trim();
    const loginOk = login.status === 0 && /Logged in using ChatGPT/i.test(loginText);
    line(loginOk, "Codex 订阅登录", loginOk ? "ChatGPT 订阅已登录" : "请运行 codex login");
    failed ||= !loginOk;
  }
}

if (config.provider === "third-party") {
  const endpointOk = Boolean(config.thirdParty.baseUrl && config.thirdParty.model);
  line(
    endpointOk,
    "第三方 Responses 接口",
    endpointOk
      ? `${config.thirdParty.name} / ${config.thirdParty.model}`
      : "需要配置 baseUrl 和 model",
  );
  failed ||= !endpointOk;
}

const manifestPath = join(ROOT, "knowledge", "corpus", "manifest.json");
let corpusDetail = "清单不存在";
let corpusOk = false;
if (existsSync(manifestPath)) {
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const documents = Number(manifest.documents || manifest.totalDocuments || 0);
    corpusDetail = documents
      ? `${documents.toLocaleString("zh-CN")} 条原文记录`
      : "基础 Wiki 可用；完整原文库可按需同步";
    corpusOk = true;
  } catch {
    corpusDetail = "清单无法解析";
  }
}
line(corpusOk, "本地知识库", corpusDetail);
failed ||= !corpusOk;

process.stdout.write(
  failed
    ? "\n环境检查未通过，请按 docs/installation.zh-CN.md 修复后重试。\n"
    : "\n环境检查通过，可以运行 npm start 或平台启动脚本。\n",
);
process.exitCode = failed ? 1 : 0;
