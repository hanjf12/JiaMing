import { knowledgeShellGuide } from "./knowledge-shell.mjs";

const ALLOWED_TOOLS = new Set([
  "file_find",
  "file_grep",
  "file_read",
]);

export function clean(value, limit = 1200) {
  return String(value || "").trim().slice(0, limit);
}

export function sanitizeRequest(body, maxHistoryMessages = 8) {
  const attachments = Array.isArray(body.context)
    ? body.context.slice(0, 8).map((item, index) => ({
        index: index + 1,
        title: clean(item?.title || `自建资料 ${index + 1}`, 120),
        source: clean(item?.source || "用户导入", 180),
        content: clean(item?.content, 1800),
      }))
    : [];
  const messages = Array.isArray(body.messages)
    ? body.messages.slice(-maxHistoryMessages).map((item) => ({
        role: item?.role === "assistant" ? "assistant" : "user",
        content: clean(item?.content),
      }))
    : [];
  const rawProfile = body.profile && typeof body.profile === "object" ? body.profile : {};
  const profile = {
    surname: clean(rawProfile.surname, 8),
    gender: clean(rawProfile.gender, 16),
    preferredSources: Array.isArray(rawProfile.preferredSources)
      ? rawProfile.preferredSources.slice(0, 8).map((item) => clean(item, 30))
      : [],
    temperament: clean(rawProfile.temperament, 30),
    include: clean(rawProfile.include, 12),
    avoid: clean(rawProfile.avoid, 30),
  };
  if (rawProfile.bazi) profile.bazi = clean(rawProfile.bazi, 40);
  if (rawProfile.baziElement) profile.baziElement = clean(rawProfile.baziElement, 8);
  if (rawProfile.baziNotice) profile.baziNotice = clean(rawProfile.baziNotice, 240);
  return {
    question: clean(body.question),
    strict: body.strict !== false,
    retrievalScope: clean(body.retrievalScope, 40) || "all",
    topK: Math.max(3, Math.min(Number(body.topK) || 6, 12)),
    attachments,
    messages,
    profile,
  };
}

export function buildPrompts(request) {
  const attachments = request.attachments.length
    ? request.attachments
        .map((item) => `[自建资料 ${item.index}] ${item.title}\n来源：${item.source}\n${item.content}`)
        .join("\n\n")
    : "无。";
  const system = [
    "你是“问典”，一个中文宝宝起名知识 Agent。",
    "先使用 Codex 内置 shell 工具直接查看本项目的文件知识库，再回答；不要仅凭模型记忆补写出处。",
    `检索范围：${request.retrievalScope}；优先保留约 ${request.topK} 条相关证据。`,
    "文件知识库入口是 knowledge/llms.txt，检索说明是 knowledge/README.md，完整语料路径表是 knowledge/corpus/catalog.md。",
    "只允许在 knowledge/ 目录内使用以下只读 Shell 命令族：",
    knowledgeShellGuide(),
    "标准流程：先用 rg/grep 在 llms.txt 与 Wiki 中定位相关页面，再读取命中的少量 Markdown；不要完整输出 llms.txt 或 llms-full.txt。只有不清楚目录时才局部读取 README.md；涉及原句、篇名或作者时，按 corpus/catalog.md 缩小目录后用固定字符串检索原始 JSON，并保留文件路径和行号。",
    "姓名建议至少完成一次 file_grep 和一次 file_read；需要确认目录时再运行 file_find。涉及原文时优先使用 `rg -n -F -m 8 -B 12 -A 5`，不要用单个常见汉字扫描整个语料。",
    "不要调用 MCP、网页、浏览器、SQLite 或项目脚本。不得访问网络、修改文件、读取 knowledge/ 之外的路径，也不得执行 Node、Python、Git 或系统管理命令。",
    "命令参数必须来自当前问题。不要使用重定向、命令替换、环境变量、控制流或写入命令；只有为了截断输出时才可把只读结果交给 head、tail 或 Select-Object。",
    "严禁伪造原句、篇名、作者和出处；找不到就明确说明。",
    request.strict
      ? "严格引用：答案中的事实和出处只能来自本轮工具结果或用户明确提供的资料。"
      : "",
    "八字与五行只作为用户主动提供的传统文化偏好，不是科学预测；不得擅自推算喜用神或断言吉凶。",
    "最终返回 JSON 对象：answer 为中文回答；citations 为 {title,source,verified} 数组；toolsUsed 为实际成功运行的命令标识（file_find、file_grep、file_read）数组。",
    "answer 中的 [n] 必须对应 citations[n-1]；source 优先写 `knowledge/...:行号`，并保留作品、作者或上游来源信息。提交前检查编号。",
  ].filter(Boolean).join("\n");
  const user = [
    `用户资料：${JSON.stringify(request.profile)}`,
    `用户授权随本次问题提供的自建资料：\n${attachments}`,
    `当前问题：${request.question}`,
  ].join("\n\n");
  return { system, user };
}

export function normalizeAgentResult(raw, observedTools = null) {
  let parsed = raw;
  if (typeof raw === "string") {
    const text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    try {
      parsed = JSON.parse(text);
    } catch {
      return {
        answer: clean(raw, 16_000),
        citations: [],
        toolsUsed: Array.isArray(observedTools) ? observedTools : [],
      };
    }
  }
  const citations = Array.isArray(parsed?.citations)
    ? parsed.citations.slice(0, 12).map((item) => ({
        title: clean(item?.title, 160),
        source: clean(item?.source, 240),
        verified: Boolean(item?.verified),
      })).filter((item) => item.title && item.source)
    : [];
  const declared = Array.isArray(parsed?.toolsUsed)
    ? parsed.toolsUsed.map(String).filter((name) => ALLOWED_TOOLS.has(name))
    : [];
  const toolsUsed = [
    ...new Set(Array.isArray(observedTools) ? observedTools : declared),
  ];
  return {
    answer: clean(parsed?.answer, 16_000) || "模型没有返回可显示的回答",
    citations,
    toolsUsed,
  };
}
