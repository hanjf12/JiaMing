type ChatContext = {
  index?: number;
  title?: string;
  source?: string;
  content?: string;
};

type ChatMessage = {
  role?: string;
  content?: string;
};

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

function configuration() {
  const provider = (process.env.AI_PROVIDER || "ollama").toLowerCase();
  const model = process.env.AI_MODEL || "";
  return {
    provider,
    baseUrl: (process.env.AI_BASE_URL || "http://127.0.0.1:11434").replace(/\/+$/, ""),
    model,
    configured: Boolean(model),
    apiKey: process.env.AI_API_KEY || "",
  };
}

function buildSystemPrompt(strict: boolean) {
  return [
    "你是中文宝宝起名助手。先依据给定的检索资料回答，给出文化出处、字义和连姓读音方面的理由。",
    "不得伪造古籍原句、篇名、作者或知识库中不存在的出处。",
    strict ? "严格模式：超出资料的内容要明确说“知识库未提供”，不要凭印象补写。" : "",
    "八字和五行只可作为传统民俗文化偏好，不得把它说成科学结论，不得断言吉凶。",
    "如果用户只给四柱、未给明确的五行用字倾向，不得擅自推算或声称已判断“喜用神”。",
    "用简洁、自然的中文回答。引用检索片段时用 [1]、[2] 标注。",
  ].filter(Boolean).join("\n");
}

function sanitizeBody(body: Record<string, unknown>) {
  const question = String(body.question || "").trim().slice(0, 1200);
  const context = Array.isArray(body.context)
    ? (body.context as ChatContext[]).slice(0, 8).map((item, index) => ({
        index: index + 1,
        title: String(item.title || `资料 ${index + 1}`).slice(0, 120),
        source: String(item.source || "本地知识库").slice(0, 180),
        content: String(item.content || "").slice(0, 1800),
      }))
    : [];
  const messages = Array.isArray(body.messages)
    ? (body.messages as ChatMessage[]).slice(-8).map((item) => ({
        role: item.role === "assistant" ? "assistant" : "user",
        content: String(item.content || "").slice(0, 1200),
      }))
    : [];
  const rawProfile = body.profile && typeof body.profile === "object"
    ? body.profile as Record<string, unknown>
    : {};
  const profile = {
    surname: String(rawProfile.surname || "").slice(0, 2),
    gender: String(rawProfile.gender || "any").slice(0, 8),
    preferredSources: Array.isArray(rawProfile.preferredSources)
      ? rawProfile.preferredSources.slice(0, 5).map(String)
      : [],
    temperament: String(rawProfile.temperament || "any").slice(0, 20),
    include: String(rawProfile.include || "").slice(0, 2),
    avoid: String(rawProfile.avoid || "").slice(0, 8),
    bazi: rawProfile.bazi ? String(rawProfile.bazi).slice(0, 20) : undefined,
    baziElement: rawProfile.baziElement
      ? String(rawProfile.baziElement).slice(0, 2)
      : undefined,
  };
  return { question, context, messages, profile, strict: body.strict !== false };
}

export async function GET() {
  const config = configuration();
  return json({
    configured: config.configured,
    provider: config.provider,
    model: config.model || "未配置",
    privacy: "模型服务地址仅由服务端环境变量配置",
  });
}

export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") || 0) > 65_536) {
    return json({ error: "请求内容过大" }, 413);
  }

  let raw: Record<string, unknown>;
  try {
    raw = await request.json();
  } catch {
    return json({ error: "请求格式无效" }, 400);
  }

  const body = sanitizeBody(raw);
  if (!body.question) return json({ error: "请输入问题" }, 400);

  const config = configuration();
  if (!config.configured) {
    return json({ error: "托管环境未配置模型，请使用本地知识库模式" }, 503);
  }
  const contextText = body.context.length
    ? body.context.map((item) =>
        `[${item.index}] ${item.title}\n来源：${item.source}\n${item.content}`,
      ).join("\n\n")
    : "本次没有命中可引用的知识片段。";
  const userPrompt = [
    `用户资料（可能为空）：${JSON.stringify(body.profile)}`,
    `检索资料：\n${contextText}`,
    `当前问题：${body.question}`,
  ].join("\n\n");
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (config.apiKey) headers.authorization = `Bearer ${config.apiKey}`;

  try {
    if (config.provider === "ollama") {
      const response = await fetch(`${config.baseUrl}/api/chat`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: config.model,
          stream: false,
          messages: [
            { role: "system", content: buildSystemPrompt(body.strict) },
            ...body.messages,
            { role: "user", content: userPrompt },
          ],
          options: { temperature: 0.35 },
        }),
        signal: AbortSignal.timeout(120_000),
      });
      const data = await response.json() as {
        message?: { content?: string };
        error?: string;
      };
      if (!response.ok) throw new Error(data.error || `Ollama 返回 ${response.status}`);
      return json({ answer: data.message?.content || "模型没有返回内容" });
    }

    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: config.model,
        temperature: 0.35,
        messages: [
          { role: "system", content: buildSystemPrompt(body.strict) },
          ...body.messages,
          { role: "user", content: userPrompt },
        ],
      }),
      signal: AbortSignal.timeout(120_000),
    });
    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    };
    if (!response.ok) {
      throw new Error(data.error?.message || `兼容接口返回 ${response.status}`);
    }
    return json({ answer: data.choices?.[0]?.message?.content || "模型没有返回内容" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "模型调用失败";
    return json({ error: message }, 502);
  }
}
