import { buildTool } from '../../Tool.js'
import { exec } from 'child_process'

export const globTool = buildTool({
  name: 'glob',
  description: 'Find files matching a pattern.',
  inputSchema: {
    type: 'object',
    properties: {
      pattern: { type: 'string' },
    },
    required: ['pattern'],
  },
  async call(input, context) {
    const pattern = input.pattern as string
    const output = await new Promise<string>((resolve) => {
      exec(`find . -name "${pattern}" -type f`, { cwd: context.cwd }, (error: any, stdout: string, stderr: string) => {
        resolve(stdout || stderr || 'No files found')
      })
    })
    return { data: output }
  },
})
