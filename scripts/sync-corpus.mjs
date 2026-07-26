import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VENDOR = path.join(ROOT, "knowledge", "corpus", "vendor");
const POETRY = path.join(VENDOR, "chinese-poetry");
const CLASSICS = path.join(VENDOR, "chinese-classical-corpus");
const gitCandidates = [
  process.env.GIT_BIN,
  "git",
  path.join(homedir(), ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "native", "git", "cmd", "git.exe"),
].filter(Boolean);

function findGit() {
  for (const candidate of gitCandidates) {
    const result = spawnSync(candidate, ["--version"], { windowsHide: true, encoding: "utf8" });
    if (result.status === 0) return candidate;
  }
  throw new Error("未找到 Git。请安装 Git，或设置 GIT_BIN 后重试。");
}

const git = findGit();

function run(command, args, cwd = ROOT) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.status !== 0) throw new Error(`${path.basename(command)} 执行失败`);
}

function safeArgs(repository, args) {
  const normalized = repository.split(path.sep).join("/");
  return ["-c", `safe.directory=${normalized}`, "-C", repository, ...args];
}

function syncRepository({ directory, url, branch, patterns }) {
  if (!existsSync(path.join(directory, ".git"))) {
    run(git, ["clone", "--filter=blob:none", "--depth=1", "--no-checkout", url, directory]);
  } else {
    run(git, safeArgs(directory, ["pull", "--ff-only"]));
  }
  run(git, safeArgs(directory, ["sparse-checkout", "init", "--no-cone"]));
  run(git, safeArgs(directory, ["sparse-checkout", "set", ...patterns]));
  run(git, safeArgs(directory, ["checkout", branch]));
}

await mkdir(VENDOR, { recursive: true });
syncRepository({
  directory: POETRY,
  url: "https://github.com/chinese-poetry/chinese-poetry.git",
  branch: "master",
  patterns: [
    "/四书五经/", "/论语/", "/诗经/", "/楚辞/", "/曹操诗集/", "/五代诗词/",
    "/全唐诗/poet.tang.*.json", "/全唐诗/poet.song.*.json",
    "/全唐诗/authors.tang.json", "/全唐诗/authors.song.json",
    "/宋词/", "/元曲/", "/纳兰性德/", "/LICENSE", "/README.md",
  ],
});
syncRepository({
  directory: CLASSICS,
  url: "https://github.com/gujilab/chinese-classical-corpus.git",
  branch: "main",
  patterns: ["/output/sishu/", "/output/wujing/", "/output/shisanjing/", "/LICENSE", "/README.md"],
});
process.stdout.write("原始语料同步完成；LLM Agent 将通过只读 Shell 直接检索这些文件。\n");
