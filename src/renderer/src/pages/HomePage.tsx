import { useState } from 'react'
import { FolderOpen } from 'lucide-react'
import { useTabStore } from '../store/tab-store'
import { SessionHistory } from '../components/SessionHistory'
import { WorktreeDialog } from '../components/WorktreeDialog'

export function HomePage() {
  const { addTab } = useTabStore()
  const [dialogState, setDialogState] = useState<{ path: string; isDirty: boolean } | null>(null)

  async function handleOpenFolder() {
    const path = await window.api.openFolder()
    if (!path) return

    const status = await window.api.checkGitStatus(path)
    if (status.isGitRepo) {
      setDialogState({ path, isDirty: status.isDirty })
    } else {
      addTab(path)
    }
  }

  function handleDialogConfirm(useWorktree: boolean) {
    if (dialogState) {
      addTab(dialogState.path, undefined, undefined, useWorktree || undefined)
    }
    setDialogState(null)
  }

  return (
    <div className="flex h-full flex-col items-center overflow-y-auto py-12 px-6">
      <div className="w-full max-w-lg">
        <div className="mb-12 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-stone-100">Claude UI</h1>
          <p className="mt-2 text-stone-500">AI-powered development assistant</p>
          <button
            onClick={handleOpenFolder}
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-amber-600 px-5 py-2.5 text-sm font-medium text-stone-50 transition-colors hover:bg-amber-500"
          >
            <FolderOpen size={16} />
            Open Folder
          </button>
        </div>

        <SessionHistory />
      </div>

      {dialogState && (
        <WorktreeDialog
          folderPath={dialogState.path}
          isDirty={dialogState.isDirty}
          onConfirm={handleDialogConfirm}
          onCancel={() => setDialogState(null)}
        />
      )}
    </div>
  )
}
