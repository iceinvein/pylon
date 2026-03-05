import { Bot, Loader2, CheckCircle, XCircle } from 'lucide-react'
import { useUiStore } from '../../store/ui-store'

type SubagentBlockProps = {
  sessionId: string
  agentType: string
  status: 'running' | 'done' | 'error'
  description?: string
}

export function SubagentBlock({ sessionId, agentType, status, description }: SubagentBlockProps) {
  const { openSubagentDrawer } = useUiStore()

  return (
    <button
      onClick={() => openSubagentDrawer(sessionId, agentType)}
      className="flex w-full items-start gap-3 rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2.5 text-left transition-colors hover:bg-zinc-800"
    >
      <Bot size={16} className="mt-0.5 flex-shrink-0 text-blue-400" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-zinc-200">{agentType}</span>
          {status === 'running' && (
            <span className="flex items-center gap-1 rounded-full bg-blue-900/40 px-1.5 py-0.5 text-xs text-blue-400">
              <Loader2 size={10} className="animate-spin" />
              running
            </span>
          )}
          {status === 'done' && (
            <span className="flex items-center gap-1 rounded-full bg-green-900/40 px-1.5 py-0.5 text-xs text-green-400">
              <CheckCircle size={10} />
              done
            </span>
          )}
          {status === 'error' && (
            <span className="flex items-center gap-1 rounded-full bg-red-900/40 px-1.5 py-0.5 text-xs text-red-400">
              <XCircle size={10} />
              error
            </span>
          )}
        </div>
        {description && (
          <p className="mt-0.5 truncate text-xs text-zinc-500">{description}</p>
        )}
      </div>
    </button>
  )
}
