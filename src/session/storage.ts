import { readFile, writeFile, mkdir, readdir, unlink } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'
import type { Message } from '../types.js'

const SESSIONS_DIR = join(homedir(), '.config', 'qincode', 'sessions')
const MAX_SESSIONS = 10

export interface SessionData {
  id: string
  savedAt: number
  messages: Message[]
  tokenUsage: { input: number; output: number; total: number }
  turns: number
  cwd: string
}

async function ensureDir() {
  await mkdir(SESSIONS_DIR, { recursive: true })
}

export async function saveSession(data: Omit<SessionData, 'id' | 'savedAt'>): Promise<void> {
  if (data.messages.length === 0) return
  await ensureDir()
  const id = `session-${Date.now()}`
  const session: SessionData = { id, savedAt: Date.now(), ...data }
  await writeFile(join(SESSIONS_DIR, `${id}.json`), JSON.stringify(session, null, 2), 'utf-8')
  await pruneOldSessions()
}

export async function loadLastSession(): Promise<SessionData | null> {
  await ensureDir()
  try {
    const files = (await readdir(SESSIONS_DIR))
      .filter(f => f.endsWith('.json'))
      .sort()
      .reverse()
    if (files.length === 0) return null
    const raw = await readFile(join(SESSIONS_DIR, files[0]), 'utf-8')
    return JSON.parse(raw) as SessionData
  } catch {
    return null
  }
}

export async function clearSessions(): Promise<void> {
  await ensureDir()
  const files = (await readdir(SESSIONS_DIR)).filter(f => f.endsWith('.json'))
  await Promise.all(files.map(f => unlink(join(SESSIONS_DIR, f))))
}

export async function listSessions(): Promise<SessionData[]> {
  await ensureDir()
  try {
    const files = (await readdir(SESSIONS_DIR))
      .filter(f => f.endsWith('.json'))
      .sort()
      .reverse()
    const results = await Promise.all(
      files.map(async f => {
        try {
          const raw = await readFile(join(SESSIONS_DIR, f), 'utf-8')
          return JSON.parse(raw) as SessionData
        } catch {
          return null
        }
      })
    )
    return results.filter(Boolean) as SessionData[]
  } catch {
    return []
  }
}

export async function loadSessionById(id: string): Promise<SessionData | null> {
  await ensureDir()
  try {
    const raw = await readFile(join(SESSIONS_DIR, `${id}.json`), 'utf-8')
    return JSON.parse(raw) as SessionData
  } catch {
    return null
  }
}
async function pruneOldSessions() {
  const files = (await readdir(SESSIONS_DIR))
    .filter(f => f.endsWith('.json'))
    .sort()
  if (files.length > MAX_SESSIONS) {
    const toDelete = files.slice(0, files.length - MAX_SESSIONS)
    await Promise.all(toDelete.map(f => unlink(join(SESSIONS_DIR, f))))
  }
}
