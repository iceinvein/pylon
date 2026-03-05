import { Bot, Loader2, CheckCircle, XCircle, ChevronRight } from 'lucide-react'
import { useUiStore } from '../../store/ui-store'

type SubagentBlockProps = {
  sessionId: string
  agentType: string
  status: 'running' | 'done' | 'error'
  description?: string
  agentId?: string
}

export function SubagentBlock({ sessionId, agentType, status, description, agentId }: SubagentBlockProps) {
  const { openSubagentDrawer } = useUiStore()

  return (
    <button
      onClick={() => openSubagentDrawer(sessionId, agentType, agentId)}
      className="group flex w-full items-center gap-2.5 rounded-md border border-stone-800 bg-stone-900/50 px-3 py-2 text-left transition-all hover:border-stone-700 hover:bg-stone-800/60"
    >
      <Bot size={14} className="flex-shrink-0 text-stone-500" />
      <span className="min-w-0 flex-1 truncate text-[13px] text-stone-300">{agentType}</span>
      {description && (
        <span className="hidden truncate text-xs text-stone-600 sm:inline">{description}</span>
      )}
      {status === 'running' && (
        <span className="flex items-center gap-1 text-xs text-blue-400">
          <Loader2 size={11} className="animate-spin" />
        </span>
      )}
      {status === 'done' && (
        <CheckCircle size={12} className="flex-shrink-0 text-green-500" />
      )}
      {status === 'error' && (
        <XCircle size={12} className="flex-shrink-0 text-red-400" />
      )}
      <ChevronRight size={12} className="flex-shrink-0 text-stone-700 transition-colors group-hover:text-stone-500" />
    </button>
  )
}
