import { useEffect, useRef } from 'react'
import { uiStore, useUIStore } from '../hooks.js'
import { tools } from '../../tools/index.js'
import { streamChat } from '../../api/index.js'
import { readConfig } from '../../config/index.js'
import { readCredentials } from '../../auth/credentials.js'
import { shouldCompress, compressMessages } from '../../session/compressor.js'
import type { ContentBlock, Message } from '../../types.js'

const SYSTEM_PROMPT = `你是 QinCode，一个终端 AI 编程助手。

环境: ${process.platform} | ${process.env.SHELL || 'sh'} | ${process.cwd()} | Node ${process.version}

工具:
- bash: 执行 shell 命令
- file_read: 读取文件内容
- file_write: 写入新文件或覆盖现有文件
- file_edit: 编辑文件（精确替换指定文本片段）
- glob: 按模式查找文件
- grep: 在文件中搜索文本内容
- web_search: 搜索网页
- web_fetch: 获取并解析网页内容
- todo_write: 记录待办事项

行为规范:
- 直接执行，给出结论，不废话
- 用中文回复
- 修改文件前必须先用 file_read 读取，绝不盲目写入
- 同一文件不重复读取；工具执行失败后分析原因，不无限重试
- 每次工具调用后先确认结果，再决定下一步行动
- 任务完成后给出一句话简洁总结，说明做了什么、结果如何
- bash 命令优先用简洁形式；避免交互式命令（不能用 vim、less 等）
- 遇到权限错误时提示用户，不自行尝试提权`

// Patterns that are always dangerous regardless of permission mode
const DANGEROUS_PATTERNS = [
  /rm\s+-[^\s]*r/i,         // rm -r, rm -rf, rm -Rf etc.
  /\brm\s+\/\S*/,           // rm /something
  /\bdd\b/,                 // dd command
  /\bmkfs\b/,               // mkfs
  /\bsudo\b/,               // sudo anything
  /\bchmod\s+.*\s+\//,      // chmod on root paths
  /\bchown\s+.*\s+\//,      // chown on root paths
  />\s*\/dev\/(sda|hda|nvme)/, // writing to raw disk
  /:\(\)\s*\{.*\|.*&.*\}/, // fork bomb
  /\bkillall\b/,            // killall
  /\bpkill\s+-9\b/,         // pkill -9
  /\bformat\b/,             // format commands
  /\bwipe\b/,               // wipe commands
  /\bshred\b/,              // shred
]

function isDangerousCommand(command: string): boolean {
  return DANGEROUS_PATTERNS.some(p => p.test(command))
}

// Tools that are read-only / safe — skip prompting in default mode when session-allowed
const READ_ONLY_TOOLS = new Set(['file_read', 'glob', 'grep', 'web_search', 'web_fetch'])

function toolsToAPIFormat() {
  return tools.map(t => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    },
  }))
}

function messagesToAPIFormat(messages: Message[]) {
  const result: any[] = []
  for (const msg of messages) {
    if (msg.role === 'user') {
      const text = msg.content.map(c => c.type === 'text' ? c.text : '').join('')
      result.push({ role: 'user', content: text })
    } else if (msg.role === 'assistant') {
      const textParts = msg.content.filter(c => c.type === 'text').map(c => (c as any).text)
      const toolUseParts = msg.content.filter(c => c.type === 'tool_use')
      const entry: any = { role: 'assistant', content: textParts.join('') || null }
      if (toolUseParts.length > 0) {
        entry.tool_calls = toolUseParts.map((c: any) => ({
          id: c.id,
          type: 'function',
          function: { name: c.name, arguments: JSON.stringify(c.input) },
        }))
      }
      result.push(entry)
    } else if (msg.role === 'system' && msg.tool_call_id) {
      result.push({
        role: 'tool',
        tool_call_id: msg.tool_call_id,
        content: msg.content.map(c => c.type === 'text' ? c.text : '').join(''),
      })
    }
  }
  return result
}

async function askPermission(
  toolName: string,
  input: Record<string, unknown>,
  isDangerous: boolean,
): Promise<'allow' | 'deny' | 'manual'> {
  return new Promise<'allow' | 'deny' | 'manual'>(resolve => {
    uiStore.setState(prev => ({
      ...prev,
      permissionRequest: {
        toolName,
        input,
        isDangerous,
        resolve: (result) => {
          uiStore.setState(p => ({ ...p, permissionRequest: null }))
          resolve(result)
        },
      },
    }))
  })
}

export function QueryRunner() {
  const queryNonce = useUIStore(s => s.queryNonce)
  const lastNonceRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (queryNonce === lastNonceRef.current) return
    lastNonceRef.current = queryNonce

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    const run = async () => {
      try {
        const state = uiStore.getState()
        if (!state.isProcessing) return

        const messages = state.messages
        const lastMsg = messages[messages.length - 1]
        const isToolResult = lastMsg?.role === 'system' && (lastMsg as any).tool_call_id
        if (!lastMsg || (lastMsg.role !== 'user' && !isToolResult)) {
          uiStore.setState(prev => ({ ...prev, isProcessing: false }))
          return
        }

        const config = await readConfig()
        const creds = await readCredentials()
        const accessToken = (creds as any).accessToken as string | undefined

        const apiMessages = messagesToAPIFormat(messages)
        const apiTools = toolsToAPIFormat()

        const assistantId = `msg-${Date.now()}`
        let currentText = ''
        let currentThinking = ''
        let toolCalls: any[] = []
        let messageInserted = false

        const buildBlocks = (): ContentBlock[] => {
          const blocks: ContentBlock[] = []
          if (currentThinking) blocks.push({ type: 'thinking', thinking: currentThinking })
          if (currentText) blocks.push({ type: 'text', text: currentText })
          return blocks.length > 0 ? blocks : [{ type: 'text', text: '' }]
        }

        const updateAssistant = (blocks: ContentBlock[]) => {
          if (!messageInserted) {
            uiStore.setState(prev => ({
              ...prev,
              messages: [...prev.messages, {
                id: assistantId,
                role: 'assistant',
                content: [...blocks],
                created_at: Date.now(),
              }],
            }))
            messageInserted = true
          } else {
            uiStore.setState(prev => ({
              ...prev,
              messages: prev.messages.map(m =>
                m.id === assistantId ? { ...m, content: [...blocks] } : m
              ),
            }))
          }
        }

        const stream = streamChat(
          config.defaultPlatform as any,
          config.defaultModel,
          apiMessages as any,
          SYSTEM_PROMPT,
          apiTools,
          accessToken,
          undefined,
          controller.signal,
        )

        for await (const chunk of stream) {
          if (controller.signal.aborted) return

          if (typeof chunk === 'string') {
            currentText += chunk
            updateAssistant(buildBlocks())
          } else if (chunk && typeof chunk === 'object' && 'toolCall' in chunk) {
            const tc = chunk.toolCall
            if (tc.index !== undefined) {
              while (toolCalls.length <= tc.index) toolCalls.push({ id: '', name: '', arguments: '' })
              if (tc.id) toolCalls[tc.index].id = tc.id
              if (tc.function?.name) toolCalls[tc.index].name = tc.function.name
              if (tc.function?.arguments) toolCalls[tc.index].arguments += tc.function.arguments
            }
          } else if (chunk && typeof chunk === 'object' && 'reasoning' in chunk) {
            currentThinking += (chunk as any).reasoning
            updateAssistant(buildBlocks())
          } else if (chunk && typeof chunk === 'object' && 'usage' in chunk) {
            const u = (chunk as any).usage
            uiStore.setState(prev => ({
              ...prev,
              tokenUsage: {
                input: prev.tokenUsage.input + (u.prompt_tokens ?? 0),
                output: prev.tokenUsage.output + (u.completion_tokens ?? 0),
                total: prev.tokenUsage.total + (u.total_tokens ?? (u.prompt_tokens ?? 0) + (u.completion_tokens ?? 0)),
              },
            }))
          }
        }

        if (controller.signal.aborted) return

        // Process tool calls
        if (toolCalls.length > 0) {
          const blocks = buildBlocks()
          for (const tc of toolCalls) {
            if (tc.name) {
              const parsedInput = (() => {
              if (!tc.arguments) return {}
              try { return JSON.parse(tc.arguments) } catch { return {} }
            })()
              blocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: parsedInput })
            }
          }
          updateAssistant(blocks)

          const toolResultMessages: Message[] = []
          for (const tc of toolCalls) {
            if (!tc.name) continue
            const tool = tools.find(t => t.name === tc.name)
            if (!tool) {
              toolResultMessages.push({
                id: `tr-${Date.now()}-${tc.id}`,
                role: 'system' as const,
                tool_call_id: tc.id,
                content: [{ type: 'text', text: `Error: Unknown tool "${tc.name}"` }],
                created_at: Date.now(),
              })
              continue
            }

            const parsedInput = (() => {
              if (!tc.arguments) return {}
              try { return JSON.parse(tc.arguments) } catch { return {} }
            })()

            // ── Permission check ────────────────────────────────────────────
            const { shellPermission } = config
            const uiPermMode = uiStore.getState().permissionMode
            const sessionAllowed = uiStore.getState().sessionAllowedTools[tc.name]

            // Detect dangerous bash
            const isBashDangerous = tc.name === 'bash' &&
              isDangerousCommand(String(parsedInput.command || ''))

            // Dangerous commands always prompt, even in auto mode
            if (isBashDangerous) {
              const decision = await askPermission(tc.name, parsedInput, true)
              if (decision === 'deny') {
                toolResultMessages.push({
                  id: `tr-${Date.now()}-${tc.id}`,
                  role: 'system' as const,
                  tool_call_id: tc.id,
                  content: [{ type: 'text', text: `操作已取消。` }],
                  created_at: Date.now(),
                })
                continue
              } else if (decision === 'manual') {
                toolResultMessages.push({
                  id: `tr-${Date.now()}-${tc.id}`,
                  role: 'system' as const,
                  tool_call_id: tc.id,
                  content: [{ type: 'text', text: `请手动运行: ${parsedInput.command}` }],
                  created_at: Date.now(),
                })
                continue
              }
              // 'allow' falls through to execution
            } else if (uiPermMode === 'auto' || shellPermission === 'auto' || sessionAllowed) {
              // Skip prompt for non-dangerous in auto / session-allowed
            } else if (shellPermission === 'deny') {
              toolResultMessages.push({
                id: `tr-${Date.now()}-${tc.id}`,
                role: 'system' as const,
                tool_call_id: tc.id,
                content: [{ type: 'text', text: `Error: 工具 "${tc.name}" 已被配置为拒绝` }],
                created_at: Date.now(),
              })
              continue
            } else if (uiPermMode === 'plan') {
              // plan mode: only prompt for write/execute tools, not reads
              if (!READ_ONLY_TOOLS.has(tc.name)) {
                const decision = await askPermission(tc.name, parsedInput, false)
                if (decision !== 'allow') {
                  toolResultMessages.push({
                    id: `tr-${Date.now()}-${tc.id}`,
                    role: 'system' as const,
                    tool_call_id: tc.id,
                    content: [{ type: 'text', text: `用户拒绝了工具 "${tc.name}"` }],
                    created_at: Date.now(),
                  })
                  continue
                }
              }
            } else {
              // default mode: prompt for all tools
              const decision = await askPermission(tc.name, parsedInput, false)
              if (decision !== 'allow') {
                toolResultMessages.push({
                  id: `tr-${Date.now()}-${tc.id}`,
                  role: 'system' as const,
                  tool_call_id: tc.id,
                  content: [{ type: 'text', text: `用户拒绝了工具 "${tc.name}"` }],
                  created_at: Date.now(),
                })
                continue
              }
            }
            // ── End permission check ────────────────────────────────────────

            try {
              const result = await tool.call(parsedInput, {
                cwd: process.cwd(),
                sessionId: 'qincode-cli',
                permissionMode: 'default',
              })
              const resultText = typeof result.data === 'string' ? result.data : JSON.stringify(result.data)
              const truncated = resultText.length > 8000
                ? resultText.slice(0, 8000) + `\n\n[输出已截断，共 ${resultText.length} 字符]`
                : resultText
              toolResultMessages.push({
                id: `tr-${Date.now()}-${tc.id}`,
                role: 'system' as const,
                tool_call_id: tc.id,
                content: [{ type: 'text', text: truncated }],
                created_at: Date.now(),
              })
            } catch (err: any) {
              toolResultMessages.push({
                id: `tr-${Date.now()}-${tc.id}`,
                role: 'system' as const,
                tool_call_id: tc.id,
                content: [{ type: 'text', text: `Error: ${err.message}` }],
                created_at: Date.now(),
              })
            }
          }

          uiStore.setState(prev => ({
            ...prev,
            messages: [...prev.messages, ...toolResultMessages],
            isProcessing: true,
            queryNonce: prev.queryNonce + 1,
          }))
          return
        }

        uiStore.setState(prev => ({
          ...prev,
          isProcessing: false,
          turns: prev.turns + 1,
        }))

        // Background context compression — shows progress bar while running
        const finalMessages = uiStore.getState().messages
        if (shouldCompress(finalMessages, config.defaultModel)) {
          const startedAt = Date.now()
          const inputTokens = finalMessages.reduce((a, m) =>
            a + m.content.reduce((s, c) => s + (c.type === 'text' ? Math.ceil(c.text.length / 3) : 10), 0), 0)
          uiStore.setState(prev => ({ ...prev, compressing: { startedAt, inputTokens } }))
          compressMessages(
            finalMessages,
            config.defaultPlatform,
            config.defaultModel,
            accessToken,
          )
            .then(result => {
              uiStore.setState(prev => ({ ...prev, compressing: null }))
              if (result) {
                uiStore.setState(prev => ({ ...prev, messages: result.messages }))
              }
            })
            .catch(() => {
              uiStore.setState(prev => ({ ...prev, compressing: null }))
            })
        }
      } catch (err: any) {
        if (err?.name === 'AbortError' || controller.signal.aborted) return

        const errorMsg = err.message || '未知错误'
        uiStore.setState(prev => ({
          ...prev,
          isProcessing: false,
          messages: [...prev.messages, {
            id: `err-${Date.now()}`,
            role: 'system',
            content: [{ type: 'text', text: `错误: ${errorMsg}` }],
            created_at: Date.now(),
          }],
        }))
      }
    }

    run()

    return () => {
      controller.abort()
    }
  }, [queryNonce])

  return null
}
