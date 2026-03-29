import { AlertTriangle, GitBranch, X } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import type { WorktreeRecipe } from '../../../shared/types'

function formatAge(timestamp: number): string {
  const diff = Date.now() - timestamp
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

type WorktreeDialogProps = {
  folderPath: string
  isDirty: boolean
  onConfirm: (useWorktree: boolean) => void
  onCancel: () => void
}

export function WorktreeDialog({ folderPath, isDirty, onConfirm, onCancel }: WorktreeDialogProps) {
  const [useWorktree, setUseWorktree] = useState(false)
  const [recipe, setRecipe] = useState<WorktreeRecipe | null>(null)
  const [reanalyzing, setReanalyzing] = useState(false)

  useEffect(() => {
    window.api.getWorktreeRecipe(folderPath).then(setRecipe)
  }, [folderPath])

  async function handleReanalyze() {
    setReanalyzing(true)
    await window.api.deleteWorktreeRecipe(folderPath)
    setRecipe(null)
    setReanalyzing(false)
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onCancel}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.15 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl border border-base-border bg-base-surface p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between">
          <h2 className="font-medium text-base-text text-sm">Open Project</h2>
          <button
            type="button"
            onClick={onCancel}
            className="rounded p-1 text-base-text-muted transition-colors hover:bg-base-raised hover:text-base-text"
          >
            <X size={14} />
          </button>
        </div>

        <p className="mt-3 truncate text-base-text-secondary text-xs" title={folderPath}>
          {folderPath}
        </p>

        {isDirty && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-accent/50 bg-accent-muted/30 px-3 py-2">
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" />
            <p className="text-warning/90 text-xs">
              This repo has uncommitted changes. Consider using a worktree for isolation.
            </p>
          </div>
        )}

        <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-lg border border-base-border px-3 py-2.5 transition-colors hover:border-base-border hover:bg-base-raised/50">
          <input
            type="checkbox"
            checked={useWorktree}
            onChange={(e) => setUseWorktree(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-base-border bg-base-raised text-accent accent-amber-600"
          />
          <div className="flex items-center gap-2">
            <GitBranch size={13} className="text-base-text-muted" />
            <span className="text-base-text text-xs">Open in isolated worktree</span>
          </div>
        </label>

        {useWorktree && recipe && (
          <div className="mt-2 ml-9 flex items-center justify-between rounded-md border border-accent/20 bg-accent/5 px-3 py-2">
            <div>
              <p className="text-accent/80 text-[11px]">Setup recipe cached</p>
              <p className="text-accent/50 text-[10px]">
                {recipe.steps.length} {recipe.steps.length === 1 ? 'step' : 'steps'} • analyzed{' '}
                {formatAge(recipe.createdAt)}
              </p>
            </div>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleReanalyze() }}
              disabled={reanalyzing}
              className="rounded border border-accent/30 px-2 py-0.5 text-accent/70 text-[10px] transition-colors hover:bg-accent/10 disabled:opacity-50"
            >
              {reanalyzing ? '...' : 'Reanalyze'}
            </button>
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-3.5 py-1.5 text-base-text-secondary text-xs transition-colors hover:bg-base-raised hover:text-base-text"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(useWorktree)}
            className="rounded-lg bg-accent px-3.5 py-1.5 font-medium text-white text-xs transition-colors hover:bg-accent-hover"
          >
            Open
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
