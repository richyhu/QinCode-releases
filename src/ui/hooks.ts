import { useSyncExternalStore, useCallback } from 'react'
import { createStore } from '../state/store.js'
import type { Message } from '../types.js'

export type PermissionRequestUI = {
  toolName: string
  input: Record<string, unknown>
  isDangerous?: boolean
  resolve: (result: 'allow' | 'deny' | 'manual') => void
}

export type AskUserQuestionUI = {
  question: string
  options: string[]
  resolve: (value: string) => void
}

export type UIState = {
  messages: Message[]
  isProcessing: boolean
  inputValue: string
  conversationId: string
  permissionRequest: PermissionRequestUI | null
  askUserQuestion: AskUserQuestionUI | null
  error: string | null
  turns: number
  statusText: string
  queryNonce: number
  tokenUsage: { input: number; output: number; total: number }
  sessionAllowedTools: Record<string, true>
  permissionMode: 'default' | 'plan' | 'auto'
  trustPrompt: { dir: string; resolve: (trusted: boolean) => void } | null
  compressing: { startedAt: number; inputTokens: number } | null
}

const initialState: UIState = {
  messages: [],
  isProcessing: false,
  inputValue: '',
  conversationId: '',
  permissionRequest: null,
  askUserQuestion: null,
  error: null,
  turns: 0,
  statusText: '',
  queryNonce: 0,
  tokenUsage: { input: 0, output: 0, total: 0 },
  sessionAllowedTools: {},
  permissionMode: 'default',
  trustPrompt: null,
  compressing: null,
}

export const uiStore = createStore<UIState>(initialState)

export function useUIStore<T>(selector: (state: UIState) => T): T {
  const subscribe = useCallback(
    (cb: () => void) => uiStore.subscribe(cb),
    [],
  )
  const getSnapshot = useCallback(
    () => selector(uiStore.getState()),
    [selector],
  )
  return useSyncExternalStore(subscribe, getSnapshot)
}
