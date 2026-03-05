import { Terminal } from 'lucide-react'

type BashToolProps = {
  input: Record<string, unknown>
}

export function BashTool({ input }: BashToolProps) {
  const command = String(input.command ?? input.cmd ?? '')

  return (
    <div className="flex items-start gap-2">
      <Terminal size={13} className="mt-0.5 flex-shrink-0 text-green-400" />
      <pre className="min-w-0 flex-1 overflow-x-auto whitespace-pre-wrap rounded bg-zinc-800 px-2 py-1.5 font-mono text-xs text-green-300">
        {command}
      </pre>
    </div>
  )
}
