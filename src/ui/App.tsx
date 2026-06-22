import { useEffect, useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { Welcome } from './components/Welcome.js'
import { MessagesList } from './components/MessagesList.js'
import { InputPrompt } from './components/InputPrompt.js'
import { FooterBar } from './components/FooterBar.js'
import { QueryRunner } from './components/QueryRunner.js'
import { PermissionBar } from './components/PermissionBar.js'
import { AskUserMenu } from './components/AskUserMenu.js'
import { CompressingBar } from './components/CompressingBar.js'
import { uiStore, useUIStore } from './hooks.js'
import { loadLastSession, saveSession } from '../session/storage.js'
import { isTrustedDir, trustDir } from '../session/trustStore.js'
import { COLORS } from './colors.js'

function SessionResumePrompt({ session, onYes, onNo }: {
  session: { savedAt: number; turns: number; tokenUsage: { total: number } }
  onYes: () => void
  onNo: () => void
}) {
  const [selected, setSelected] = useState(0)
  const age = Math.round((Date.now() - session.savedAt) / 60000)
  const ageStr = age < 60 ? `${age} 分钟前` : age < 1440 ? `${Math.round(age / 60)} 小时前` : `${Math.round(age / 1440)} 天前`
  const tokens = session.tokenUsage.total
  const tokStr = tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k tokens` : `${tokens} tokens`

  useInput((_in, key) => {
    if (key.upArrow || key.leftArrow) setSelected(0)
    if (key.downArrow || key.rightArrow) setSelected(1)
    if (key.return) selected === 0 ? onYes() : onNo()
    if (key.escape) onNo()
  })

  const options = [{ label: '继续上次会话' }, { label: '开始新会话' }]

  return (
    <Box marginX={2} marginY={0} flexDirection="column" gap={0}>
      <Box gap={1}>
        <Text color={COLORS.primary}>↩</Text>
        <Text color={COLORS.textSecondary}>
          发现上次会话（{ageStr} · {session.turns} 轮 · {tokStr}）
        </Text>
      </Box>
      <Box flexDirection="column" marginLeft={2}>
        {options.map((opt, i) => (
          <Box key={i} gap={1}>
            <Text color={i === selected ? COLORS.primary : COLORS.textMuted}>
              {i === selected ? '›' : ' '}
            </Text>
            <Text color={i === selected ? COLORS.textPrimary : COLORS.textSecondary} bold={i === selected}>
              {opt.label}
            </Text>
          </Box>
        ))}
      </Box>
      <Box marginLeft={2}><Text color={COLORS.textMuted} dimColor>↑↓ 选择  Enter 确认</Text></Box>
    </Box>
  )
}

function TrustPrompt({ dir, onYes, onNo }: {
  dir: string
  onYes: () => void
  onNo: () => void
}) {
  const [selected, setSelected] = useState(0)

  useInput((_in, key) => {
    if (key.upArrow || key.leftArrow) setSelected(0)
    if (key.downArrow || key.rightArrow) setSelected(1)
    if (key.return) selected === 0 ? onYes() : onNo()
    if (key.escape) onNo()
  })

  const options = [
    { label: '允许（记住此目录）' },
    { label: '只读模式' },
  ]

  return (
    <Box
      borderStyle="round"
      borderColor={COLORS.warning}
      paddingX={2}
      paddingY={0}
      flexDirection="column"
      marginX={2}
      marginBottom={1}
    >
      <Box gap={1}>
        <Text color={COLORS.warning} bold>⚠ 目录权限</Text>
      </Box>
      <Text color={COLORS.textSecondary}>
        是否允许 QinCode 读取并修改此目录中的文件？
      </Text>
      <Text color={COLORS.textMuted} dimColor>{dir}</Text>
      <Box flexDirection="column" marginTop={0}>
        {options.map((opt, i) => (
          <Box key={i} gap={1}>
            <Text color={i === selected ? COLORS.primary : COLORS.textMuted}>
              {i === selected ? '›' : ' '}
            </Text>
            <Text color={i === selected ? COLORS.textPrimary : COLORS.textSecondary} bold={i === selected}>
              {opt.label}
            </Text>
          </Box>
        ))}
      </Box>
      <Box><Text color={COLORS.textMuted} dimColor>↑↓ 选择  Enter 确认  Esc 取消</Text></Box>
    </Box>
  )
}

export default function App() {
  const messages = useUIStore(s => s.messages)
  const trustPrompt = useUIStore(s => s.trustPrompt)
  const hasMessages = messages.length > 0
  const [sessionPrompt, setSessionPrompt] = useState<{
    savedAt: number; turns: number; tokenUsage: { total: number }
    messages: any[]; tokenUsageFull: any
  } | null>(null)

  // On mount: check directory trust, load last session, init permissionMode
  useEffect(() => {
    const init = async () => {
      const cwd = process.cwd()
      const trusted = await isTrustedDir(cwd)
      if (!trusted) {
        await new Promise<void>(resolve => {
          uiStore.setState(prev => ({
            ...prev,
            trustPrompt: {
              dir: cwd,
              resolve: async (granted) => {
                uiStore.setState(p => ({ ...p, trustPrompt: null }))
                if (granted) await trustDir(cwd)
                resolve()
              },
            },
          }))
        })
      }

      const [session, { readConfig }] = await Promise.all([
        loadLastSession(),
        import('../config/index.js'),
      ])

      if (session && session.messages.length > 0) {
        setSessionPrompt({
          savedAt: session.savedAt,
          turns: session.turns,
          tokenUsage: session.tokenUsage,
          messages: session.messages,
          tokenUsageFull: session.tokenUsage,
        })
      }

      const cfg = await readConfig()
      uiStore.setState(prev => ({ ...prev, permissionMode: cfg.permissionMode ?? 'default' }))
    }

    init().catch(() => {})
  }, [])

  // Save session on process exit
  useEffect(() => {
    const save = () => {
      const state = uiStore.getState()
      if (state.messages.length === 0) return
      saveSession({
        messages: state.messages,
        tokenUsage: state.tokenUsage,
        turns: state.turns,
        cwd: process.cwd(),
      }).catch(() => {})
    }
    process.on('exit', save)
    process.on('SIGINT', () => { save(); process.exit(0) })
    process.on('SIGTERM', () => { save(); process.exit(0) })
    return () => {
      process.off('exit', save)
    }
  }, [])

  const handleResume = () => {
    if (!sessionPrompt) return
    uiStore.setState(prev => ({
      ...prev,
      messages: sessionPrompt.messages,
      tokenUsage: sessionPrompt.tokenUsageFull,
      turns: sessionPrompt.turns,
    }))
    setSessionPrompt(null)
  }

  const handleNew = () => setSessionPrompt(null)

  // Trust prompt blocks everything until answered
  if (trustPrompt) {
    return (
      <Box flexDirection="column" height="100%">
        <Box flexDirection="column" flexGrow={1} justifyContent="center">
          <TrustPrompt
            dir={trustPrompt.dir}
            onYes={() => trustPrompt.resolve(true)}
            onNo={() => trustPrompt.resolve(false)}
          />
        </Box>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" height="100%">
      <QueryRunner />

      <Box flexDirection="column" flexGrow={1} overflowY="hidden">
        {hasMessages ? <MessagesList /> : <Welcome />}
      </Box>

      {sessionPrompt && !hasMessages && (
        <SessionResumePrompt
          session={sessionPrompt}
          onYes={handleResume}
          onNo={handleNew}
        />
      )}

      <PermissionBar />
      <AskUserMenu />
      <CompressingBar />
      <InputPrompt />
      <FooterBar />
    </Box>
  )
}
