import { FilePlus } from 'lucide-react'

type WriteToolProps = {
  input: Record<string, unknown>
  result?: string
}

export function WriteTool({ input, result }: WriteToolProps) {
  const path = String(input.file_path ?? input.path ?? '')
  const content = String(input.content ?? '')
  const lineCount = content ? content.split('\n').length : 0

  const isSuccess =
    result?.toLowerCase().includes('success') || result?.toLowerCase().includes('created')

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-base-text-secondary text-xs">
        <FilePlus size={13} className="shrink-0 text-emerald-400" />
        <span className="font-mono text-base-text">{path}</span>
      </div>
      <div className="text-base-text-muted text-xs">
        {isSuccess ? 'Created' : 'Writing'} &mdash; {lineCount} line{lineCount !== 1 ? 's' : ''}
      </div>
      {content && (
        <div className="overflow-x-auto rounded border border-base-border-subtle bg-base-bg/60 font-mono text-xs leading-5">
          {content.split('\n').map((line, i) => (
            <div key={i} className="flex gap-0 bg-success/20">
              <span className="w-8 shrink-0 select-none pr-1 text-right text-base-text-faint">
                {i + 1}
              </span>
              <span className="w-4 shrink-0 select-none text-center text-emerald-500/60">+</span>
              <span className="min-w-0 flex-1 whitespace-pre text-emerald-300/80">{line}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
