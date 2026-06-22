import { useState, useEffect, useRef } from 'react'
import { Box, Text, useInput } from 'ink'
import { uiStore, useUIStore } from '../hooks.js'
import { COLORS } from '../colors.js'
import { readConfig, writeConfig, BUILTIN_MODELS } from '../../config/index.js'
import { readCredentials, writeCredentials, setApiKey } from '../../auth/credentials.js'
import { loginOAuth, logoutOAuth } from '../../auth/oauth.js'
import { listSessions, loadSessionById } from '../../session/storage.js'

const COMMANDS = [
  { name: '/help',        desc: '显示帮助' },
  { name: '/clear',       desc: '清空对话' },
  { name: '/model',       desc: '切换模型' },
  { name: '/api-key',     desc: '配置 API Key' },
  { name: '/permissions', desc: '切换权限模式' },
  { name: '/login',       desc: '登录账号' },
  { name: '/logout',      desc: '退出登录' },
  { name: '/cost',        desc: '查看用量' },
  { name: '/status',      desc: '当前状态' },
  { name: '/history',     desc: '历史会话' },
  { name: '/config',      desc: '配置设置' },
  { name: '/lang',        desc: '切换语言 zh/en' },
  { name: '/compact',     desc: '压缩上下文' },
  { name: '/vim',         desc: '切换 Vim 模式' },
  { name: '/skills',      desc: '查看可用 Skills' },
  { name: '/init',        desc: '创建 QINCODE.md' },
]

const PLATFORMS = [
  { id: 'deepseek', name: 'DeepSeek',     hint: 'platform.deepseek.com' },
  { id: 'longcat',  name: 'LongCat',      hint: 'longcatai.com' },
  { id: 'custom',   name: 'OpenAI 兼容',  hint: '自定义 Base URL' },
]

type Mode = 'input' | 'model_select' | 'apikey_platform' | 'apikey_url' | 'apikey_input'

const HELP_TEXT = [
  '命令列表:',
  ...COMMANDS.map(c => `  ${c.name.padEnd(12)}${c.desc}`),
  '',
  '快捷键:  ↑↓ 历史  Tab 补全  Esc 取消  Ctrl+C 停止/退出',
].join('\n')


export function InputPrompt() {
  const [input, setInput] = useState('')
  const [cursorOn, setCursorOn] = useState(true)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [mode, setMode] = useState<Mode>('input')
  const [modelList, setModelList] = useState<{ id: string; name: string; desc: string; platform: string }[]>([])
  const [currentModel, setCurrentModel] = useState('')
  const [apikeyPlatformIdx, setApikeyPlatformIdx] = useState(0)
  const [apikeyPlatform, setApikeyPlatform] = useState('')
  const [apikeyUrl, setApikeyUrl] = useState('')
  const [apikeyValue, setApikeyValue] = useState('')

  const historyRef = useRef<string[]>([])
  const historyIdxRef = useRef(-1)
  const savedRef = useRef('')

  const isProcessing = useUIStore(s => s.isProcessing)
  const permissionRequest = useUIStore(s => s.permissionRequest)
  const askUserQuestion = useUIStore(s => s.askUserQuestion)

  useEffect(() => {
    if (isProcessing) return
    const t = setInterval(() => setCursorOn(v => !v), 530)
    return () => clearInterval(t)
  }, [isProcessing])

  const showSugg = input.startsWith('/') && input.length > 0 && mode === 'input' && !isProcessing
  const filteredCmds = showSugg ? COMMANDS.filter(c => c.name.startsWith(input.toLowerCase())) : []

  useEffect(() => { setSelectedIdx(0) }, [input])

  useEffect(() => {
    if (mode !== 'model_select') return
    readConfig().then(config => {
      const models = BUILTIN_MODELS.map(m => ({ id: m.id, name: m.name, desc: m.description, platform: m.platform }))
      setModelList(models)
      setCurrentModel(config.defaultModel)
      setSelectedIdx(Math.max(0, models.findIndex(m => m.id === config.defaultModel)))
    })
  }, [mode])

  const addMsg = (text: string) => uiStore.setState(prev => ({
    ...prev,
    messages: [...prev.messages, {
      id: `sys-${Date.now()}`, role: 'system' as const,
      content: [{ type: 'text' as const, text }], created_at: Date.now(),
    }],
  }))

  const submit = (text: string) => {
    if (!text.trim()) return
    historyRef.current = [text, ...historyRef.current.slice(0, 99)]
    historyIdxRef.current = -1; savedRef.current = ''
    if (text.trim().startsWith('/')) { handleCmd(text.trim()); setInput(''); return }
    uiStore.setState(prev => ({
      ...prev,
      messages: [...prev.messages, {
        id: `msg-${Date.now()}`, role: 'user' as const,
        content: [{ type: 'text' as const, text: text.trim() }], created_at: Date.now(),
      }],
      isProcessing: true, queryNonce: prev.queryNonce + 1,
    }))
    setInput('')
  }

  const handleCmd = async (cmd: string) => {
    const parts = cmd.split(/\s+/)
    switch (parts[0].toLowerCase()) {
      case '/help': addMsg(HELP_TEXT); break
      case '/clear':
        uiStore.setState(prev => ({ ...prev, messages: [], conversationId: '', turns: 0, tokenUsage: { input: 0, output: 0, total: 0 } }))
        import('../../session/storage.js').then(({ clearSessions }) => clearSessions().catch(() => {}))
        break
      case '/model':
        if (parts[1]) {
          const config = await readConfig()
          const found = [...BUILTIN_MODELS, ...config.customModels].find(m => m.id === parts[1])
          if (found) { await writeConfig({ ...config, defaultModel: found.id, defaultPlatform: (found as any).platform || config.defaultPlatform }); addMsg(`✓ 已切换到 ${found.name}`) }
          else addMsg(`未找到: ${parts[1]}`)
        } else setMode('model_select')
        break
      case '/api-key':
        if (!parts[1]) { setApikeyPlatformIdx(0); setApikeyUrl(''); setApikeyValue(''); setMode('apikey_platform') }
        else if (parts[2]) { await setApiKey(parts[1], parts.slice(2).join(' ')); addMsg(`✓ ${parts[1]} API Key 已保存`) }
        else addMsg('用法: /api-key [platform] [key]  或直接 /api-key 打开向导')
        break
      case '/init': {
        const fs = await import('fs/promises'); const path = await import('path')
        const target = path.join(process.cwd(), 'QINCODE.md')
        try { await fs.access(target); addMsg(`QINCODE.md 已存在: ${target}`) }
        catch { await fs.writeFile(target, `# QINCODE 项目说明\n\n## 项目简介\n\n<!-- 描述你的项目 -->\n\n## 编码规范\n\n- 语言: TypeScript\n- 格式: 2 空格缩进\n`, 'utf-8'); addMsg(`✓ 已创建 QINCODE.md`) }
        break
      }
      case '/login':
        addMsg('正在打开浏览器...')
        try {
          const result = await loginOAuth(async url => { const { default: open } = await import('open'); await open(url) })
          await writeCredentials(result); addMsg(`✓ 登录成功，欢迎 ${result.username}`)
        } catch (e: any) { addMsg(`✗ 登录失败: ${e.message}`) }
        break
      case '/logout': await logoutOAuth(); addMsg('✓ 已退出登录'); break
      case '/cost': {
        const s = uiStore.getState(); const u = s.tokenUsage
        const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
        addMsg(`会话用量:\n  轮次: ${s.turns}\n  输入: ${fmt(u.input)} tokens\n  输出: ${fmt(u.output)} tokens\n  总计: ${fmt(u.total)} tokens`)
        break
      }
      case '/history': {
        if (parts[1]?.toLowerCase() === 'resume') {
          if (!parts[2]) { addMsg('用法: /history resume <session-id>'); break }
          const session = await loadSessionById(parts[2])
          if (!session) { addMsg(`未找到会话: ${parts[2]}`); break }
          uiStore.setState(prev => ({
            ...prev,
            messages: session.messages,
            tokenUsage: session.tokenUsage,
            turns: session.turns,
          }))
          addMsg(`✓ 已恢复会话 (${session.turns} 轮，${session.tokenUsage.total} tokens)`)
          break
        }
        const sessions = await listSessions()
        if (!sessions.length) { addMsg('暂无历史会话'); break }
        const lines = sessions.slice(0, 10).map((s, i) => {
          const age = Math.round((Date.now() - s.savedAt) / 60000)
          const ageStr = age < 60 ? `${age}min` : age < 1440 ? `${Math.round(age / 60)}h` : `${Math.round(age / 1440)}d`
          const tok = s.tokenUsage.total >= 1000 ? `${(s.tokenUsage.total / 1000).toFixed(1)}k` : String(s.tokenUsage.total)
          return `  ${i + 1}.  ${ageStr} ago · ${s.turns} 轮 · ${tok} tokens · ${s.cwd}  [${s.id}]`
        })
        addMsg(`历史会话 (最近 ${sessions.length} 条):\n${lines.join('\n')}\n\n用 /history resume <id> 恢复某条会话`)
        break
      }
      case '/history resume': {
        // unreachable — handled above, kept for clarity
        break
      }
      case '/config': {
        const subCmd = parts[1]?.toLowerCase()
        if (!subCmd) {
          const cfg = await readConfig()
          addMsg(
            `当前配置:\n` +
            `  defaultModel:     ${cfg.defaultModel}\n` +
            `  defaultPlatform:  ${cfg.defaultPlatform}\n` +
            `  shellPermission:  ${cfg.shellPermission}  (auto|confirm|deny)\n` +
            `  permissionMode:   ${cfg.permissionMode}  (default|plan|auto)\n` +
            `  language:         ${cfg.language}  (zh|en)\n` +
            `  theme:            ${cfg.theme}  (dark|light)\n` +
            `  vimMode:          ${cfg.vimMode}\n` +
            `\n用法: /config <key> <value>`
          )
          break
        }
        const val = parts[2]
        if (!val) { addMsg('用法: /config <key> <value>'); break }
        const cfg = await readConfig()
        if (subCmd === 'shellpermission' || subCmd === 'shellPermission') {
          if (!['auto', 'confirm', 'deny'].includes(val)) { addMsg('shellPermission 可选值: auto | confirm | deny'); break }
          await writeConfig({ ...cfg, shellPermission: val as any })
          addMsg(`✓ shellPermission 已设为 ${val}`)
        } else if (subCmd === 'theme') {
          if (!['dark', 'light'].includes(val)) { addMsg('theme 可选值: dark | light'); break }
          await writeConfig({ ...cfg, theme: val as any })
          addMsg(`✓ theme 已设为 ${val}`)
        } else {
          addMsg(`未知配置项: ${subCmd}  可用: shellPermission, permissionMode, language, theme, vimMode`)
        }
        break
      }
      case '/permissions': {
        const cfg = await readConfig()
        const val = parts[1]?.toLowerCase()
        if (!val) {
          const modeDesc: Record<string, string> = {
            default: '每次危险操作都需要确认',
            plan:    '先制定计划，再执行（适合复杂任务）',
            auto:    '自动执行所有操作，无需确认',
          }
          addMsg(
            `当前权限模式: ${cfg.permissionMode}\n\n` +
            `可用模式:\n` +
            `  default  ${modeDesc.default}\n` +
            `  plan     ${modeDesc.plan}\n` +
            `  auto     ${modeDesc.auto}\n\n` +
            `用法: /permissions <default|plan|auto>`
          )
          break
        }
        if (!['default', 'plan', 'auto'].includes(val)) { addMsg('可选值: default | plan | auto'); break }
        await writeConfig({ ...cfg, permissionMode: val as any })
        uiStore.setState(prev => ({ ...prev, permissionMode: val as any }))
        addMsg(`✓ 权限模式已设为 ${val}`)
        break
      }
      case '/lang': {
        const cfg = await readConfig()
        const val = parts[1]?.toLowerCase()
        if (!val) {
          addMsg(`当前语言: ${cfg.language}  用法: /lang zh 或 /lang en`)
          break
        }
        if (!['zh', 'en'].includes(val)) { addMsg('可选值: zh | en'); break }
        await writeConfig({ ...cfg, language: val as any })
        addMsg(val === 'zh' ? '✓ 已切换为中文' : '✓ Switched to English')
        break
      }
      case '/status': {
        const s = uiStore.getState()
        const cfg = await readConfig()
        const creds = await readCredentials()
        const username = (creds as any).username
        const u = s.tokenUsage
        const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
        addMsg(
          `状态:\n` +
          `  模型:     ${cfg.defaultModel} (${cfg.defaultPlatform})\n` +
          `  权限模式: ${cfg.permissionMode}\n` +
          `  语言:     ${cfg.language}\n` +
          `  登录:     ${username ? `✓ ${username}` : '未登录'}\n` +
          `  会话:     ${s.turns} 轮\n` +
          `  用量:     输入 ${fmt(u.input)} · 输出 ${fmt(u.output)} · 总计 ${fmt(u.total)} tokens`
        )
        break
      }
      case '/compact': {
        const { shouldCompress, compressMessages } = await import('../../session/compressor.js')
        const { readCredentials: rc } = await import('../../auth/credentials.js')
        const cfg = await readConfig()
        const creds = await rc()
        const msgs = uiStore.getState().messages
        addMsg('正在压缩上下文...')
        const result = await compressMessages(msgs, cfg.defaultPlatform, cfg.defaultModel, (creds as any).accessToken)
        if (result) {
          uiStore.setState(prev => ({ ...prev, messages: result.messages }))
          addMsg(`✓ 已压缩 ${result.compressedCount} 条历史消息`)
        } else {
          addMsg('上下文无需压缩或压缩失败')
        }
        break
      }
      case '/vim': {
        const cfg = await readConfig()
        const newVal = !cfg.vimMode
        await writeConfig({ ...cfg, vimMode: newVal })
        addMsg(newVal ? '✓ Vim 模式已开启（当前会话暂不生效，重启后生效）' : '✓ Vim 模式已关闭')
        break
      }
      case '/skills': {
        const { loadSkills } = await import('../../skills/loader.js')
        const skills = loadSkills()
        if (!skills.length) {
          addMsg('未找到 Skills\n\n在 .qincode/skills/<name>/SKILL.md 或 ~/.config/qincode/skills/<name>/SKILL.md 创建')
          break
        }
        const lines = skills.map(s => `  ${s.name.padEnd(16)}${s.description}`)
        addMsg(`可用 Skills (${skills.length} 个):\n${lines.join('\n')}`)
        break
      }
      default: addMsg(`未知命令: ${parts[0]}  输入 /help 查看所有命令`)
    }
  }

  useInput((_in, key) => {
    if (key.ctrl && _in === 'c') {
      if (isProcessing) { uiStore.setState(prev => ({ ...prev, isProcessing: false })); return }
      process.exit(0)
    }
    if (permissionRequest || askUserQuestion) return
    if (isProcessing) return

    if (mode === 'apikey_platform') {
      if (key.downArrow) { setApikeyPlatformIdx(i => (i < PLATFORMS.length - 1 ? i + 1 : 0)); return }
      if (key.return) {
        const p = PLATFORMS[apikeyPlatformIdx]
        setApikeyPlatform(p.id)
        if (p.id === 'custom') { setApikeyUrl(''); setMode('apikey_url') }
        else { setApikeyValue(''); setMode('apikey_input') }
        return
      }
      if (key.escape) { setMode('input'); return }
      return
    }
    if (mode === 'apikey_url') {
      if (key.return) { if (apikeyUrl.trim()) setMode('apikey_input'); return }
      if (key.escape) { setMode('apikey_platform'); return }
      if (key.backspace || key.delete) { setApikeyUrl(v => v.slice(0, -1)); return }
      if (!key.ctrl && !key.meta && _in) { setApikeyUrl(v => v + _in); return }
      return
    }
    if (mode === 'apikey_input') {
      if (key.return) {
        const k = apikeyValue.trim(); if (!k) return
        if (apikeyPlatform === 'custom') {
          readConfig().then(async config => {
            const entry = { id: `custom-${Date.now()}`, name: 'Custom (OpenAI)', baseUrl: apikeyUrl, apiKey: k, modelId: 'gpt-4o' }
            await writeConfig({ ...config, customModels: [...config.customModels, entry], defaultModel: entry.id, defaultPlatform: 'custom' as const })
            addMsg(`✓ 自定义模型已保存 (${apikeyUrl})`)
          })
        } else { setApiKey(apikeyPlatform, k).then(() => addMsg(`✓ ${PLATFORMS.find(p => p.id === apikeyPlatform)?.name} API Key 已保存`)) }
        setApikeyValue(''); setMode('input'); return
      }
      if (key.escape) { setMode(apikeyPlatform === 'custom' ? 'apikey_url' : 'apikey_platform'); return }
      if (key.backspace || key.delete) { setApikeyValue(v => v.slice(0, -1)); return }
      if (!key.ctrl && !key.meta && _in) { setApikeyValue(v => v + _in); return }
      return
    }
    if (isProcessing) return

    if (mode === 'model_select') {
      if (key.upArrow)   { setSelectedIdx(i => (i > 0 ? i - 1 : modelList.length - 1)); return }
      if (key.downArrow) { setSelectedIdx(i => (i < modelList.length - 1 ? i + 1 : 0)); return }
      if (key.return) {
        const m = modelList[selectedIdx]
        if (m) readConfig().then(config => { writeConfig({ ...config, defaultModel: m.id, defaultPlatform: m.platform as any }).then(() => addMsg(`✓ 已切换到 ${m.name}`)) })
        setMode('input'); setInput(''); return
      }
      if (key.escape) { setMode('input'); setInput(''); return }
      return
    }

    if (key.upArrow && !showSugg) {
      const h = historyRef.current; if (!h.length) return
      if (historyIdxRef.current === -1) savedRef.current = input
      const idx = Math.min(historyIdxRef.current + 1, h.length - 1)
      historyIdxRef.current = idx; setInput(h[idx]); return
    }
    if (key.downArrow && !showSugg) {
      if (historyIdxRef.current === -1) return
      const idx = historyIdxRef.current - 1
      historyIdxRef.current = idx; setInput(idx === -1 ? savedRef.current : historyRef.current[idx]); return
    }

    if (showSugg && filteredCmds.length > 0) {
      if (key.upArrow)   { setSelectedIdx(i => (i > 0 ? i - 1 : filteredCmds.length - 1)); return }
      if (key.downArrow) { setSelectedIdx(i => (i < filteredCmds.length - 1 ? i + 1 : 0)); return }
      if (key.tab) {
        const t = filteredCmds[selectedIdx]
        if (t.name === '/model') { setMode('model_select'); setInput(''); return }
        if (t.name === '/api-key') { setApikeyPlatformIdx(0); setMode('apikey_platform'); setInput(''); return }
        setInput(t.name + ' '); setSelectedIdx(0); return
      }
    }
    if (key.escape) { setInput(''); historyIdxRef.current = -1; return }
    if (key.return && !key.shift) {
      const text = input.trim(); if (!text) return
      if (showSugg && filteredCmds.length > 0) {
        const sel = filteredCmds[selectedIdx]
        if (sel) {
          if (sel.name === '/model') { setMode('model_select'); setInput(''); return }
          if (sel.name === '/api-key') { setApikeyPlatformIdx(0); setMode('apikey_platform'); setInput(''); return }
          setInput(sel.name + ' '); return
        }
      }
      submit(text); return
    }
    if (key.backspace || key.delete) setInput(v => v.slice(0, -1))
    else if (!key.ctrl && !key.meta && _in) setInput(v => v + _in)
  })

  // ── Overlay modes ──
  if (mode === 'model_select') return (
    <Box flexDirection="column" marginX={2} marginBottom={1}>
      <Box flexDirection="column" borderStyle="round" borderColor={COLORS.primary} paddingX={1}>
        <Text color={COLORS.textMuted}>选择模型  ↑↓ 选择  Enter 确认  Esc 取消</Text>
        <Box />
        {modelList.map((m, i) => (
          <Box key={m.id} gap={2}>
            <Text color={i === selectedIdx ? COLORS.primary : COLORS.bgLight}>{i === selectedIdx ? '›' : ' '}</Text>
            <Text color={i === selectedIdx ? COLORS.textPrimary : COLORS.textSecondary} bold={i === selectedIdx}>{m.name}</Text>
            <Text color={COLORS.textMuted}>{m.platform}</Text>
            <Text color={COLORS.textMuted} dimColor>{m.desc}</Text>
            {m.id === currentModel && <Text color={COLORS.success}> ✓</Text>}
          </Box>
        ))}
      </Box>
    </Box>
  )

  if (mode === 'apikey_platform') return (
    <Box flexDirection="column" marginX={2} marginBottom={1}>
      <Box flexDirection="column" borderStyle="round" borderColor={COLORS.accent} paddingX={1}>
        <Text color={COLORS.textMuted}>选择平台  ↑↓ 选择  Enter 确认  Esc 取消</Text>
        <Box />
        {PLATFORMS.map((p, i) => (
          <Box key={p.id} gap={2}>
            <Text color={i === apikeyPlatformIdx ? COLORS.accent : COLORS.bgLight}>{i === apikeyPlatformIdx ? '›' : ' '}</Text>
            <Text color={i === apikeyPlatformIdx ? COLORS.textPrimary : COLORS.textSecondary} bold={i === apikeyPlatformIdx}>{p.name}</Text>
            <Text color={COLORS.textMuted} dimColor>{p.hint}</Text>
          </Box>
        ))}
      </Box>
    </Box>
  )

  if (mode === 'apikey_url') return (
    <Box flexDirection="column" marginX={2} marginBottom={1}>
      <Box flexDirection="column" borderStyle="round" borderColor={COLORS.accent} paddingX={1}>
        <Text color={COLORS.textMuted}>输入 Base URL  Enter 下一步  Esc 返回</Text>
        <Box gap={1}><Text color={COLORS.accent}>URL</Text><Text color={COLORS.textPrimary}> {apikeyUrl}</Text><Text color={COLORS.primary}>{cursorOn ? '▌' : ' '}</Text></Box>
      </Box>
    </Box>
  )

  if (mode === 'apikey_input') return (
    <Box flexDirection="column" marginX={2} marginBottom={1}>
      <Box flexDirection="column" borderStyle="round" borderColor={COLORS.accent} paddingX={1}>
        <Text color={COLORS.textMuted}>输入 API Key  Enter 保存  Esc 返回</Text>
        <Box gap={1}><Text color={COLORS.accent}>Key</Text><Text color={COLORS.textPrimary}> {'•'.repeat(Math.min(apikeyValue.length, 24))}</Text><Text color={COLORS.primary}>{cursorOn ? '▌' : ' '}</Text></Box>
      </Box>
    </Box>
  )

  // ── Normal input ──
  return (
    <Box flexDirection="column" marginX={2} marginBottom={0} marginTop={1}>
      {showSugg && filteredCmds.length > 0 && (
        <Box flexDirection="column" marginBottom={0} paddingX={1}>
          {filteredCmds.map((cmd, i) => (
            <Box key={cmd.name} gap={2}>
              <Text color={i === selectedIdx ? COLORS.primary : COLORS.bgLight}>{i === selectedIdx ? '›' : ' '}</Text>
              <Text color={i === selectedIdx ? COLORS.primary : COLORS.textSecondary} bold={i === selectedIdx}>{cmd.name}</Text>
              <Text color={COLORS.textMuted}>{cmd.desc}</Text>
            </Box>
          ))}
        </Box>
      )}
      {/* Single-line input, no border box — clean underline style */}
      <Box gap={0}>
        <Text color={isProcessing ? COLORS.textMuted : COLORS.primary}>{'❯ '}</Text>
        {!isProcessing && (
          <>
            {input ? (
              <>
                <Text color={COLORS.inputText}>{input}</Text>
                <Text color={COLORS.primary} bold>{cursorOn ? '▌' : ' '}</Text>
              </>
            ) : (
              <>
                <Text color={COLORS.primary} bold>{cursorOn ? '▌' : ' '}</Text>
                <Text color={COLORS.inputPlaceholder}>{'消息或 / 命令'}</Text>
              </>
            )}
          </>
        )}
      </Box>
      <Text color={COLORS.borderDim}>{'─'.repeat(60)}</Text>
    </Box>
  )
}