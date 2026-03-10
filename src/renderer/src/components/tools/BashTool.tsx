import { Terminal } from 'lucide-react'
import { CollapsibleOutput } from './CollapsibleOutput'

type BashToolProps = {
  input: Record<string, unknown>
  result?: string
}

export function BashTool({ input, result }: BashToolProps) {
  const command = String(input.command ?? input.cmd ?? '')

  return (
    <div>
      <div className="flex items-start gap-2">
        <Terminal size={13} className="mt-0.5 flex-shrink-0 text-green-400" />
        <pre className="min-w-0 flex-1 overflow-x-auto whitespace-pre-wrap rounded bg-stone-800 px-2 py-1.5 font-[family-name:var(--font-mono)] text-green-300 text-xs">
          {command}
        </pre>
      </div>
      {result && <CollapsibleOutput text={result} />}
    </div>
  )
}
