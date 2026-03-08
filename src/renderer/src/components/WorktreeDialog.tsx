import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { AlertTriangle, GitBranch, X } from 'lucide-react'

type WorktreeDialogProps = {
  folderPath: string
  isDirty: boolean
  onConfirm: (useWorktree: boolean) => void
  onCancel: () => void
}

export function WorktreeDialog({ folderPath, isDirty, onConfirm, onCancel }: WorktreeDialogProps) {
  const [useWorktree, setUseWorktree] = useState(false)

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
        onClick={onCancel}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.15 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md rounded-xl border border-stone-700 bg-stone-900 p-5 shadow-2xl"
        >
          <div className="flex items-start justify-between">
            <h2 className="text-sm font-medium text-stone-200">Open Project</h2>
            <button
              onClick={onCancel}
              className="rounded p-1 text-stone-500 transition-colors hover:bg-stone-800 hover:text-stone-300"
            >
              <X size={14} />
            </button>
          </div>

          <p className="mt-3 truncate text-xs text-stone-400" title={folderPath}>
            {folderPath}
          </p>

          {isDirty && (
            <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-950/30 px-3 py-2 border border-amber-900/50">
              <AlertTriangle size={14} className="mt-0.5 flex-shrink-0 text-amber-500" />
              <p className="text-xs text-amber-400/90">
                This repo has uncommitted changes. Consider using a worktree for isolation.
              </p>
            </div>
          )}

          <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-lg border border-stone-700 px-3 py-2.5 transition-colors hover:border-stone-600 hover:bg-stone-800/50">
            <input
              type="checkbox"
              checked={useWorktree}
              onChange={(e) => setUseWorktree(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-stone-600 bg-stone-800 text-amber-600 accent-amber-600"
            />
            <div className="flex items-center gap-2">
              <GitBranch size={13} className="text-stone-500" />
              <span className="text-xs text-stone-300">Open in isolated worktree</span>
            </div>
          </label>

          <div className="mt-5 flex justify-end gap-2">
            <button
              onClick={onCancel}
              className="rounded-lg px-3.5 py-1.5 text-xs text-stone-400 transition-colors hover:bg-stone-800 hover:text-stone-300"
            >
              Cancel
            </button>
            <button
              onClick={() => onConfirm(useWorktree)}
              className="rounded-lg bg-amber-600 px-3.5 py-1.5 text-xs font-medium text-stone-50 transition-colors hover:bg-amber-500"
            >
              Open
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
