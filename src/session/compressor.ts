import { streamChat } from '../api/index.js'
import type { Message } from '../types.js'

const KEEP_RECENT = 6

const MODEL_CONTEXT: Record<string, number> = {
  'deepseek-v4-flash':    1_000_000,
  'LongCat-2.0-Preview':  1_000_000,
}
const DEFAULT_CONTEXT = 128_000
const COMPRESS_AT = 0.60

export function estimateTokens(messages: Message[]): number {
  return messages.reduce((acc, m) => {
    const chars = m.content.reduce((s, c) => {
      if (c.type === 'text') return s + c.text.length
      if (c.type === 'tool_use') return s + JSON.stringify(c.input).length + 20
      return s + 20
    }, 0)
    return acc + Math.ceil(chars / 3)
  }, 0)
}

export function contextWindow(modelId: string): number {
  return MODEL_CONTEXT[modelId] ?? DEFAULT_CONTEXT
}

export function shouldCompress(messages: Message[], modelId: string): boolean {
  if (messages.length <= KEEP_RECENT + 2) return false
  const recent = messages.slice(-KEEP_RECENT)
  if (recent.some(m => (m as any).name === '__compressed__')) return false
  const tokens = estimateTokens(messages)
  const limit = contextWindow(modelId)
  return tokens > limit * COMPRESS_AT
}

function buildTranscript(messages: Message[]): string {
  return messages.map(m => {
    if (m.role === 'user') {
      const text = m.content.map(c => c.type === 'text' ? c.text : '').join('')
      return `用户: ${text}`
    }
    if (m.role === 'assistant') {
      const texts = m.content.filter(c => c.type === 'text').map(c => (c as any).text).join('')
      const toolNames = m.content.filter(c => c.type === 'tool_use').map((c: any) => c.name).join(', ')
      const toolPart = toolNames ? `\n  [调用工具: ${toolNames}]` : ''
      return `助手: ${texts}${toolPart}`.trim()
    }
    if (m.role === 'system' && (m as any).name === '__compressed__') {
      return m.content.map(c => c.type === 'text' ? c.text : '').join('')
    }
    if (m.role === 'system' && (m as any).tool_call_id) return null
    const text = m.content.map(c => c.type === 'text' ? c.text : '').join('')
    return text ? `系统: ${text}` : null
  }).filter(Boolean).join('\n\n')
}

export async function compressMessages(
  messages: Message[],
  platform: string,
  model: string,
  accessToken?: string,
  onToken?: (tokensGenerated: number) => void,
): Promise<{ messages: Message[]; compressedCount: number } | null> {
  if (messages.length <= KEEP_RECENT) return null

  const toCompress = messages.slice(0, messages.length - KEEP_RECENT)
  const toKeep = messages.slice(messages.length - KEEP_RECENT)
  const transcript = buildTranscript(toCompress)
  if (!transcript.trim()) return null

  const summaryPrompt =
    `以下是 AI 编程助手的历史对话记录。请用中文简洁总结：\n` +
    `- 用户的核心任务和需求\n` +
    `- 已完成的工作（修改了哪些文件、解决了哪些问题）\n` +
    `- 重要决策和当前状态\n` +
    `不超过 400 字，用要点列表格式。\n\n历史记录:\n${transcript}`

  let summary = ''
  let tokenCount = 0
  try {
    const stream = streamChat(
      platform as any,
      model,
      [{ role: 'user', content: summaryPrompt }],
      '你是对话摘要助手，请简洁总结对话内容，保留关键技术细节。',
      [],
      accessToken,
    )
    for await (const chunk of stream) {
      if (typeof chunk === 'string') {
        summary += chunk
        tokenCount += Math.ceil(chunk.length / 3)
        onToken?.(tokenCount)
      }
    }
  } catch {
    return null
  }

  if (!summary.trim()) return null

  const summaryMessage: Message = {
    id: `summary-${Date.now()}`,
    role: 'system',
    content: [{ type: 'text', text: `[已压缩 ${toCompress.length} 条历史消息]\n\n${summary}` }],
    created_at: Date.now(),
    name: '__compressed__' as any,
  }

  return { messages: [summaryMessage, ...toKeep], compressedCount: toCompress.length }
}
