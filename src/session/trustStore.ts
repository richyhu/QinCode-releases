import { readFile, writeFile, mkdir } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'

const TRUST_FILE = join(homedir(), '.config', 'qincode', 'trusted-dirs.json')

export async function isTrustedDir(dir: string): Promise<boolean> {
  try {
    const raw = await readFile(TRUST_FILE, 'utf-8')
    const dirs: string[] = JSON.parse(raw)
    return dirs.includes(dir)
  } catch {
    return false
  }
}

export async function trustDir(dir: string): Promise<void> {
  let dirs: string[] = []
  try {
    const raw = await readFile(TRUST_FILE, 'utf-8')
    dirs = JSON.parse(raw)
  } catch {}
  if (!dirs.includes(dir)) dirs.push(dir)
  await mkdir(join(homedir(), '.config', 'qincode'), { recursive: true })
  await writeFile(TRUST_FILE, JSON.stringify(dirs, null, 2), 'utf-8')
}
