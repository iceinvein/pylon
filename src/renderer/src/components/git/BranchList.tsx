import { ArrowDownToLine, ArrowUpFromLine, ChevronDown, ChevronRight, GitBranch } from 'lucide-react'
import { useState } from 'react'
import type { BranchInfo } from '../../../../shared/git-types'

type BranchListProps = {
  branches: BranchInfo[]
  onCheckout: (branch: string) => void
  onScrollTo: (hash: string) => void
}

export function BranchList({ branches, onCheckout, onScrollTo }: BranchListProps) {
  const [showRemotes, setShowRemotes] = useState(false)

  const local = branches.filter((b) => b.type === 'local')
  const remote = branches.filter((b) => b.type === 'remote')

  return (
    <div className="overflow-y-auto border-stone-800 border-r p-2" style={{ width: 160 }}>
      <p className="mb-2 font-medium text-stone-400 text-[10px] uppercase tracking-wider">Branches</p>

      {local.map((b) => (
        <button
          key={b.name}
          type="button"
          onClick={() => onScrollTo(b.headHash)}
          onDoubleClick={() => onCheckout(b.name)}
          className={`flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-xs transition-colors hover:bg-stone-800 ${
            b.isCurrent ? 'text-amber-400' : 'text-stone-300'
          }`}
          title={`Double-click to checkout ${b.name}`}
        >
          <GitBranch size={11} className="flex-shrink-0" />
          <span className="min-w-0 flex-1 truncate">{b.name}</span>
          {b.ahead > 0 && (
            <span className="flex items-center gap-0.5 text-emerald-500 text-[10px]">
              <ArrowUpFromLine size={9} /> {b.ahead}
            </span>
          )}
          {b.behind > 0 && (
            <span className="flex items-center gap-0.5 text-amber-500 text-[10px]">
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
            className="mt-2 flex w-full items-center gap-1 rounded px-1.5 py-1 text-stone-500 text-[10px] uppercase tracking-wider hover:bg-stone-800 hover:text-stone-400"
          >
            {showRemotes ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
            Remotes ({remote.length})
          </button>
          {showRemotes &&
            remote.map((b) => (
              <button
                key={b.name}
                type="button"
                onClick={() => onScrollTo(b.headHash)}
                className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-stone-500 text-xs transition-colors hover:bg-stone-800 hover:text-stone-400"
              >
                <GitBranch size={11} className="flex-shrink-0" />
                <span className="min-w-0 flex-1 truncate">{b.name}</span>
              </button>
            ))}
        </>
      )}
    </div>
  )
}
