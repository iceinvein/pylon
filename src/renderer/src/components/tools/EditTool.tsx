import { FileText } from 'lucide-react'

type EditToolProps = {
  input: Record<string, unknown>
}

export function EditTool({ input }: EditToolProps) {
  const path = String(input.file_path ?? input.path ?? '')
  const oldString = String(input.old_string ?? input.old ?? '')
  const newString = String(input.new_string ?? input.new ?? '')

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs text-zinc-400">
        <FileText size={13} className="flex-shrink-0 text-yellow-400" />
        <span className="font-mono text-zinc-300">{path}</span>
      </div>
      {oldString && (
        <div className="overflow-x-auto rounded border border-red-900/40 bg-red-950/20">
          <pre className="p-2 text-xs text-red-300">
            {oldString.split('\n').map((line, i) => (
              <div key={i} className="flex gap-2">
                <span className="select-none text-red-700">-</span>
                <span>{line}</span>
              </div>
            ))}
          </pre>
        </div>
      )}
      {newString && (
        <div className="overflow-x-auto rounded border border-green-900/40 bg-green-950/20">
          <pre className="p-2 text-xs text-green-300">
            {newString.split('\n').map((line, i) => (
              <div key={i} className="flex gap-2">
                <span className="select-none text-green-700">+</span>
                <span>{line}</span>
              </div>
            ))}
          </pre>
        </div>
      )}
    </div>
  )
}
