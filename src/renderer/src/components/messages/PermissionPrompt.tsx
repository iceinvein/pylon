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
          <p className="font-medium text-amber-300 text-sm">Permission Required</p>
          <p className="mt-0.5 text-amber-500/80 text-xs">
            Claude wants to use:{' '}
            <span className="font-medium font-mono text-amber-400">{permission.toolName}</span>
          </p>
          <div className="mt-2 overflow-x-auto rounded border border-amber-900/30 bg-stone-900/50 px-2 py-1.5">
            <pre className="text-stone-400 text-xs">
              {JSON.stringify(permission.input, null, 2)}
            </pre>
          </div>
          {permission.suggestions && permission.suggestions.length > 0 && (
            <div className="mt-2 space-y-1">
              {permission.suggestions.map((s, i) => (
                <div key={i} className="flex gap-2 text-stone-500 text-xs">
                  <span className="text-stone-600">{s.type}:</span>
                  <code className="font-mono text-stone-400">{s.pattern}</code>
                </div>
              ))}
            </div>
          )}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => onRespond(permission.requestId, 'allow')}
              className="rounded-md bg-green-700 px-3 py-1.5 font-medium text-white text-xs transition-colors hover:bg-green-600"
            >
              Allow
            </button>
            <button
              type="button"
              onClick={() => onRespond(permission.requestId, 'deny')}
              className="rounded-md bg-stone-700 px-3 py-1.5 font-medium text-stone-200 text-xs transition-colors hover:bg-stone-600"
            >
              Deny
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
