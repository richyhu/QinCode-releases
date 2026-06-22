import fs from 'fs'
import path from 'path'
import { homedir } from 'os'

export type Skill = {
  name: string
  description: string
  path: string
}

export function loadSkills(): Skill[] {
  // Check both project-local and user-global skills directories
  const dirs = [
    path.join(process.cwd(), '.qincode', 'skills'),
    path.join(homedir(), '.config', 'qincode', 'skills'),
  ]

  const skills: Skill[] = []
  const seen = new Set<string>()

  for (const skillsDir of dirs) {
    if (!fs.existsSync(skillsDir)) continue

    const entries = fs.readdirSync(skillsDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const skillPath = path.join(skillsDir, entry.name, 'SKILL.md')
      if (!fs.existsSync(skillPath)) continue
      if (seen.has(entry.name)) continue
      seen.add(entry.name)

      const content = fs.readFileSync(skillPath, 'utf-8')
      const descMatch = content.match(/^# (.+)$/m)
      skills.push({
        name: entry.name,
        description: descMatch ? descMatch[1] : entry.name,
        path: skillPath,
      })
    }
  }

  return skills
}
