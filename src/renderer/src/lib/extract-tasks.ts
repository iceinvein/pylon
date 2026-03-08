/**
 * Pure function extracted from use-ipc-bridge.
 * Extracts TodoWrite task items from an SDK assistant message.
 */

export type TaskItem = {
  id: string
  subject: string
  status: 'pending' | 'in_progress' | 'completed'
  activeForm?: string
}

const VALID_STATUSES = new Set(['pending', 'in_progress', 'completed'])

export function extractTasks(message: unknown): TaskItem[] {
  const msg = message as {
    type?: string
    message?: { content?: unknown[] }
    content?: unknown[]
  }

  if (msg.type !== 'assistant') return []

  const content = (msg.message?.content ?? msg.content) as
    | Array<{ type: string; name?: string; input?: Record<string, unknown> }>
    | undefined

  if (!Array.isArray(content)) return []

  const tasks: TaskItem[] = []

  for (const block of content) {
    if (block.type !== 'tool_use' || !block.input) continue
    if (block.name !== 'TodoWrite') continue

    const todos = block.input.todos as
      | Array<{ content: string; status: string; activeForm?: string }>
      | undefined

    if (!Array.isArray(todos)) continue

    for (let i = 0; i < todos.length; i++) {
      const todo = todos[i]
      if (VALID_STATUSES.has(todo.status)) {
        tasks.push({
          id: String(i + 1),
          subject: todo.content,
          status: todo.status as TaskItem['status'],
          activeForm: todo.activeForm,
        })
      }
    }
  }

  return tasks
}
