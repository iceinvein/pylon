import { Search } from 'lucide-react'

type GlobGrepToolProps = {
  input: Record<string, unknown>
  toolName: string
}

export function GlobGrepTool({ input, toolName }: GlobGrepToolProps) {
  const pattern = String(input.pattern ?? input.glob ?? input.query ?? '')
  const path = input.path ? String(input.path) : undefined
  const isGrep = toolName.toLowerCase().includes('grep')

  return (
    <div className="flex items-center gap-2 text-xs">
      <Search size={13} className="flex-shrink-0 text-purple-400" />
      <span className="font-mono text-zinc-300">{pattern}</span>
      {path && <span className="text-zinc-500">in {path}</span>}
      <span className="ml-auto text-zinc-600">{isGrep ? 'grep' : 'glob'}</span>
    </div>
  )
}
