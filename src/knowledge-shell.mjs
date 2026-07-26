export const KNOWLEDGE_SHELL_COMMANDS = [
  {
    id: "file_find",
    command: "rg --files knowledge",
    windows: "Get-ChildItem knowledge -Recurse -File",
    macos: "find knowledge -type f",
    description: "发现 llms.txt、Wiki 页面、语料目录和原始文本文件。",
  },
  {
    id: "file_grep",
    command: 'rg -n -i -m 20 "<关键词>" knowledge/wiki knowledge/llms.txt',
    windows: "Select-String -Path <知识库文件> -Pattern <关键词>",
    macos: "grep -RIn -m 20 <关键词> knowledge/wiki",
    description: "在 Wiki 或原始语料中定位关键词、原句及行号。",
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
      `  - Windows 回退：\`${item.windows}\``,
      `  - macOS 回退：\`${item.macos}\``,
    ].join("\n"))
    .join("\n");
}
