import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const manifestPath = fileURLToPath(
  new URL("../knowledge/corpus/corpus-package.json", import.meta.url),
);
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const sizeMiB = (manifest.sizeBytes / 1024 / 1024).toFixed(2);

console.log(`嘉名完整原文库 ${manifest.packageVersion}`);
console.log(`下载：${manifest.download.shareUrl}`);
console.log(`文件：${manifest.fileName}（${sizeMiB} MiB）`);
console.log(`SHA-256：${manifest.sha256}`);
if (manifest.download.passcode) {
  console.log(`提取码：${manifest.download.passcode}`);
}
console.log("");
console.log("下载完成后安装：");
console.log(`npm run corpus:install -- "<下载目录>/${manifest.fileName}"`);
