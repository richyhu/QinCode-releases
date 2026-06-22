import type { ContentBlock, Message, StreamEvent } from './types.js'
import type { Tool, ToolContext } from './Tool.js'

export type QueryYield =
  | { type: 'stream_start' }
  | { type: 'content_block_delta'; block: ContentBlock }
  | { type: 'content_block_stop'; block: ContentBlock }
  | { type: 'stream_stop'; stop_reason: string | null }
  | { type: 'tool_use'; tool: Tool; input: Record<string, unknown>; toolUseId: string }
  | { type: 'tool_result'; toolUseId: string; result: string; isError?: boolean }
  | { type: 'error'; error: string }
  | { type: 'done' }

export async function* query(
  messages: Message[],
  tools: Tool[],
  context: ToolContext,
  apiCall: (messages: Message[], tools: Tool[]) => AsyncGenerator<StreamEvent>,
): AsyncGenerator<QueryYield> {
  let currentMessages = [...messages]

  while (true) {
    let hasToolUse = false

    for await (const event of apiCall(currentMessages, tools)) {
      switch (event.type) {
        case 'stream_start':
          yield { type: 'stream_start' }
          break
        case 'content_block_delta':
          yield { type: 'content_block_delta', block: event.block }
          break
        case 'content_block_stop':
          yield { type: 'content_block_stop', block: event.block }
          if (event.block.type === 'tool_use') {
            hasToolUse = true
            const toolUseBlock = event.block as any
            const tool = tools.find(t => t.name === toolUseBlock.name)
            if (tool) {
              yield { type: 'tool_use', tool, input: event.block.input, toolUseId: event.block.id }
            }
          }
          break
        case 'stream_stop':
          yield { type: 'stream_stop', stop_reason: event.stop_reason }
          break
      }
    }

    if (!hasToolUse) {
      yield { type: 'done' }
      return
    }
  }
}
