import { ChevronDown, ChevronRight, CircleDot } from 'lucide-react'
import { useState } from 'react'

type ThinkingBlockProps = {
  thinking: string
}

export function ThinkingBlock({ thinking }: ThinkingBlockProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 py-0.5 text-left"
      >
        {expanded ? (
          <ChevronDown size={14} className="shrink-0 text-base-text-faint" />
        ) : (
          <ChevronRight size={14} className="shrink-0 text-base-text-faint" />
        )}
        <CircleDot size={14} className="shrink-0 text-base-text-muted" />
        <span className="font-medium text-base-text text-sm">Thinking</span>
      </button>
      {expanded && (
        <div className="mt-1 ml-8 rounded border border-base-border-subtle bg-base-surface/50 px-3 py-2">
          <p className="whitespace-pre-wrap text-base-text-secondary text-xs leading-relaxed">
            {thinking}
          </p>
        </div>
      )}
    </div>
  )
}
