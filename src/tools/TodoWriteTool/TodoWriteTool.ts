import { buildTool } from '../../Tool.js'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'

const TODOS_FILE = join(homedir(), '.config', 'qincode', 'todos.json')

async function saveTodos(todos: string[]): Promise<void> {
  await mkdir(join(homedir(), '.config', 'qincode'), { recursive: true })
  await writeFile(TODOS_FILE, JSON.stringify(todos, null, 2), 'utf-8')
}

async function loadTodos(): Promise<string[]> {
  try {
    const raw = await readFile(TODOS_FILE, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return []
  }
}

export const todoWriteTool = buildTool({
  name: 'todo_write',
  description: 'Manage a persistent todo list. Pass action=set to replace all todos, action=add to append, action=clear to remove all. Returns the current list.',
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', description: 'set | add | clear | list' },
      todos: { type: 'string', description: 'Newline-separated todo items (for set/add)' },
    },
    required: ['action'],
  },
  async call(input) {
    const action = (input.action as string) || 'list'
    const raw = (input.todos as string | undefined) || ''
    const items = raw.split('\n').map(s => s.trim()).filter(Boolean)

    if (action === 'clear') {
      await saveTodos([])
      return { data: '✓ 待办事项已清空' }
    }
    if (action === 'list') {
      const existing = await loadTodos()
      if (!existing.length) return { data: '暂无待办事项' }
      return { data: existing.map((t, i) => `${i + 1}. ${t}`).join('\n') }
    }
    if (action === 'add') {
      const existing = await loadTodos()
      const merged = [...existing, ...items]
      await saveTodos(merged)
      return { data: `✓ 已添加 ${items.length} 项，共 ${merged.length} 项\n` + merged.map((t, i) => `${i + 1}. ${t}`).join('\n') }
    }
    // default: set
    await saveTodos(items)
    return { data: `✓ 已保存 ${items.length} 条待办\n` + items.map((t, i) => `${i + 1}. ${t}`).join('\n') }
  },
})
