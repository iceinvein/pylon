import { FileText } from 'lucide-react'

type ReadToolProps = {
  input: Record<string, unknown>
}

export function ReadTool({ input }: ReadToolProps) {
  const path = String(input.file_path ?? input.path ?? '')
  const startLine = input.start_line ?? input.offset
  const endLine = input.end_line ?? input.limit

  return (
    <div className="flex items-center gap-2 text-base-text-secondary text-xs">
      <FileText size={13} className="shrink-0 text-info" />
      <span className="min-w-0 truncate font-mono text-base-text">{path}</span>
      {startLine !== undefined && (
        <span className="shrink-0 text-base-text-muted">
          lines {String(startLine)}
          {endLine !== undefined ? `–${String(endLine)}` : '+'}
        </span>
      )}
    </div>
  )
}
