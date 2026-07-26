export const KNOWLEDGE_SHELL_COMMANDS = [
  {
    id: "file_find",
    command: "rg --files --no-ignore knowledge",
    corpus: "rg --files --no-ignore knowledge/corpus/vendor",
    windows: "Get-ChildItem -LiteralPath knowledge -Recurse -File -Force",
    macos: "find knowledge -type f",
    description: "发现 Wiki 与完整原文库；`--no-ignore` 关闭 Git 忽略规则，同时不读取隐藏的 .git 元数据。",
  },
  {
    id: "file_grep",
    command: 'rg -n -i -m 20 "<关键词>" knowledge/wiki knowledge/llms.txt',
    corpus: 'rg -n -F --no-ignore -m 8 -B 12 -A 5 "<原句或罕见字>" <catalog 指定的 knowledge/corpus/vendor 路径>',
    windows: "Get-ChildItem -LiteralPath <原文目录> -Recurse -File -Force | Select-String -SimpleMatch <关键词>",
    macos: "grep -RIn -F -m 8 <关键词> <原文目录>",
    description: "在 Wiki 或 catalog 指定的原文目录中定位关键词、上下文及行号；原文检索明确关闭忽略规则。",
  },
  {
    id: "file_read",
    command: "按当前系统使用 Get-Content -Encoding UTF8 <文件> 或 sed -n '1,220p' <文件>",
    windows: "Get-Content -Encoding UTF8 <知识库文件>",
    macos: "sed -n '1,220p' <知识库文件>",
    description: "按需读取命中的 Markdown、JSON 上下文或清单；不要一次加载整个大库。",
  },
];

function commandText(item) {
  const value = item?.command ?? item?.cmd ?? item?.text ?? "";
  if (Array.isArray(value)) return value.join(" ");
  return String(value || "");
}

export function completedKnowledgeCommands(jsonLines) {
  const used = [];
  for (const line of String(jsonLines || "").split(/\r?\n/)) {
    try {
      const event = JSON.parse(line);
      if (event?.type !== "item.completed") continue;
      if (
        event.item?.type !== "command_execution"
        || event.item?.exit_code !== 0
        || event.item?.status !== "completed"
      ) continue;
      const text = commandText(event.item);
      const rgFiles = /\brg(?:\.exe)?\s+--files\b/i.test(text);
      const find = /\bGet-ChildItem\b/i.test(text)
        || /(?:^|[\s"';&|])find(?:\.exe)?\s+knowledge(?:[\\/]|(?:\s|$))/i.test(text)
        || rgFiles;
      const grep = /\bSelect-String\b/i.test(text)
        || /(?:^|[\s"';&|])grep(?:\.exe)?\b/i.test(text)
        || (/\brg(?:\.exe)?\b/i.test(text) && !rgFiles);
      const read = /\bGet-Content\b/i.test(text)
        || /(?:^|[\s"';&|])(?:cat|sed|head|tail)(?:\.exe)?\b/i.test(text);
      if (find) used.push("file_find");
      if (grep) used.push("file_grep");
      if (read) used.push("file_read");
    } catch {
      // Ignore diagnostics that are not JSON events.
    }
  }
  return [...new Set(used)];
}

export function knowledgeShellGuide() {
  return KNOWLEDGE_SHELL_COMMANDS
    .map((item) => [
      `- ${item.id}：${item.description}`,
      `  - 首选：\`${item.command}\``,
      item.corpus ? `  - 原文库：\`${item.corpus}\`` : "",
      `  - Windows 回退：\`${item.windows}\``,
      `  - macOS 回退：\`${item.macos}\``,
    ].filter(Boolean).join("\n"))
    .join("\n");
}
