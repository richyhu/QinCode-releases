import React, { useState, useEffect } from 'react'
import { Box, Text } from 'ink'
import { COLORS } from '../colors.js'

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

type SpinnerProps = {
  message?: string
  color?: string
}

export function Spinner({ message, color = COLORS.primary }: SpinnerProps) {
  const [frame, setFrame] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setFrame(prev => (prev + 1) % FRAMES.length)
    }, 80)
    return () => clearInterval(timer)
  }, [])

  return (
    <Box gap={1} marginX={2}>
      <Text color={color}>{FRAMES[frame]}</Text>
      {message && <Text color={COLORS.textSecondary}>{message}</Text>}
    </Box>
  )
}
