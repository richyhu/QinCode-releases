import { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { uiStore, useUIStore } from '../hooks.js'
import { COLORS } from '../colors.js'

const TOOL_INFO: Record<string, { label: string; detail: (input: Record<string, unknown>) => string }> = {
  bash:       { label: '执行 Shell 命令', detail: i => String(i.command || '').trim() },
  file_write: { label: '写入文件',         detail: i => String(i.path || '') },
  file_edit:  { label: '编辑文件',         detail: i => String(i.path || '') },
  file_read:  { label: '读取文件',         detail: i => String(i.path || '') },
  glob:       { label: '查找文件',         detail: i => String(i.pattern || '') },
  grep:       { label: '搜索内容',         detail: i => String(i.pattern || '') },
  web_search: { label: '搜索网络',         detail: i => String(i.query || '') },
  web_fetch:  { label: '获取网页',         detail: i => String(i.url || '') },
  todo_write: { label: '写入待办',         detail: i => String(i.action || '') },
}

export function PermissionBar() {
  const permissionRequest = useUIStore(s => s.permissionRequest)
  const [selected, setSelected] = useState(0)

  useInput((_input, key) => {
    if (!permissionRequest) return

    const options = permissionRequest.isDangerous
      ? ['allow', 'deny', 'manual'] as const
      : ['allow', 'deny', 'session'] as const

    if (key.upArrow) {
      setSelected(s => Math.max(0, s - 1))
    } else if (key.downArrow) {
      setSelected(s => Math.min(options.length - 1, s + 1))
    } else if (key.return) {
      const choice = options[selected]
      setSelected(0)
      if (choice === 'session') {
        uiStore.setState(prev => ({
          ...prev,
          sessionAllowedTools: { ...prev.sessionAllowedTools, [permissionRequest.toolName]: true },
        }))
        permissionRequest.resolve('allow')
      } else if (choice === 'manual') {
        permissionRequest.resolve('manual')
      } else if (choice === 'allow') {
        permissionRequest.resolve('allow')
      } else {
        permissionRequest.resolve('deny')
      }
    } else if (key.escape) {
      setSelected(0)
      permissionRequest.resolve('deny')
    }
  })

  if (!permissionRequest) return null

  const info = TOOL_INFO[permissionRequest.toolName]
  const label = info?.label || permissionRequest.toolName
  const detail = info?.detail(permissionRequest.input) || JSON.stringify(permissionRequest.input).slice(0, 200)
  const { isDangerous } = permissionRequest

  const options = isDangerous
    ? [
        { key: 'allow',  label: '允许一次' },
        { key: 'deny',   label: '拒绝' },
        { key: 'manual', label: '手动运行' },
      ]
    : [
        { key: 'allow',   label: '允许一次' },
        { key: 'deny',    label: '拒绝' },
        { key: 'session', label: '本次会话始终允许' },
      ]

  return (
    <Box
      borderStyle="round"
      borderColor={isDangerous ? COLORS.error : COLORS.warning}
      paddingX={1}
      paddingY={0}
      flexDirection="column"
      marginX={2}
      marginTop={1}
    >
      <Box gap={1}>
        <Text color={isDangerous ? COLORS.error : COLORS.warning} bold>
          {isDangerous ? '⚠ 危险操作' : '⬡ 权限请求'}
        </Text>
        <Text color={COLORS.textPrimary} bold>{label}</Text>
      </Box>
      {detail && (
        <Box marginLeft={2}>
          <Text color={COLORS.textSecondary} wrap="truncate">{detail}</Text>
        </Box>
      )}
      <Box flexDirection="column" marginLeft={2} marginTop={0}>
        {options.map((opt, i) => (
          <Box key={opt.key} gap={1}>
            <Text color={i === selected ? COLORS.primary : COLORS.textMuted}>
              {i === selected ? '›' : ' '}
            </Text>
            <Text color={i === selected ? COLORS.textPrimary : COLORS.textSecondary} bold={i === selected}>
              {opt.label}
            </Text>
          </Box>
        ))}
      </Box>
      <Box marginLeft={2}><Text color={COLORS.textMuted} dimColor>↑↓ 选择  Enter 确认  Esc 拒绝</Text></Box>
    </Box>
  )
}
