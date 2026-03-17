import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ChevronDown,
  ChevronRight,
  GitBranch,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { BranchInfo } from '../../../../shared/git-types'

type BranchListProps = {
  branches: BranchInfo[]
  onCheckout: (branch: string) => void
  onScrollTo: (hash: string) => void
}

export function BranchList({ branches, onCheckout, onScrollTo }: BranchListProps) {
  const [open, setOpen] = useState(false)
  const [showRemotes, setShowRemotes] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)

  const local = branches.filter((b) => b.type === 'local')
  const remote = branches.filter((b) => b.type === 'remote')
  const current = branches.find((b) => b.isCurrent)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={popoverRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 rounded px-2 py-1 text-xs transition-colors hover:bg-base-raised ${
          open ? 'bg-base-raised text-base-text' : 'text-base-text-secondary'
        }`}
      >
        <GitBranch size={11} />
        <span className="max-w-30 truncate">{current?.name ?? 'branches'}</span>
        {current && (current.ahead > 0 || current.behind > 0) && (
          <span className="text-[10px] text-base-text-muted">
            {current.ahead > 0 && `↑${current.ahead}`}
            {current.behind > 0 && `↓${current.behind}`}
          </span>
        )}
        <ChevronDown
          size={10}
          className={`text-base-text-faint transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 max-h-80 min-w-50 overflow-y-auto rounded-lg border border-base-border bg-base-surface p-1.5 shadow-xl">
          {local.length > 0 && (
            <p className="mb-1 px-2 font-medium text-[9px] text-base-text-muted uppercase tracking-wider">
              Local
            </p>
          )}
          {local.map((b) => (
            <button
              key={b.name}
              type="button"
              onClick={() => {
                onScrollTo(b.headHash)
                setOpen(false)
              }}
              onDoubleClick={() => {
                onCheckout(b.name)
                setOpen(false)
              }}
              className={`flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-base-raised ${
                b.isCurrent ? 'text-warning' : 'text-base-text'
              }`}
              title={`Double-click to checkout ${b.name}`}
            >
              <GitBranch size={11} className="shrink-0" />
              <span className="min-w-0 flex-1 truncate">{b.name}</span>
              {b.ahead > 0 && (
                <span className="flex items-center gap-0.5 text-[10px] text-emerald-500">
                  <ArrowUpFromLine size={9} /> {b.ahead}
                </span>
              )}
              {b.behind > 0 && (
                <span className="flex items-center gap-0.5 text-[10px] text-warning">
                  <ArrowDownToLine size={9} /> {b.behind}
                </span>
              )}
            </button>
          ))}

          {remote.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setShowRemotes(!showRemotes)}
                className="mt-1 flex w-full items-center gap-1 rounded px-2 py-1 text-[9px] text-base-text-muted uppercase tracking-wider hover:bg-base-raised hover:text-base-text-secondary"
              >
                {showRemotes ? <ChevronDown size={9} /> : <ChevronRight size={9} />}
                Remotes ({remote.length})
              </button>
              {showRemotes &&
                remote.map((b) => (
                  <button
                    key={b.name}
                    type="button"
                    onClick={() => {
                      onScrollTo(b.headHash)
                      setOpen(false)
                    }}
                    className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-base-text-muted text-xs transition-colors hover:bg-base-raised hover:text-base-text-secondary"
                  >
                    <GitBranch size={11} className="shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{b.name}</span>
                  </button>
                ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
