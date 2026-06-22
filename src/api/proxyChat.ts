import { processSSEStream } from './streamUtils.js';
import type { StreamToolCallChunk, StreamUsage } from './streamUtils.js';
import { getApiKey } from '../auth/credentials.js';

const CHAT_PROXY = 'https://qinaidatabase.rth1.xyz/api/chat.php';

export type Platform =
  | 'bigmodel' | 'longcat' | 'deepseek' | 'siliconflow' | 'chatanywhere'
  | 'openrouter' | 'xfyun' | 'astron' | 'aiwano' | 'aihubmix' | 'crouter'
  | 'custom';

export interface ProxyChatParams {
  platform: Platform;
  model: string;
  messages: Array<{ role: string; content: any; [key: string]: any }>;
  tools?: object[];
  temperature?: number;
  maxTokens?: number;
  errorPrefix: string;
  extraParams?: Record<string, any>;
  enableThinking?: boolean;
  /** Custom model config (only used when platform === 'custom') */
  customBaseUrl?: string;
  customApiKey?: string;
}

function sanitizeMessages(
  messages: Array<{ role: string; content: any; [key: string]: any }>,
): Array<{ role: string; content: any; [key: string]: any }> {
  return messages.map((msg) => {
    // Strip fields the upstream proxy does not understand (causes HTTP 500)
    const { reasoning_content, reasoning, tool_calls, ...rest } = msg;
    if (rest.content === null || rest.content === undefined) rest.content = '';
    return rest;
  });
}

/** For platform === 'custom': direct OpenAI-compatible call */
async function customDirectRequest(params: ProxyChatParams): Promise<Response> {
  const { customBaseUrl, customApiKey, model, messages, tools, temperature, maxTokens, extraParams } = params;
  const url = `${customBaseUrl?.replace(/\/$/, '')}/chat/completions`;
  const body: Record<string, any> = {
    model,
    messages: sanitizeMessages(messages),
    stream: true,
  };
  if (tools && tools.length > 0) body.tools = tools;
  if (temperature !== undefined) body.temperature = temperature;
  if (maxTokens !== undefined) body.max_tokens = maxTokens;
  if (extraParams) Object.assign(body, extraParams);

  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${customApiKey}`,
    },
    body: JSON.stringify(body),
  });
}

/** For built-in platforms: route through PHP proxy (desktop/CLI mode) */
async function buildFormData(params: ProxyChatParams): Promise<string> {
  const { platform, model, messages, tools, temperature, maxTokens, extraParams, enableThinking } = params;
  const formData: Record<string, string> = {
    platform,
    model,
    messages: JSON.stringify(sanitizeMessages(messages)),
    stream: 'true',
  };

  // Fetch API key for platforms that need it
  const apiKey = await getApiKey(platform);
  if (apiKey) {
    formData.api_key = apiKey;
  }

  if (tools && tools.length > 0) formData.tools = JSON.stringify(tools);
  if (temperature !== undefined) formData.temperature = String(temperature);
  if (maxTokens !== undefined) formData.max_tokens = String(maxTokens);
  if (platform === 'deepseek') {
    const shouldThink = enableThinking ?? (model === 'deepseek-v4-pro');
    formData.thinking = shouldThink ? 'enabled' : 'disabled';
  }
  if (extraParams) formData.extra_params = JSON.stringify(extraParams);
  return new URLSearchParams(formData).toString();
}

export async function proxyChatRequest(
  params: ProxyChatParams,
  accessToken?: string,
  signal?: AbortSignal,
): Promise<Response> {
  if (params.platform === 'custom') {
    return customDirectRequest(params);
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

  return fetch(CHAT_PROXY, {
    method: 'POST',
    headers,
    body: await buildFormData(params),
    ...(signal ? { signal } : {}),
  });
}

export async function* proxyStreamChat(
  params: ProxyChatParams,
  accessToken?: string,
  signal?: AbortSignal,
): AsyncGenerator<string | { reasoning: string } | { toolCall: StreamToolCallChunk } | { usage: StreamUsage }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120_000);
  const combined = signal
    ? AbortSignal.any([signal, controller.signal])
    : controller.signal;

  let response: Response;
  try {
    response = await proxyChatRequest(params, accessToken, combined);
  } catch (err: any) {
    throw new Error(`${params.errorPrefix}: 网络请求失败 - ${err?.message}`);
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const errorText = await response.text();
    // Debug: log request params on error (excluding sensitive keys)
    const debugParams = { ...params, api_key: '[REDACTED]', accessToken: '[REDACTED]' };
    console.error(`[DEBUG] Request failed: platform=${params.platform} model=${params.model} messagesCount=${params.messages.length}`);
    console.error(`[DEBUG] Messages preview:`, JSON.stringify(params.messages.slice(-2)).slice(0, 500));
    // Server may return HTML error pages (Cloudflare, Nginx, etc.)
    // Only try JSON.parse if it looks like JSON
    if (errorText.trimStart().startsWith('{') || errorText.trimStart().startsWith('[')) {
      try {
        const errJson = JSON.parse(errorText);
        if (errJson.error === 'tier_insufficient' && errJson.message) {
          throw new Error(errJson.message);
        }
      } catch {
        // JSON parse failed despite looking like JSON, fall through
      }
    }
    const preview = errorText.slice(0, 200).replace(/\n/g, ' ');
    throw new Error(`${params.errorPrefix}: HTTP ${response.status} - ${preview}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('text/event-stream')) {
    yield* processSSEStream(response);
    return;
  }

  // Try JSON, fall back to raw text for error diagnostics
  const rawText = await response.text();
  let data: any;
  try {
    data = JSON.parse(rawText);
  } catch {
    // Server returned non-JSON (HTML error page, plain text, etc.)
    const preview = rawText.slice(0, 200).replace(/\n/g, ' ');
    throw new Error(`${params.errorPrefix}: 服务器返回了非预期响应 — ${preview}`);
  }
  if (data.error) throw new Error(`${params.errorPrefix}: ${JSON.stringify(data.error)}`);
  const choice = data.choices?.[0];
  const content = choice?.message?.content ?? '';
  const reasoning = choice?.message?.reasoning_content ?? '';
  const toolCalls = choice?.message?.tool_calls;
  if (reasoning) yield { reasoning };
  if (content) yield content;
  if (toolCalls) for (const tc of toolCalls) yield { toolCall: tc };
  if (data.usage) yield { usage: data.usage };
}
