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
      <div className="flex items-center gap-2 text-xs text-stone-400">
        <FileText size={13} className="flex-shrink-0 text-yellow-400" />
        <span className="font-[family-name:var(--font-mono)] text-stone-300">{path}</span>
      </div>
      {oldString && (
        <div className="overflow-x-auto rounded border border-red-900/30 bg-red-950/15">
          <pre className="p-2 text-xs text-red-300/90">
            {oldString.split('\n').map((line, i) => (
              <div key={i} className="flex gap-2">
                <span className="select-none text-red-700/80">-</span>
                <span>{line}</span>
              </div>
            ))}
          </pre>
        </div>
      )}
      {newString && (
        <div className="overflow-x-auto rounded border border-emerald-900/30 bg-emerald-950/15">
          <pre className="p-2 text-xs text-emerald-300/90">
            {newString.split('\n').map((line, i) => (
              <div key={i} className="flex gap-2">
                <span className="select-none text-emerald-700/80">+</span>
                <span>{line}</span>
              </div>
            ))}
          </pre>
        </div>
      )}
    </div>
  )
}
