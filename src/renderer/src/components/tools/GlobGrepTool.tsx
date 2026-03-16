import { Search } from 'lucide-react'
import { CollapsibleOutput } from './CollapsibleOutput'

type GlobGrepToolProps = {
  input: Record<string, unknown>
  toolName: string
  result?: string
}

export function GlobGrepTool({ input, toolName, result }: GlobGrepToolProps) {
  const pattern = String(input.pattern ?? input.glob ?? input.query ?? '')
  const path = input.path ? String(input.path) : undefined
  const isGrep = toolName.toLowerCase().includes('grep')

  return (
    <div>
      <div className="flex items-center gap-2 text-xs">
        <Search size={13} className="flex-shrink-0 text-[var(--color-special)]" />
        <span className="font-[family-name:var(--font-mono)] text-[var(--color-base-text)]">
          {pattern}
        </span>
        {path && <span className="text-[var(--color-base-text-muted)]">in {path}</span>}
        <span className="ml-auto text-[var(--color-base-text-faint)]">
          {isGrep ? 'grep' : 'glob'}
        </span>
      </div>
      {result && <CollapsibleOutput text={result} />}
    </div>
  )
}
