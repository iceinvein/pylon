import { useState } from 'react'
import { Terminal, RefreshCw, CheckCircle2, XCircle } from 'lucide-react'
import { usePrReviewStore } from '../../store/pr-review-store'

export function GhSetupGuide() {
  const { ghStatus, checkGhStatus, ghStatusLoading, setGhPath } = usePrReviewStore()
  const [customPath, setCustomPath] = useState('')

  return (
    <div className="flex h-full items-center justify-center">
      <div className="max-w-md space-y-6 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-stone-800">
          <Terminal size={28} className="text-stone-400" />
        </div>

        <div>
          <h2 className="text-lg font-medium text-stone-100">GitHub CLI Required</h2>
          <p className="mt-2 text-sm text-stone-400">
            PR Review requires the <code className="rounded bg-stone-800 px-1.5 py-0.5 text-xs text-stone-300">gh</code> CLI to interact with GitHub.
          </p>
        </div>

        <div className="space-y-3 text-left">
          <div className="rounded-lg border border-stone-800 bg-stone-900/50 p-4">
            <h3 className="text-sm font-medium text-stone-300">1. Install gh CLI</h3>
            <code className="mt-2 block rounded bg-stone-950 px-3 py-2 text-xs text-stone-400">
              brew install gh
            </code>
          </div>

          <div className="rounded-lg border border-stone-800 bg-stone-900/50 p-4">
            <h3 className="text-sm font-medium text-stone-300">2. Authenticate</h3>
            <code className="mt-2 block rounded bg-stone-950 px-3 py-2 text-xs text-stone-400">
              gh auth login
            </code>
          </div>

          {ghStatus && !ghStatus.available && (
            <div className="rounded-lg border border-stone-800 bg-stone-900/50 p-4">
              <h3 className="text-sm font-medium text-stone-300">Custom path (optional)</h3>
              <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  value={customPath}
                  onChange={(e) => setCustomPath(e.target.value)}
                  placeholder="/usr/local/bin/gh"
                  className="flex-1 rounded bg-stone-950 px-3 py-1.5 text-xs text-stone-300 placeholder-stone-600 outline-none ring-1 ring-stone-800 focus:ring-stone-600"
                />
                <button
                  onClick={() => customPath && setGhPath(customPath)}
                  className="rounded bg-stone-800 px-3 py-1.5 text-xs text-stone-300 hover:bg-stone-700"
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
                <CheckCircle2 size={14} className="text-green-500" />
                <span className="text-green-400">Connected as {ghStatus.username}</span>
              </>
            ) : ghStatus.available && !ghStatus.authenticated ? (
              <>
                <XCircle size={14} className="text-amber-500" />
                <span className="text-amber-400">gh found but not authenticated</span>
              </>
            ) : (
              <>
                <XCircle size={14} className="text-red-500" />
                <span className="text-red-400">{ghStatus.error}</span>
              </>
            )}
          </div>
        )}

        <button
          onClick={checkGhStatus}
          disabled={ghStatusLoading}
          className="inline-flex items-center gap-2 rounded-lg bg-stone-800 px-4 py-2 text-sm text-stone-200 transition-colors hover:bg-stone-700 disabled:opacity-50"
        >
          <RefreshCw size={14} className={ghStatusLoading ? 'animate-spin' : ''} />
          Re-check
        </button>
      </div>
    </div>
  )
}
