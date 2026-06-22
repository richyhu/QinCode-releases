import { useEffect, useState } from 'react'
import { Box, Text } from 'ink'
import { COLORS } from '../colors.js'
import { readConfig, BUILTIN_MODELS } from '../../config/index.js'
import { readCredentials } from '../../auth/credentials.js'
import { homedir } from 'os'

const FACE = [
  '████████████',
  '█■■████■■███',
  '████████████',
]

function FaceLine({ line }: { line: string }) {
  return (
    <Box>
      {line.split('').map((ch, i) => (
        <Text key={i} color={ch === '■' ? COLORS.bgDark : COLORS.primary}>{ch}</Text>
      ))}
    </Box>
  )
}

export function Welcome() {
  const [modelName, setModelName] = useState('...')
  const [platform, setPlatform] = useState('')
  const [cwd, setCwd] = useState('')
  const [statusIcon, setStatusIcon] = useState('○')
  const [statusText, setStatusText] = useState('检查配置...')
  const [statusColor, setStatusColor] = useState(COLORS.textMuted)

  useEffect(() => {
    readConfig().then(async config => {
      const model = BUILTIN_MODELS.find(m => m.id === config.defaultModel)
      setModelName(model?.name || config.defaultModel)
      const plat = model?.platform || config.defaultPlatform
      setPlatform(plat)

      const creds = await readCredentials()
      const username = (creds as any).username
      const hasToken = !!(creds as any).accessToken
      const hasKey = !!creds[`api_key_${plat}`]

      if (username) {
        setStatusIcon('✓'); setStatusText(`已登录 · ${username}`); setStatusColor(COLORS.success)
      } else if (hasToken || hasKey) {
        setStatusIcon('✓'); setStatusText('已配置'); setStatusColor(COLORS.success)
      } else {
        setStatusIcon('!'); setStatusText('未配置 · /login 或 /api-key'); setStatusColor(COLORS.warning)
      }
    })
    setCwd(process.cwd().replace(homedir(), '~'))
  }, [])

  return (
    <Box
      borderStyle="round"
      borderColor={COLORS.border}
      marginX={2}
      paddingX={2}
      paddingY={0}
    >
      {/* Logo row */}
      <Box flexDirection="column">
        {/* Face + brand */}
        <Box gap={2} alignItems="center">
          <Box flexDirection="column">
            {FACE.map((line, i) => <FaceLine key={i} line={line} />)}
          </Box>
          <Box flexDirection="column">
            <Box gap={2}>
              <Text color={COLORS.textPrimary} bold>QinCode</Text>
              <Text color={COLORS.textMuted}>v0.1.0 (Build 2740)</Text>
            </Box>
            <Text color={COLORS.textMuted}>{'─'.repeat(36)}</Text>
            <Box gap={1}>
              <Text color={COLORS.primary}>{modelName}</Text>
              <Text color={COLORS.textMuted}>·</Text>
              <Text color={COLORS.accent}>{platform}</Text>
              <Text color={COLORS.textMuted}>·</Text>
              <Text color={COLORS.textMuted}>{cwd}</Text>
            </Box>
            <Box gap={1}>
              <Text color={statusColor}>{statusIcon}</Text>
              <Text color={statusColor}>{statusText}</Text>
            </Box>
          </Box>
        </Box>

        {/* Divider */}
        <Text color={COLORS.borderDim}>{'─'.repeat(54)}</Text>

        {/* Tips */}
        <Box gap={1}>
          <Text color={COLORS.primaryDark}>›</Text>
          <Text color={COLORS.textSecondary}>直接输入任务，比如"帮我重构这个函数"</Text>
        </Box>
        <Box gap={1}>
          <Text color={COLORS.primaryDark}>›</Text>
          <Text color={COLORS.textMuted}>/model 切换模型 · /api-key 配置密钥 · /help 全部命令</Text>
        </Box>
      </Box>
    </Box>
  )
}
