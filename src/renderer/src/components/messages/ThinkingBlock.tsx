import { useState } from 'react'
import { Brain, ChevronDown, ChevronRight } from 'lucide-react'

type ThinkingBlockProps = {
  thinking: string
}

export function ThinkingBlock({ thinking }: ThinkingBlockProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="mb-2 rounded-lg border border-zinc-800 bg-zinc-900/50">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-xs text-zinc-500 transition-colors hover:text-zinc-400"
      >
        <Brain size={12} />
        <span>Thinking</span>
        <div className="flex-1" />
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </button>
      {expanded && (
        <div className="border-t border-zinc-800 px-3 py-2">
          <p className="whitespace-pre-wrap text-xs leading-relaxed text-zinc-500">{thinking}</p>
        </div>
      )}
    </div>
  )
}
