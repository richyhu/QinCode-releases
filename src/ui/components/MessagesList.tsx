import { useState, useEffect } from 'react'
import { Box, Text, Static } from 'ink'
import { useUIStore } from '../hooks.js'
import { COLORS } from '../colors.js'

const TOOL_LABELS: Record<string, string> = {
  bash:       'Shell',
  file_read:  '读文件',
  file_write: '写文件',
  file_edit:  '编辑文件',
  glob:       '查找文件',
  grep:       '搜索',
  web_search: '搜索网页',
  web_fetch:  '获取网页',
  todo_write: 'Todo',
}

function formatToolInput(name: string, input: Record<string, unknown>): string {
  if (name === 'bash' && input.command) {
    const cmd = String(input.command).trim().replace(/\n+/g, ' ')
    return cmd.length > 72 ? cmd.slice(0, 69) + '...' : cmd
  }
  if (['file_read', 'file_write', 'file_edit'].includes(name) && input.path) return String(input.path)
  if (name === 'glob' && input.pattern) return String(input.pattern)
  if (name === 'grep' && input.pattern) return `${input.pattern}${input.path ? ` in ${input.path}` : ''}`
  if (name === 'web_search' && input.query) return String(input.query).slice(0, 72)
  if (name === 'web_fetch' && input.url) return String(input.url).slice(0, 72)
  const vals = Object.values(input)
  if (!vals.length) return ''
  const s = String(vals[0])
  return s.length > 72 ? s.slice(0, 69) + '...' : s
}

function formatToolResult(name: string, text: string): string {
  if (!text || text === '(no output)') return ''
  if (name === 'bash') {
    const lines = text.trimEnd().split('\n')
    const tail = lines.slice(-6)
    const prefix = lines.length > 6 ? `(${lines.length} 行) ` : ''
    return prefix + tail.join('\n')
  }
  if (name === 'file_read') return `${text.split('\n').length} 行`
  if (name === 'glob') return `${text.trim().split('\n').filter(Boolean).length} 个文件`
  if (name === 'grep') return `${text.trim().split('\n').filter(Boolean).length} 处匹配`
  if (name === 'web_search') return `${text.trim().split('\n').filter(Boolean).length} 条结果`
  if (name === 'file_write' || name === 'file_edit') return ''
  return text.length > 120 ? text.slice(0, 117) + '…' : text
}

function renderMarkdown(text: string) {
  const lines = text.split('\n')
  const out: React.ReactElement[] = []
  let inCode = false
  lines.forEach((line, i) => {
    if (line.startsWith('```')) {
      inCode = !inCode
      out.push(<Text key={`fence-${i}`} color={COLORS.bgLight}>{'─'.repeat(44)}</Text>)
      return
    }
    if (inCode) {
      out.push(
        <Box key={i} gap={0}>
          <Text color={COLORS.primary}>▌</Text>
          <Text color={COLORS.textSecondary}>{line}</Text>
        </Box>
      )
      return
    }
    if (line.startsWith('### ')) { out.push(<Text key={i} color={COLORS.primaryLight} bold>{line.slice(4)}</Text>); return }
    if (line.startsWith('## '))  { out.push(<Text key={i} color={COLORS.primary} bold>{line.slice(3)}</Text>); return }
    if (line.startsWith('# '))   { out.push(<Text key={i} color={COLORS.primary} bold>{line.slice(2)}</Text>); return }
    if (line.startsWith('- ') || line.startsWith('* ')) {
      out.push(<Box key={i} gap={1}><Text color={COLORS.primaryDark}>›</Text><Text color={COLORS.textPrimary}>{line.slice(2)}</Text></Box>)
      return
    }
    const nm = line.match(/^(\d+)\.\s(.*)/)
    if (nm) {
      out.push(<Box key={i} gap={1}><Text color={COLORS.primaryDark}>{nm[1]}.</Text><Text color={COLORS.textPrimary}>{nm[2]}</Text></Box>)
      return
    }
    if (line === '---') { out.push(<Text key={i} color={COLORS.bgMedium}>{'─'.repeat(50)}</Text>); return }
    out.push(<Text key={i} color={COLORS.textPrimary}>{line}</Text>)
  })
  return out
}

const WAVE = [COLORS.bgMedium, COLORS.primary, COLORS.primaryLight, COLORS.textMuted]

function ThinkingBlock({ text, done }: { text: string; done: boolean }) {
  const [frame, setFrame] = useState(0)
  useEffect(() => {
    if (done) return
    const t = setInterval(() => setFrame(f => f + 1), 160)
    return () => clearInterval(t)
  }, [done])
  if (done && !text) return null
  if (done) {
    const preview = text.length > 100 ? text.slice(0, 97) + '...' : text
    return <Text color={COLORS.textMuted} dimColor>{'∴ '}{preview}</Text>
  }
  return (
    <Box gap={1}>
      <Text color={WAVE[frame % WAVE.length]} bold>⬡</Text>
      <Text color={COLORS.textMuted}>Thinking...</Text>
    </Box>
  )
}

function ThinkingIndicator() {
  const [frame, setFrame] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setFrame(f => f + 1), 160)
    return () => clearInterval(t)
  }, [])
  return (
    <Box marginX={2} marginTop={1} gap={1}>
      <Text color={WAVE[frame % WAVE.length]} bold>⬡</Text>
      <Text color={COLORS.textMuted}>Thinking...</Text>
    </Box>
  )
}

function DiffView({ diff }: { diff: string }) {
  const lines = diff.split('\n')
  return (
    <Box flexDirection="column" marginLeft={2} marginTop={0}>
      {lines.map((line, i) => {
        if (line.startsWith('---') || line.startsWith('+++')) return null
        if (line.startsWith('@@')) return <Text key={i} color={COLORS.textMuted} dimColor>{line}</Text>
        if (line.startsWith('+')) return (
          <Box key={i} gap={0}>
            <Text color={COLORS.success}>{'+'}</Text>
            <Text color={COLORS.success}>{line.slice(1)}</Text>
          </Box>
        )
        if (line.startsWith('-')) return (
          <Box key={i} gap={0}>
            <Text color={COLORS.error}>{'-'}</Text>
            <Text color={COLORS.error} dimColor>{line.slice(1)}</Text>
          </Box>
        )
        return <Text key={i} color={COLORS.textMuted} dimColor>{line}</Text>
      })}
    </Box>
  )
}

function ToolCallRow({ name, input, resultText, isError }: {
  name: string; input: Record<string, unknown>
  resultText?: string; isError?: boolean
}) {
  const label = TOOL_LABELS[name] || name
  const detail = formatToolInput(name, input)
  const done = resultText !== undefined
  const err = isError || (done && resultText?.startsWith('Error:'))
  const icon = err ? '✗' : done ? '✓' : '○'
  const iconColor = err ? COLORS.toolError : done ? COLORS.toolSuccess : COLORS.toolRunning
  const isDiff = done && resultText?.startsWith('__DIFF__')
  const diff = isDiff ? resultText!.slice('__DIFF__\n'.length) : null
  const summary = !isDiff && done && resultText ? formatToolResult(name, resultText) : null

  return (
    <Box flexDirection="column" marginLeft={4}>
      <Box gap={1}>
        <Text color={iconColor}>{icon}</Text>
        <Text color={COLORS.toolUse} bold>{label}</Text>
        {detail ? <Text color={COLORS.textMuted}>{detail}</Text> : null}
      </Box>
      {diff ? <DiffView diff={diff} /> : null}
      {summary ? (
        <Box marginLeft={2}>
          <Text color={err ? COLORS.toolError : COLORS.textMuted} dimColor>{summary}</Text>
        </Box>
      ) : null}
    </Box>
  )
}

type MsgProps = { msg: any; toolResultMap: Record<string, { text: string; isError?: boolean }> }

function MessageItem({ msg, toolResultMap }: MsgProps) {
  switch (msg.role) {
    case 'user': {
      const text = msg.content.map((c: any) => c.type === 'text' ? c.text : '').join('')
      return (
        <Box marginX={2} marginTop={1} gap={1}>
          <Text color={COLORS.accent} bold>❯</Text>
          <Text color={COLORS.textPrimary} bold>{text}</Text>
        </Box>
      )
    }
    case 'assistant': {
      const hasText = msg.content.some((c: any) => c.type === 'text' && c.text)
      const thinking = msg.content.find((c: any) => c.type === 'thinking')
      const textBlocks = msg.content.filter((c: any) => c.type === 'text')
      const toolBlocks = msg.content.filter((c: any) => c.type === 'tool_use')
      return (
        <Box flexDirection="column" marginX={2} marginTop={1}>
          {thinking && <ThinkingBlock text={(thinking as any).thinking || ''} done={hasText} />}
          {textBlocks.map((c: any, j: number) => {
            if (!c.text) return null
            return (
              <Box key={j} flexDirection="column" marginLeft={2}>
                {renderMarkdown(c.text)}
              </Box>
            )
          })}
          {toolBlocks.map((c: any, j: number) => (
            <ToolCallRow key={j} name={c.name} input={c.input}
              resultText={toolResultMap[c.id]?.text}
              isError={toolResultMap[c.id]?.isError} />
          ))}
        </Box>
      )
    }
    case 'system': {
      if (msg.tool_call_id) return null
      if (msg.name === '__compressed__') {
        const text = msg.content.map((c: any) => c.type === 'text' ? c.text : '').join('')
        const lines = text.split('\n')
        const header = lines[0] || ''
        const body = lines.slice(1).join('\n').trim()
        return (
          <Box marginX={2} marginTop={1} flexDirection="column">
            <Box gap={1}>
              <Text color={COLORS.bgLight}>▸</Text>
              <Text color={COLORS.textMuted}>{header}</Text>
            </Box>
            {body ? (
              <Box marginLeft={2} flexDirection="column">
                {body.split('\n').map((line: string, j: number) => (
                  <Text key={j} color={COLORS.textMuted} dimColor>{line}</Text>
                ))}
              </Box>
            ) : null}
          </Box>
        )
      }
      const text = msg.content.map((c: any) => c.type === 'text' ? c.text : '').join('')
      return (
        <Box marginX={2} marginTop={1} gap={1}>
          <Text color={COLORS.bgLight}>│</Text>
          <Text color={COLORS.textMuted}>{text}</Text>
        </Box>
      )
    }
    default: return null
  }
}

export function MessagesList() {
  const messages = useUIStore(s => s.messages)
  const isProcessing = useUIStore(s => s.isProcessing)
  if (messages.length === 0) return null

  const toolResultMap: Record<string, { text: string; isError?: boolean }> = {}
  for (const msg of messages) {
    if (msg.role === 'system' && msg.tool_call_id) {
      const text = msg.content.map(c => c.type === 'text' ? c.text : '').join('')
      toolResultMap[msg.tool_call_id] = { text, isError: text.startsWith('Error:') }
    }
  }

  // Split: everything except last assistant message → Static (no redraws)
  // Last message + indicator → dynamic
  const lastAssistantIdx = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') return i
    }
    return -1
  })()

  const staticMsgs = lastAssistantIdx > 0 ? messages.slice(0, lastAssistantIdx) : messages
  const dynamicMsgs = lastAssistantIdx >= 0 ? messages.slice(lastAssistantIdx) : []

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Static items={staticMsgs.map(m => ({ ...m, _tMap: toolResultMap }))}>
        {(item: any) => (
          <MessageItem key={item.id} msg={item} toolResultMap={item._tMap} />
        )}
      </Static>
      {dynamicMsgs.map((msg, i) => (
        <MessageItem key={msg.id || i} msg={msg} toolResultMap={toolResultMap} />
      ))}
      {isProcessing && <ThinkingIndicator />}
      <Box marginBottom={1} />
    </Box>
  )
}
