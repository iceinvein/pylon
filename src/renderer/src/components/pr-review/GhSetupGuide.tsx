import { CheckCircle2, RefreshCw, Terminal, XCircle } from 'lucide-react'
import { useState } from 'react'
import { usePrReviewStore } from '../../store/pr-review-store'

export function GhSetupGuide() {
  const { ghStatus, checkGhStatus, ghStatusLoading, setGhPath } = usePrReviewStore()
  const [customPath, setCustomPath] = useState('')

  return (
    <div className="flex h-full items-center justify-center">
      <div className="max-w-md space-y-6 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-base-raised">
          <Terminal size={28} className="text-base-text-secondary" />
        </div>

        <div>
          <h2 className="font-medium text-base-text text-lg">GitHub CLI Required</h2>
          <p className="mt-2 text-base-text-secondary text-sm">
            PR Review requires the{' '}
            <code className="rounded bg-base-raised px-1.5 py-0.5 text-base-text text-xs">gh</code>{' '}
            CLI to interact with GitHub.
          </p>
        </div>

        <div className="space-y-3 text-left">
          <div className="rounded-lg border border-base-border-subtle bg-base-surface/50 p-4">
            <h3 className="font-medium text-base-text text-sm">1. Install gh CLI</h3>
            <code className="mt-2 block rounded bg-base-bg px-3 py-2 text-base-text-secondary text-xs">
              brew install gh
            </code>
          </div>

          <div className="rounded-lg border border-base-border-subtle bg-base-surface/50 p-4">
            <h3 className="font-medium text-base-text text-sm">2. Authenticate</h3>
            <code className="mt-2 block rounded bg-base-bg px-3 py-2 text-base-text-secondary text-xs">
              gh auth login
            </code>
          </div>

          {ghStatus && !ghStatus.available && (
            <div className="rounded-lg border border-base-border-subtle bg-base-surface/50 p-4">
              <h3 className="font-medium text-base-text text-sm">Custom path (optional)</h3>
              <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  value={customPath}
                  onChange={(e) => setCustomPath(e.target.value)}
                  placeholder="/usr/local/bin/gh"
                  className="flex-1 rounded bg-base-bg px-3 py-1.5 text-base-text text-xs placeholder-base-text-faint outline-none ring-1 ring-base-border-subtle focus:ring-base-border"
                />
                <button
                  type="button"
                  onClick={() => customPath && setGhPath(customPath)}
                  className="rounded bg-base-raised px-3 py-1.5 text-base-text text-xs hover:bg-base-border"
                >
                  Set
                </button>
              </div>
            </div>
          )}
        </div>

        {ghStatus && (
          <div className="flex items-center justify-center gap-2 text-sm">
            {ghStatus.available && ghStatus.authenticated ? (
              <>
                <CheckCircle2 size={14} className="text-success" />
                <span className="text-success">Connected as {ghStatus.username}</span>
              </>
            ) : ghStatus.available && !ghStatus.authenticated ? (
              <>
                <XCircle size={14} className="text-warning" />
                <span className="text-warning">gh found but not authenticated</span>
              </>
            ) : (
              <>
                <XCircle size={14} className="text-error" />
                <span className="text-error">{ghStatus.error}</span>
              </>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={checkGhStatus}
          disabled={ghStatusLoading}
          className="inline-flex items-center gap-2 rounded-lg bg-base-raised px-4 py-2 text-base-text text-sm transition-colors hover:bg-base-border disabled:opacity-50"
        >
          <RefreshCw size={14} className={ghStatusLoading ? 'animate-spin' : ''} />
          Re-check
        </button>
      </div>
    </div>
  )
}
