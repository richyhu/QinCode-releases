import { buildTool } from '../../Tool.js'
import fs from 'fs/promises'

export const fileReadTool = buildTool({
  name: 'file_read',
  description: 'Read the contents of a file.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string' },
    },
    required: ['path'],
  },
  async call(input, context) {
    const filePath = input.path as string
    try {
      const content = await fs.readFile(filePath, 'utf-8')
      return { data: content }
    } catch (error: any) {
      return { data: `Error reading file: ${error.message}` }
    }
  },
})
