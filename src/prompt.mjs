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
    "你是“嘉名”，专注中文宝宝起名与典籍出处核验。",
    "面向用户时始终自称“嘉名”，使用自然的产品语言。answer、nameCards 和 citations.title 中不得提及 Agent、LLM、Codex、Shell、Wiki、rg、grep、文件路径或其他实现细节；只说“查阅典籍”“核对原文”或“参考资料”。不要向用户解释内部检索方式。",
    "先使用 Codex 内置 shell 工具直接查看本项目的文件知识库，再回答；不要仅凭模型记忆补写出处。",
    `检索范围：${request.retrievalScope}；优先保留约 ${request.topK} 条相关证据。`,
    "文件知识库入口是 knowledge/llms.txt，检索说明是 knowledge/README.md，完整语料路径表是 knowledge/corpus/catalog.md。",
    "只允许在 knowledge/ 目录内使用以下只读 Shell 命令族：",
    knowledgeShellGuide(),
    "标准流程：先用 rg/grep 在 llms.txt 与 Wiki 中定位相关页面，再读取命中的少量 Markdown；不要完整输出 llms.txt 或 llms-full.txt。涉及原句、篇名或作者时，先读取 corpus/catalog.md，再用 `rg --files --no-ignore knowledge/corpus/vendor` 确认完整原文库，缩小目录后检索原始 JSON，并保留文件路径和行号。",
    "姓名建议至少完成一次 file_grep 和一次 file_read；需要确认目录时再运行 file_find。涉及原文时使用 `rg -n -F --no-ignore -m 8 -B 12 -A 5`，不要用单个常见汉字扫描整个语料。",
    "`knowledge/corpus/vendor/` 被 Git 忽略，所有文件发现与原文检索命令必须带 `--no-ignore`，或使用不受 Git 忽略影响的系统回退命令。不要使用 `-uu`，避免读取原文库内隐藏的 .git 元数据。不得用普通 `rg --files knowledge` 判断原文库状态。",
    "用户询问某个具体汉字的含义、典故或搭配时，即使 Wiki 没有该字的专页，也必须按 catalog 对这个字做固定字符串原文检索。罕见字可以在已缩小的原文目录中单字检索；先读取命中记录的篇名、作者和上下文，再决定是否适合起名。",
    "只有 `rg --files --no-ignore knowledge/corpus/vendor` 与当前系统回退命令都确认无文件时，才能报告完整原文库未安装。Wiki 未命中只表示没有编辑页，不表示原文库没有证据。",
    "不要调用 MCP、网页、浏览器、SQLite 或项目脚本。不得访问网络、修改文件、读取 knowledge/ 之外的路径，也不得执行 Node、Python、Git 或系统管理命令。",
    "命令参数必须来自当前问题。不要使用重定向、命令替换、环境变量、控制流或写入命令；只有为了截断输出时才可把只读结果交给 head、tail 或 Select-Object。",
    "严禁伪造原句、篇名、作者和出处；找不到就明确说明。",
    request.strict
      ? "严格引用：答案中的事实和出处只能来自本轮工具结果或用户明确提供的资料。"
      : "",
    "八字与五行只作为用户主动提供的传统文化偏好，不是科学预测；不得擅自推算喜用神或断言吉凶。",
    "最终返回 JSON 对象：answer 为中文回答；citations 为 {title,source,verified} 数组；toolsUsed 为实际成功运行的命令标识（file_find、file_grep、file_read）数组。",
    "当回答包含姓名推荐或姓名比较时，先在内部生成约 24 个候选，再经过出处、语境、连姓音韵、常用字、多音字、普通话谐音、用户避用字和长期使用成本过滤，最后返回不重复且意象有差异的 6 个 nameCards；不要把首次想到的名字直接作为最终结果。",
    "用户明确要求某个字的搭配名字时，最终 nameCards 应使用该字；若可靠证据不足以支持 6 个，应说明限制并减少数量，不要用无关名字凑数。",
    "候选使用三条路线：direct（原文相邻字词直取）、adapted（同篇或同一典故中选取不相邻语义单元进行化用）、combined（两个相关来源各取一字或一层意象后合意）。名字的自然使用感优先于机械截取连续两字。",
    "默认 6 个结果采用 1 个 direct、3 个 adapted、2 个 combined；若可靠原文不足可调整数量，但至少使用两种路线，并避免超过 2 个候选依赖同一原句。单字名不强求该比例。",
    "direct 只有名字两字确实在 quote 中连续出现时才能使用；跨句、换序、删改或重组一律标 adapted；combined 必须提供两个分别核验的来源。不得把化用或合意声称为原文固定词组。",
    "每个 nameCards 项必须包含 name（带姓完整姓名）、pinyin、compositionMode、source、quote、source2、quote2、compositionReason、meaning、phoneticNote、riskNote、verified。source/source2 只写作者与作品名，不写 knowledge/ 本地路径；非 combined 的 source2 和 quote2 返回空字符串。",
    "phoneticNote 必须按完整姓名检查普通话声调和连读，遇到多音字要指出；riskNote 检查普通话谐音、生僻字、现代联想及原文情绪语境，并提醒方言仍需家人核验。不要给不可验证的吉凶总分或重名率。",
    "verified 仅表示卡片所列原句、作者和篇名均由本轮 Shell 结果支持；combined 的两个来源都核验后才能为 true。纯方法问答返回空 nameCards。",
    "当返回 nameCards 时，answer 只写简短的整体选择建议和各路线差别，不要再次逐项抄写姓名、原句、路径或引用清单；详细证据全部放在卡片中。",
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
        nameCards: [],
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
  const compositionMode = (value) => {
    const normalized = clean(value, 20).toLowerCase();
    if (["direct", "原文直取", "直取"].includes(normalized)) return "direct";
    if (["combined", "跨典合意", "合意"].includes(normalized)) return "combined";
    return "adapted";
  };
  const nameCards = Array.isArray(parsed?.nameCards)
    ? parsed.nameCards.slice(0, 6).map((item) => ({
        name: clean(item?.name, 20),
        pinyin: clean(item?.pinyin, 80),
        compositionMode: compositionMode(item?.compositionMode),
        source: clean(item?.source, 200),
        quote: clean(item?.quote, 500),
        source2: clean(item?.source2, 200),
        quote2: clean(item?.quote2, 500),
        compositionReason: clean(item?.compositionReason, 600)
          || "根据原文意象与完整姓名的使用感组合。",
        meaning: clean(item?.meaning, 600),
        phoneticNote: clean(item?.phoneticNote, 400)
          || "请结合完整姓名朗读，并由家人复核常用方言。",
        riskNote: clean(item?.riskNote, 400)
          || "未发现明确风险；正式落名前仍需核验方言谐音与户籍用字。",
        verified: Boolean(item?.verified),
      })).filter((item) => item.name && item.source && item.meaning)
    : [];
  return {
    answer: clean(parsed?.answer, 16_000) || "嘉名没有返回可显示的回答，请稍后重试",
    citations,
    nameCards,
    toolsUsed,
  };
}
