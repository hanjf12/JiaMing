import { knowledgeShellGuide } from "./knowledge-shell.mjs";

const ALLOWED_TOOLS = new Set([
  "knowledge_status",
  "wiki_search",
  "wiki_read",
  "corpus_search",
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
    "先使用 Codex 内置 shell 工具运行本项目的只读知识命令，再回答；不要仅凭模型记忆补写出处。",
    `检索范围：${request.retrievalScope}；优先保留约 ${request.topK} 条相关证据。`,
    "只允许使用以下知识库 Shell 命令：",
    knowledgeShellGuide(),
    "姓名建议至少运行 status 和 wiki-search；涉及原句、篇名或作者时运行 corpus-search；需要方法、语境或音韵判断时沿 links 运行 wiki-read。",
    "不要调用 MCP、网页、浏览器或其他数据工具。不得访问网络或修改文件，也不要直接遍历 knowledge 目录来绕过知识命令。",
    "命令参数必须来自当前问题；不要拼接命令替换、重定向、管道、控制符或额外子命令。",
    "严禁伪造原句、篇名、作者和出处；找不到就明确说明。",
    request.strict
      ? "严格引用：答案中的事实和出处只能来自本轮工具结果或用户明确提供的资料。"
      : "",
    "八字与五行只作为用户主动提供的传统文化偏好，不是科学预测；不得擅自推算喜用神或断言吉凶。",
    "最终返回 JSON 对象：answer 为中文回答；citations 为 {title,source,verified} 数组；toolsUsed 为实际成功运行的命令标识（knowledge_status、wiki_search、wiki_read、corpus_search）数组。",
    "answer 中的 [n] 必须对应 citations[n-1]；原文引句优先对应 corpus_search 记录。提交前检查编号。",
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
