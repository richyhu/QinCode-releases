import { proxyStreamChat } from './proxyChat.js';
import type { Platform, ProxyChatParams } from './proxyChat.js';
export type { Platform };
export type { StreamUsage } from './streamUtils.js';

export interface ChatMessage {
  role: string;
  content: any;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
  reasoning_content?: string;
}

export interface StreamToolCall {
  index: number;
  id?: string;
  type?: string;
  function?: { name?: string; arguments?: string };
}

export interface CustomModelConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  modelId: string;
}

export async function* streamChat(
  platform: Platform,
  model: string,
  messages: ChatMessage[],
  systemPrompt: string,
  tools?: object[],
  accessToken?: string,
  customConfig?: CustomModelConfig,
  signal?: AbortSignal,
) {
  const systemMessage = { role: 'system', content: systemPrompt };
  const messagesWithSystem = [systemMessage, ...messages];

  const isThinking = platform === 'deepseek' && model === 'deepseek-v4-pro';

  const params: ProxyChatParams = {
    platform,
    model,
    messages: messagesWithSystem,
    tools,
    temperature: isThinking ? undefined : 0.7,
    errorPrefix: `${platform} API error`,
    enableThinking: isThinking,
    ...(platform === 'custom' && customConfig
      ? { customBaseUrl: customConfig.baseUrl, customApiKey: customConfig.apiKey }
      : {}),
  };

  yield* proxyStreamChat(params, accessToken, signal);
}
