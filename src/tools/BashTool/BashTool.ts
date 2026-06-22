import { buildTool } from '../../Tool.js'
import { exec } from 'child_process'

export const bashTool = buildTool({
  name: 'bash',
  description: 'Run shell commands. Output is captured and returned.',
  inputSchema: {
    type: 'object',
    properties: {
      command: { type: 'string' },
      description: { type: 'string' },
      timeout: { type: 'number' },
    },
    required: ['command'],
  },
  async call(input, context) {
    const command = input.command as string
    const timeout = (input.timeout as number) ?? 30000
    const output = await new Promise<string>((resolve) => {
      exec(command, { cwd: context.cwd, timeout, maxBuffer: 10 * 1024 * 1024 }, (error: any, stdout: string, stderr: string) => {
        let result = ''
        if (stdout) result += stdout
        if (stderr) result += stderr
        if (error) {
          if (error.killed || error.signal === 'SIGTERM') {
            resolve(`Command timed out after ${timeout}ms\n${result}`)
            return
          }
          resolve(result || error.message)
          return
        }
        resolve(result || '(no output)')
      })
    })
    return { data: output }
  },
  isDestructive: () => true,
})
