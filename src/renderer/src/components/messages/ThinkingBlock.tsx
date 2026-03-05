import { useState } from 'react'
import { ChevronDown, ChevronRight, CircleDot } from 'lucide-react'

type ThinkingBlockProps = {
  thinking: string
}

export function ThinkingBlock({ thinking }: ThinkingBlockProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 py-0.5 text-left"
      >
        {expanded ? (
          <ChevronDown size={14} className="flex-shrink-0 text-stone-600" />
        ) : (
          <ChevronRight size={14} className="flex-shrink-0 text-stone-600" />
        )}
        <CircleDot size={14} className="flex-shrink-0 text-stone-500" />
        <span className="text-sm font-medium text-stone-300">Thinking</span>
      </button>
      {expanded && (
        <div className="ml-8 mt-1 rounded border border-stone-800 bg-stone-900/50 px-3 py-2">
          <p className="whitespace-pre-wrap text-xs leading-relaxed text-stone-400">{thinking}</p>
        </div>
      )}
    </div>
  )
}
