import { buildTool } from '../../Tool.js'
import fs from 'fs/promises'

function makeDiff(oldText: string, newText: string, filePath: string): string {
  const oldLines = oldText.split('\n')
  const newLines = newText.split('\n')

  // Find changed region
  let start = 0
  while (start < oldLines.length && start < newLines.length && oldLines[start] === newLines[start]) {
    start++
  }
  let oldEnd = oldLines.length - 1
  let newEnd = newLines.length - 1
  while (oldEnd > start && newEnd > start && oldLines[oldEnd] === newLines[newEnd]) {
    oldEnd--; newEnd--
  }

  const context = 2
  const ctxStart = Math.max(0, start - context)
  const ctxOldEnd = Math.min(oldLines.length - 1, oldEnd + context)
  const ctxNewEnd = Math.min(newLines.length - 1, newEnd + context)

  const lines: string[] = []
  lines.push(`--- ${filePath}`)
  lines.push(`+++ ${filePath}`)
  lines.push(`@@ -${ctxStart + 1},${ctxOldEnd - ctxStart + 1} +${ctxStart + 1},${ctxNewEnd - ctxStart + 1} @@`)

  for (let i = ctxStart; i < start; i++)       lines.push(` ${oldLines[i]}`)
  for (let i = start; i <= oldEnd; i++)          lines.push(`-${oldLines[i]}`)
  for (let i = start; i <= newEnd; i++)          lines.push(`+${newLines[i]}`)
  for (let i = oldEnd + 1; i <= ctxOldEnd; i++) lines.push(` ${oldLines[i]}`)

  return lines.join('\n')
}

export const fileEditTool = buildTool({
  name: 'file_edit',
  description: 'Edit a file by replacing text. Returns a diff of the changes.',
  inputSchema: {
    type: 'object',
    properties: {
      path:     { type: 'string' },
      old_text: { type: 'string' },
      new_text: { type: 'string' },
    },
    required: ['path', 'old_text', 'new_text'],
  },
  async call(input, context) {
    const filePath = input.path     as string
    const oldText  = input.old_text as string
    const newText  = input.new_text as string
    try {
      const content = await fs.readFile(filePath, 'utf-8')
      if (!content.includes(oldText)) {
        return { data: `Error: old_text not found in ${filePath}` }
      }
      const updated = content.replace(oldText, newText)
      await fs.writeFile(filePath, updated, 'utf-8')
      const diff = makeDiff(content, updated, filePath)
      return { data: `__DIFF__\n${diff}` }
    } catch (error: any) {
      return { data: `Error editing file: ${error.message}` }
    }
  },
  isDestructive: () => true,
})
