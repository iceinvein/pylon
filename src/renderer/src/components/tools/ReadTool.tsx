import { FileText } from 'lucide-react'

type ReadToolProps = {
  input: Record<string, unknown>
}

export function ReadTool({ input }: ReadToolProps) {
  const path = String(input.file_path ?? input.path ?? '')
  const startLine = input.start_line ?? input.offset
  const endLine = input.end_line ?? input.limit

  return (
    <div className="flex items-center gap-2 text-xs text-stone-400">
      <FileText size={13} className="flex-shrink-0 text-blue-400" />
      <span className="min-w-0 truncate font-[family-name:var(--font-mono)] text-stone-300">{path}</span>
      {startLine !== undefined && (
        <span className="flex-shrink-0 text-stone-500">
          lines {String(startLine)}
          {endLine !== undefined ? `–${String(endLine)}` : '+'}
        </span>
      )}
    </div>
  )
}
