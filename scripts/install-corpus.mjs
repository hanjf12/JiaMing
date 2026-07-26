import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, readdir, stat } from "node:fs/promises";
import { basename, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const MANIFEST_PATH = join(ROOT, "knowledge", "corpus", "corpus-package.json");
const TARGET = join(ROOT, "knowledge", "corpus", "vendor");
const ALLOWED_ROOTS = new Set(["chinese-poetry", "chinese-classical-corpus"]);

function fail(message) {
  console.error(`原文库安装失败：${message}`);
  process.exitCode = 1;
}

function runTar(args) {
  return new Promise((resolvePromise, reject) => {
    const command = process.platform === "win32" ? "tar.exe" : "tar";
    const child = spawn(command, args, {
      cwd: ROOT,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => {
      reject(new Error(
        error.code === "ENOENT"
          ? "系统中找不到 tar 命令"
          : error.message,
      ));
    });
    child.on("close", (code) => {
      if (code === 0) resolvePromise(stdout);
      else reject(new Error(stderr.trim() || `tar 退出码 ${code}`));
    });
  });
}

function sha256(path) {
  return new Promise((resolvePromise, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolvePromise(hash.digest("hex")));
  });
}

function validateEntries(listing) {
  const entries = String(listing)
    .split(/\r?\n/)
    .map((line) => line.trim().replaceAll("\\", "/").replace(/^\.\/+/, ""))
    .filter(Boolean);
  if (!entries.length) throw new Error("压缩包为空");

  for (const entry of entries) {
    if (
      isAbsolute(entry)
      || /^[a-z]:/i.test(entry)
      || entry.split("/").includes("..")
    ) {
      throw new Error(`压缩包包含不安全路径：${entry}`);
    }
    const root = entry.split("/")[0];
    if (!ALLOWED_ROOTS.has(root)) {
      throw new Error(`压缩包包含未知顶层目录：${root}`);
    }
  }
  return entries.length;
}

const manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
const cliArgs = process.argv.slice(2);
const verifyOnly = cliArgs.includes("--verify-only");
const archiveArg = cliArgs.find((arg) => arg !== "--verify-only");

if (!archiveArg) {
  console.log(`请先从 ${manifest.download.shareUrl} 下载 ${manifest.fileName}`);
  console.log(`然后运行：npm run corpus:install -- "<下载目录>/${manifest.fileName}"`);
  process.exit(1);
}

const archive = resolve(archiveArg);
try {
  const file = await stat(archive);
  if (!file.isFile()) throw new Error("给定路径不是文件");
  if (basename(archive) !== manifest.fileName) {
    console.warn(`提示：文件名不是推荐名称 ${manifest.fileName}，将继续用校验值确认内容。`);
  }
  if (file.size !== manifest.sizeBytes) {
    throw new Error(`文件大小不符：实际 ${file.size}，预期 ${manifest.sizeBytes}`);
  }

  console.log("正在校验 SHA-256…");
  const actualHash = await sha256(archive);
  if (actualHash.toLowerCase() !== manifest.sha256.toLowerCase()) {
    throw new Error(`SHA-256 不匹配：${actualHash}`);
  }

  console.log("正在检查压缩包路径…");
  const entryCount = validateEntries(await runTar(["-tzf", archive]));
  if (verifyOnly) {
    console.log(`语料包校验通过：${entryCount} 个条目。`);
    process.exit(0);
  }

  await mkdir(TARGET, { recursive: true });
  const existing = await readdir(TARGET);
  if (existing.length) {
    throw new Error(
      `目标目录已有内容：${TARGET}。为避免覆盖，请先自行移动或清理已有原文库。`,
    );
  }

  console.log(`正在解压 ${entryCount} 个条目…`);
  await runTar(["-xzf", archive, "-C", TARGET]);

  for (const directory of ALLOWED_ROOTS) {
    const info = await stat(join(TARGET, directory));
    if (!info.isDirectory()) throw new Error(`缺少目录：${directory}`);
  }

  console.log(`原文库安装完成：${TARGET}`);
  console.log("Agent 现在可以通过只读 Shell 检索完整经典原文。");
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
