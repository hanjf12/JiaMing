export const KNOWLEDGE_SHELL_COMMANDS = [
  {
    id: "knowledge_status",
    command: "node scripts/knowledge.mjs status",
    description: "查看本地 Wiki、知识图谱与经典原文库状态。",
  },
  {
    id: "wiki_search",
    command: 'node scripts/knowledge.mjs wiki-search --query "<关键词>" --scope <范围> --limit <1-12>',
    description: "检索姓名、方法、来源、音韵、用字和八字边界。",
  },
  {
    id: "wiki_read",
    command: "node scripts/knowledge.mjs wiki-read --id <pageId>",
    description: "读取一个完整 Wiki Markdown 页面并查看互链。",
  },
  {
    id: "corpus_search",
    command: 'node scripts/knowledge.mjs corpus-search --query "<原句或关键词>" --scope <范围> --limit <1-12>',
    description: "检索四书五经、十三经与历代诗词原文。",
  },
];

const COMMAND_PATTERNS = [
  ["knowledge_status", /\bscripts[\\/]knowledge\.mjs\s+status\b/i],
  ["wiki_search", /\bscripts[\\/]knowledge\.mjs\s+wiki-search\b/i],
  ["wiki_read", /\bscripts[\\/]knowledge\.mjs\s+wiki-read\b/i],
  ["corpus_search", /\bscripts[\\/]knowledge\.mjs\s+corpus-search\b/i],
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
      for (const [id, pattern] of COMMAND_PATTERNS) {
        if (pattern.test(text)) used.push(id);
      }
    } catch {
      // Ignore diagnostics that are not JSON events.
    }
  }
  return [...new Set(used)];
}

export function knowledgeShellGuide() {
  return KNOWLEDGE_SHELL_COMMANDS
    .map((item) => `- \`${item.command}\`：${item.description}`)
    .join("\n");
}
