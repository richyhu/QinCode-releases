import { buildTool } from '../../Tool.js'
import { exec } from 'child_process'

export const grepTool = buildTool({
  name: 'grep',
  description: 'Search for text in files.',
  inputSchema: {
    type: 'object',
    properties: {
      pattern: { type: 'string' },
      path: { type: 'string' },
    },
    required: ['pattern'],
  },
  async call(input, context) {
    const pattern = input.pattern as string
    const path = (input.path as string) || '.'
    const output = await new Promise<string>((resolve) => {
      exec(`grep -r "${pattern}" ${path}`, { cwd: context.cwd }, (error: any, stdout: string, stderr: string) => {
        resolve(stdout || stderr || 'No matches found')
      })
    })
    return { data: output }
  },
})
