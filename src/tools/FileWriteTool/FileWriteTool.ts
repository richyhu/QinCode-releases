import { buildTool } from '../../Tool.js'
import fs from 'fs/promises'

export const fileWriteTool = buildTool({
  name: 'file_write',
  description: 'Write content to a file.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string' },
      content: { type: 'string' },
    },
    required: ['path', 'content'],
  },
  async call(input, context) {
    const filePath = input.path as string
    const content = input.content as string
    try {
      await fs.writeFile(filePath, content, 'utf-8')
      return { data: `File written successfully: ${filePath}` }
    } catch (error: any) {
      return { data: `Error writing file: ${error.message}` }
    }
  },
  isDestructive: () => true,
})
