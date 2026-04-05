import { ShieldQuestion } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import type { PermissionRequest } from '../../../../shared/types'

type PermissionPromptProps = {
  permission: PermissionRequest
  onRespond: (requestId: string, behavior: 'allow' | 'deny') => void
}

export function PermissionPrompt({ permission, onRespond }: PermissionPromptProps) {
  const [granted, setGranted] = useState(false)
  const [visible, setVisible] = useState(true)

  function handleAllow() {
    setGranted(true)
    // Brief flash then fade out before calling onRespond
    setTimeout(() => {
      setVisible(false)
      setTimeout(() => {
        onRespond(permission.requestId, 'allow')
      }, 200)
    }, 150)
  }

  function handleDeny() {
    onRespond(permission.requestId, 'deny')
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.25, 1, 0.5, 1] }}
          className={`my-2 mr-6 ml-15 rounded-lg border border-accent/30 p-4 transition-colors duration-150 ${
            granted ? 'bg-success/10' : 'bg-accent/8'
          }`}
        >
          <div className="flex items-start gap-3">
            <ShieldQuestion size={16} className="mt-0.5 shrink-0 text-accent-text" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-accent-text text-sm">Allow this action?</p>
              <p className="mt-0.5 text-base-text-secondary text-xs">
                Requesting:{' '}
                <span className="font-medium font-mono text-accent-text">
                  {permission.toolName}
                </span>
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
                  onClick={handleAllow}
                  className="rounded-md bg-success px-3 py-1.5 font-medium text-white text-xs transition-colors hover:bg-success/80"
                >
                  Allow
                </button>
                <button
                  type="button"
                  onClick={handleDeny}
                  className="rounded-md bg-base-raised px-3 py-1.5 font-medium text-base-text text-xs transition-colors hover:bg-base-border"
                >
                  Deny
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
