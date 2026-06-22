export interface StreamToolCallChunk {
  index: number;
  id?: string;
  type?: string;
  function?: { name?: string; arguments?: string };
}

export interface StreamUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

export async function* processSSEStream(
  response: Response,
): AsyncGenerator<string | { reasoning: string } | { toolCall: StreamToolCallChunk } | { usage: StreamUsage }> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') return;

        // Detect HTML error pages mixed into the SSE stream
        if (data.trimStart().startsWith('<')) {
          throw new Error(`服务器返回了 HTML 错误页，请检查网络或 API Key`);
        }

        try {
          const parsed = JSON.parse(data);
          if (parsed.error) throw new Error(`SSE error: ${JSON.stringify(parsed.error)}`);

          // Usage chunk (some providers send this as a separate event)
          if (parsed.usage) {
            yield { usage: parsed.usage };
          }

          const delta = parsed.choices?.[0]?.delta;
          if (delta?.content) yield delta.content;
          if (delta?.reasoning_content) yield { reasoning: delta.reasoning_content };
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) yield { toolCall: tc };
          }

          // Some providers send usage in the final chunk alongside choices
          const finishUsage = parsed.choices?.[0]?.usage ?? parsed.x_groq?.usage;
          if (finishUsage && (finishUsage.prompt_tokens || finishUsage.total_tokens)) {
            yield { usage: finishUsage };
          }
        } catch (err) {
          if (err instanceof Error && err.message.startsWith('SSE error:')) throw err;
          if (!(err instanceof SyntaxError)) throw err;
        }
      }
    }
  } catch (err: any) {
    if (err.name !== 'AbortError') throw err;
  } finally {
    reader.releaseLock();
  }
}

export function buildRequestBody(
  model: string,
  messages: Array<{ role: string; content: any }>,
  tools?: object[],
  extra: Record<string, any> = {},
) {
  const body: Record<string, any> = { model, messages, stream: true, ...extra };
  if (tools && tools.length > 0) body.tools = tools;
  return JSON.stringify(body);
}
