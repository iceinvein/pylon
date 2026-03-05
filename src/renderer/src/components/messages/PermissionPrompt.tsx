import { ShieldQuestion } from 'lucide-react'
import type { PermissionRequest } from '../../../../shared/types'

type PermissionPromptProps = {
  permission: PermissionRequest
  onRespond: (requestId: string, behavior: 'allow' | 'deny') => void
}

export function PermissionPrompt({ permission, onRespond }: PermissionPromptProps) {
  return (
    <div className="mx-6 my-2 rounded-lg border border-amber-800/50 bg-amber-950/20 p-4">
      <div className="flex items-start gap-3">
        <ShieldQuestion size={16} className="mt-0.5 flex-shrink-0 text-amber-400" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-amber-300">Permission Required</p>
          <p className="mt-0.5 text-xs text-amber-500/80">
            Claude wants to use: <span className="font-mono font-medium text-amber-400">{permission.toolName}</span>
          </p>
          <div className="mt-2 overflow-x-auto rounded border border-amber-900/30 bg-stone-900/50 px-2 py-1.5">
            <pre className="text-xs text-stone-400">
              {JSON.stringify(permission.input, null, 2)}
            </pre>
          </div>
          {permission.suggestions && permission.suggestions.length > 0 && (
            <div className="mt-2 space-y-1">
              {permission.suggestions.map((s, i) => (
                <div key={i} className="flex gap-2 text-xs text-stone-500">
                  <span className="text-stone-600">{s.type}:</span>
                  <code className="font-mono text-stone-400">{s.pattern}</code>
                </div>
              ))}
            </div>
          )}
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => onRespond(permission.requestId, 'allow')}
              className="rounded-md bg-green-700 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-green-600"
            >
              Allow
            </button>
            <button
              onClick={() => onRespond(permission.requestId, 'deny')}
              className="rounded-md bg-stone-700 px-3 py-1.5 text-xs font-medium text-stone-200 transition-colors hover:bg-stone-600"
            >
              Deny
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
