import {
  callKnowledgeTool,
  chatCompletionTools,
  responseApiTools,
} from "../agent-tools.mjs";
import { buildPrompts, normalizeAgentResult } from "../prompt.mjs";

class ProviderError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}

function headers(config) {
  const result = {
    "content-type": "application/json",
    ...(config.openai.headers || {}),
  };
  if (config.openai.apiKey) result.authorization = `Bearer ${config.openai.apiKey}`;
  return result;
}

async function post(config, path, body) {
  const response = await fetch(`${config.openai.baseUrl}${path}`, {
    method: "POST",
    headers: headers(config),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(config.openai.timeoutMs),
  });
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!response.ok) {
    const message = data?.error?.message || data?.message || text || `HTTP ${response.status}`;
    throw new ProviderError(`模型接口返回 ${response.status}：${message}`, response.status);
  }
  return data;
}

function parseArguments(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`工具参数不是有效 JSON：${value}`);
  }
}

function contentText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((item) => typeof item === "string" ? item : item?.text || "")
    .join("");
}

async function executeTool(name, rawArguments, used) {
  try {
    const result = await callKnowledgeTool(name, parseArguments(rawArguments));
    used.push(name);
    return JSON.stringify(result);
  } catch (error) {
    return JSON.stringify({ error: error instanceof Error ? error.message : String(error) });
  }
}

async function askChatCompletions(config, request) {
  const prompts = buildPrompts(request, "api");
  const messages = [
    { role: "system", content: prompts.system },
    ...request.messages,
    { role: "user", content: prompts.user },
  ];
  const used = [];
  for (let round = 0; round < config.openai.maxToolRounds; round += 1) {
    const body = {
      model: config.openai.model,
      messages,
      tools: chatCompletionTools(),
      tool_choice: "auto",
    };
    if (config.openai.reasoningEffort) {
      body.reasoning_effort = config.openai.reasoningEffort;
    }
    const data = await post(config, "/chat/completions", body);
    const message = data?.choices?.[0]?.message;
    if (!message) throw new ProviderError("Chat Completions 没有返回 message");
    messages.push(message);
    const calls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
    if (!calls.length) {
      return normalizeAgentResult(contentText(message.content), used);
    }
    for (const call of calls) {
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        name: call.function?.name,
        content: await executeTool(call.function?.name, call.function?.arguments, used),
      });
    }
  }
  throw new ProviderError(`模型在 ${config.openai.maxToolRounds} 轮后仍未结束工具调用`);
}

function responseText(data) {
  if (typeof data?.output_text === "string") return data.output_text;
  return (data?.output || [])
    .filter((item) => item?.type === "message")
    .flatMap((item) => item.content || [])
    .filter((item) => item?.type === "output_text")
    .map((item) => item.text || "")
    .join("");
}

async function askResponses(config, request) {
  const prompts = buildPrompts(request, "api");
  const input = [
    ...request.messages,
    { role: "user", content: prompts.user },
  ];
  const used = [];
  for (let round = 0; round < config.openai.maxToolRounds; round += 1) {
    const body = {
      model: config.openai.model,
      instructions: prompts.system,
      input,
      tools: responseApiTools(),
      store: false,
    };
    if (config.openai.reasoningEffort) {
      body.reasoning = { effort: config.openai.reasoningEffort };
    }
    const data = await post(config, "/responses", body);
    const output = Array.isArray(data?.output) ? data.output : [];
    const calls = output.filter((item) => item?.type === "function_call");
    if (!calls.length) {
      const text = responseText(data);
      if (!text) throw new ProviderError("Responses API 没有返回文本");
      return normalizeAgentResult(text, used);
    }
    input.push(...output);
    for (const call of calls) {
      input.push({
        type: "function_call_output",
        call_id: call.call_id,
        output: await executeTool(call.name, call.arguments, used),
      });
    }
  }
  throw new ProviderError(`模型在 ${config.openai.maxToolRounds} 轮后仍未结束工具调用`);
}

export function openAIStatus(config) {
  return {
    configured: Boolean(config.openai.baseUrl && config.openai.model),
    provider: "OpenAI 兼容接口",
    model: config.openai.model || "未配置",
    apiStyle: config.openai.apiStyle,
    auth: config.openai.apiKey ? "已配置 API Key" : "未配置 API Key（允许本地免密服务）",
    baseUrl: config.openai.baseUrl,
  };
}

export async function askOpenAI(config, request) {
  if (!config.openai.baseUrl || !config.openai.model) {
    throw new ProviderError("请配置 OPENAI_BASE_URL 和 OPENAI_MODEL", 503);
  }
  return config.openai.apiStyle === "responses"
    ? askResponses(config, request)
    : askChatCompletions(config, request);
}
