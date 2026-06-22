export type ToolContext = {
  cwd: string
  sessionId: string
  permissionMode: 'default' | 'plan' | 'bypass'
  onPermissionRequest?: (toolName: string, input: Record<string, unknown>) => Promise<'allow' | 'deny'>
}

export type ToolResult<T = unknown> = {
  data: T
  newMessages?: any[]
}

export type ToolDef<TInput = Record<string, unknown>> = {
  name: string
  description: string
  inputSchema: {
    type: 'object'
    properties: Record<string, { type: string; description?: string }>
    required?: string[]
  }
  call: (input: TInput, context: ToolContext) => Promise<ToolResult>
  isDestructive?: () => boolean
}

export type Tool = ToolDef

export function buildTool<TInput = Record<string, unknown>>(def: ToolDef<TInput>): ToolDef<TInput> {
  return def
}
