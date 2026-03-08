import { useState } from 'react'
import { useTabStore } from '../store/tab-store'

type DialogState = { path: string; isDirty: boolean }

export function useFolderOpen() {
  const addTab = useTabStore((s) => s.addTab)
  const [dialogState, setDialogState] = useState<DialogState | null>(null)

  async function openPath(path: string) {
    const status = await window.api.checkGitStatus(path)
    if (status.isGitRepo) {
      setDialogState({ path, isDirty: status.isDirty })
    } else {
      addTab(path)
    }
  }

  async function openFolder() {
    const path = await window.api.openFolder()
    if (!path) return
    await openPath(path)
  }

  function confirmDialog(useWorktree: boolean) {
    if (dialogState) {
      addTab(dialogState.path, undefined, undefined, useWorktree || undefined)
    }
    setDialogState(null)
  }

  function cancelDialog() {
    setDialogState(null)
  }

  return { dialogState, openFolder, openPath, confirmDialog, cancelDialog }
}
