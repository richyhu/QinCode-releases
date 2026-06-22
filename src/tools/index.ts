import { bashTool } from './BashTool/BashTool.js'
import { fileReadTool } from './FileReadTool/FileReadTool.js'
import { fileWriteTool } from './FileWriteTool/FileWriteTool.js'
import { fileEditTool } from './FileEditTool/FileEditTool.js'
import { globTool } from './GlobTool/GlobTool.js'
import { grepTool } from './GrepTool/GrepTool.js'
import { webSearchTool } from './WebSearchTool/WebSearchTool.js'
import { webFetchTool } from './WebFetchTool/WebFetchTool.js'
import { todoWriteTool } from './TodoWriteTool/TodoWriteTool.js'

export const tools = [
  bashTool,
  fileReadTool,
  fileWriteTool,
  fileEditTool,
  globTool,
  grepTool,
  webSearchTool,
  webFetchTool,
  todoWriteTool,
]
