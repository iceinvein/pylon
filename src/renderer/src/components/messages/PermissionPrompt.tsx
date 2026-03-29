import { ShieldQuestion } from 'lucide-react'
import type { PermissionRequest } from '../../../../shared/types'

type PermissionPromptProps = {
  permission: PermissionRequest
  onRespond: (requestId: string, behavior: 'allow' | 'deny') => void
}

export function PermissionPrompt({ permission, onRespond }: PermissionPromptProps) {
  return (
    <div className="my-2 mr-6 ml-15 rounded-lg border border-accent/30 bg-accent/8 p-4">
      <div className="flex items-start gap-3">
        <ShieldQuestion size={16} className="mt-0.5 shrink-0 text-accent-text" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-accent-text text-sm">Allow this action?</p>
          <p className="mt-0.5 text-base-text-secondary text-xs">
            Requesting:{' '}
            <span className="font-medium font-mono text-accent-text">{permission.toolName}</span>
          </p>
          <div className="mt-2 max-h-48 overflow-auto rounded border border-base-border bg-base-bg/50 px-2 py-1.5">
            <pre className="text-base-text-secondary text-xs">
              {JSON.stringify(permission.input, null, 2)}
            </pre>
          </div>
          {permission.suggestions && permission.suggestions.length > 0 && (
            <div className="mt-2 space-y-1">
              {permission.suggestions.map((s, i) => (
                <div key={i} className="flex gap-2 text-base-text-muted text-xs">
                  <span className="text-base-text-faint">{s.type}:</span>
                  <code className="font-mono text-base-text-secondary">{s.pattern}</code>
                </div>
              ))}
            </div>
          )}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => onRespond(permission.requestId, 'allow')}
              className="rounded-md bg-success px-3 py-1.5 font-medium text-white text-xs transition-colors hover:brightness-110"
            >
              Allow
            </button>
            <button
              type="button"
              onClick={() => onRespond(permission.requestId, 'deny')}
              className="rounded-md bg-base-raised px-3 py-1.5 font-medium text-base-text text-xs transition-colors hover:brightness-110"
            >
              Deny
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
