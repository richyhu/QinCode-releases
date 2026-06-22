export type AgentId = string

export type MessageRole = 'user' | 'assistant' | 'system'

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }
  | { type: 'thinking'; thinking: string }

export type Message = {
  id: string
  role: MessageRole
  content: ContentBlock[]
  created_at: number
  tool_call_id?: string
  name?: string
}

export type ToolResult<T = unknown> = {
  data: T
  newMessages?: Message[]
}

export type ToolProgressData =
  | { type: 'text'; content: string }
  | { type: 'bash'; command: string; partial_output: string }
  | { type: 'file_read'; path: string; bytes_read: number }
  | { type: 'file_write'; path: string }
  | { type: 'file_edit'; path: string; diff: string }
  | { type: 'web_search'; query: string }
  | { type: 'web_fetch'; url: string }

export type ProgressMessage = {
  type: 'progress'
  tool_use_id: string
  data: ToolProgressData
}

export type StreamEvent =
  | { type: 'stream_start' }
  | { type: 'content_block_delta'; block: ContentBlock }
  | { type: 'content_block_stop'; block: ContentBlock }
  | { type: 'stream_stop'; stop_reason: string | null }

export type PermissionMode = 'default' | 'plan' | 'bypass'

export type PermissionResult =
  | { behavior: 'allow'; updatedInput?: Record<string, unknown> }
  | { behavior: 'deny'; message: string }
  | { behavior: 'prompt'; mode: PermissionMode }

export type Store<T> = {
  getState: () => T
  setState: (updater: (prev: T) => T) => void
  subscribe: (listener: () => void) => () => void
}

export type ToolPermissionContext = {
  mode: PermissionMode
  additionalWorkingDirectories: Map<string, string>
  alwaysAllowRules: Record<string, string[]>
  alwaysDenyRules: Record<string, string[]>
}

export function getEmptyToolPermissionContext(): ToolPermissionContext {
  return {
    mode: 'default',
    additionalWorkingDirectories: new Map(),
    alwaysAllowRules: {},
    alwaysDenyRules: {},
  }
}
