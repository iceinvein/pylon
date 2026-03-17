import { CheckCircle, Circle, Loader } from 'lucide-react'

type TodoWriteToolProps = {
  input: Record<string, unknown>
}

type TodoItem = {
  content: string
  status: 'pending' | 'in_progress' | 'completed'
  activeForm?: string
}

export function TodoWriteTool({ input }: TodoWriteToolProps) {
  const todos = (input.todos as TodoItem[] | undefined) ?? []
  const completed = todos.filter((t) => t.status === 'completed').length
  const inProgress = todos.filter((t) => t.status === 'in_progress').length

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-3 text-base-text-muted text-xs">
        <span>
          <span className="text-success">{completed}</span> done
        </span>
        {inProgress > 0 && (
          <span>
            <span className="text-warning">{inProgress}</span> active
          </span>
        )}
        <span>{todos.length} total</span>
      </div>
      <div className="space-y-0.5">
        {todos.map((todo, i) => (
          <div key={i} className="flex items-start gap-2 py-0.5">
            {todo.status === 'completed' ? (
              <CheckCircle size={13} className="mt-px shrink-0 text-success" />
            ) : todo.status === 'in_progress' ? (
              <Loader size={13} className="mt-px shrink-0 animate-spin text-warning" />
            ) : (
              <Circle size={13} className="mt-px shrink-0 text-base-text-faint" />
            )}
            <span
              className={`text-xs ${
                todo.status === 'completed'
                  ? 'text-base-text-muted line-through'
                  : todo.status === 'in_progress'
                    ? 'text-base-text'
                    : 'text-base-text-secondary'
              }`}
            >
              {todo.status === 'in_progress' && todo.activeForm ? todo.activeForm : todo.content}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
