import { useEffect, useState } from 'react'
import { Box, Text } from 'ink'
import { useUIStore } from '../hooks.js'
import { COLORS } from '../colors.js'

const SPINNER_FRAMES = ['▰▱▱▱▱▱▱▱', '▰▰▱▱▱▱▱▱', '▰▰▰▱▱▱▱▱', '▰▰▰▰▱▱▱▱', '▰▰▰▰▰▱▱▱', '▰▰▰▰▰▰▱▱', '▰▰▰▰▰▰▰▱', '▰▰▰▰▰▰▰▰']

export function CompressingBar() {
  const compressing = useUIStore(s => s.compressing)
  const [frame, setFrame] = useState(0)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!compressing) return
    const id = setInterval(() => {
      setFrame(f => (f + 1) % SPINNER_FRAMES.length)
      setElapsed(Math.round((Date.now() - compressing.startedAt) / 1000))
    }, 200)
    return () => clearInterval(id)
  }, [compressing])

  if (!compressing) return null

  const tokStr = compressing.inputTokens >= 1000
    ? `↑ ${(compressing.inputTokens / 1000).toFixed(1)}k tokens`
    : `↑ ${compressing.inputTokens} tokens`

  return (
    <Box marginX={2} marginBottom={0} gap={2} flexDirection="row">
      <Text color={COLORS.primary}>✽</Text>
      <Text color={COLORS.textSecondary}>Compacting conversation…</Text>
      <Text color={COLORS.textMuted}>({elapsed}s · {tokStr})</Text>
      <Text color={COLORS.primary}>{SPINNER_FRAMES[frame]}</Text>
    </Box>
  )
}
