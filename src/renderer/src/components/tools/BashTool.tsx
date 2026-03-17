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
        <Terminal size={13} className="mt-0.5 shrink-0 text-success" />
        <pre className="min-w-0 flex-1 overflow-x-auto whitespace-pre-wrap rounded bg-base-raised px-2 py-1.5 font-mono text-success text-xs">
          {command}
        </pre>
      </div>
      {result && <CollapsibleOutput text={result} />}
    </div>
  )
}
