import { useEffect, useState } from 'react'
import { Box, Text } from 'ink'
import { useUIStore } from '../hooks.js'
import { COLORS } from '../colors.js'
import { readConfig, BUILTIN_MODELS } from '../../config/index.js'
import { contextWindow } from '../../session/compressor.js'

function formatTokens(n: number): string {
  if (n === 0) return ''
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

export function FooterBar() {
  const turns = useUIStore(s => s.turns)
  const isProcessing = useUIStore(s => s.isProcessing)
  const tokenUsage = useUIStore(s => s.tokenUsage)
  const [modelName, setModelName] = useState('')
  const [platform, setPlatform] = useState('')
  const [modelId, setModelId] = useState('')

  useEffect(() => {
    readConfig().then(config => {
      const model = BUILTIN_MODELS.find(m => m.id === config.defaultModel)
      setModelName(model?.name || config.defaultModel)
      setPlatform(model?.platform || config.defaultPlatform)
      setModelId(config.defaultModel)
    })
  }, [isProcessing])

  const parts: string[] = []
  if (modelName) parts.push(modelName)
  if (platform) parts.push(platform)
  if (turns > 0) parts.push(`${turns}t`)

  const used = tokenUsage.total
  const limit = modelId ? contextWindow(modelId) : 0
  const ratio = limit > 0 ? used / limit : 0
  const tokStr = used > 0
    ? limit > 0 ? `${formatTokens(used)}/${formatTokens(limit)}` : formatTokens(used)
    : ''
  const tokColor = ratio >= 0.85 ? COLORS.error : ratio >= 0.60 ? COLORS.warning : COLORS.textMuted

  return (
    <Box marginX={2} marginBottom={0} justifyContent="space-between">
      <Box gap={1}>
        <Text color={COLORS.textMuted} dimColor>{parts.join(' · ')}</Text>
        {tokStr ? (
          <>
            <Text color={COLORS.textMuted} dimColor>·</Text>
            <Text color={tokColor} dimColor={ratio < 0.60}>{tokStr} tokens</Text>
            {ratio >= 0.60 && <Text color={tokColor}>{` ${Math.round(ratio * 100)}%`}</Text>}
          </>
        ) : null}
      </Box>
      <Text color={COLORS.textMuted} dimColor>
        {isProcessing ? 'Ctrl+C 停止' : 'Ctrl+C 退出'}
      </Text>
    </Box>
  )
}
