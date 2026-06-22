import { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { uiStore, useUIStore } from '../hooks.js'
import { COLORS } from '../colors.js'

export function AskUserMenu() {
  const askUserQuestion = useUIStore(s => s.askUserQuestion)
  const [selected, setSelected] = useState(0)

  useInput((_input, key) => {
    if (!askUserQuestion) return

    if (key.upArrow) {
      setSelected(s => Math.max(0, s - 1))
    } else if (key.downArrow) {
      setSelected(s => Math.min(askUserQuestion.options.length - 1, s + 1))
    } else if (key.return) {
      askUserQuestion.resolve(askUserQuestion.options[selected])
      uiStore.setState(prev => ({ ...prev, askUserQuestion: null }))
      setSelected(0)
    } else if (key.escape) {
      askUserQuestion.resolve('cancel')
      uiStore.setState(prev => ({ ...prev, askUserQuestion: null }))
      setSelected(0)
    }
  })

  if (!askUserQuestion) return null

  return (
    <Box
      borderStyle="round"
      borderColor={COLORS.border}
      paddingX={1}
      paddingY={0}
      flexDirection="column"
      marginX={2}
      marginTop={1}
    >
      <Text color={COLORS.textPrimary}>{askUserQuestion.question}</Text>
      {askUserQuestion.options.map((opt, i) => (
        <Box key={i} gap={1}>
          <Text color={i === selected ? COLORS.primary : COLORS.textMuted}>
            {i === selected ? '›' : ' '}
          </Text>
          <Text color={i === selected ? COLORS.textPrimary : COLORS.textSecondary} bold={i === selected}>
            {opt}
          </Text>
        </Box>
      ))}
      <Text color={COLORS.textMuted} dimColor>↑↓ 选择  Enter 确认  Esc 取消</Text>
    </Box>
  )
}
