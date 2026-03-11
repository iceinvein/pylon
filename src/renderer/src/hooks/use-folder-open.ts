import { useState } from 'react'
import { useTabStore } from '../store/tab-store'

type DialogState = { path: string; isDirty: boolean }

/**
 * @param reuseTabId — if provided, update this tab instead of creating a new one.
 *   Used when the active tab is a blank "New Tab" so we reuse it in-place.
 */
export function useFolderOpen(reuseTabId?: string) {
  const addTab = useTabStore((s) => s.addTab)
  const updateTab = useTabStore((s) => s.updateTab)
  const [dialogState, setDialogState] = useState<DialogState | null>(null)

  function openInTab(cwd: string, useWorktree?: boolean) {
    if (reuseTabId) {
      updateTab(reuseTabId, {
        cwd,
        label: cwd.split('/').pop() ?? cwd,
        useWorktree,
      })
    } else {
      addTab(cwd, undefined, undefined, useWorktree || undefined)
    }
  }

  async function openPath(path: string) {
    const status = await window.api.checkGitStatus(path)
    if (status.isGitRepo) {
      setDialogState({ path, isDirty: status.isDirty })
    } else {
      openInTab(path)
    }
  }

  async function openFolder() {
    const path = await window.api.openFolder()
    if (!path) return
    await openPath(path)
  }

  function confirmDialog(useWorktree: boolean) {
    if (dialogState) {
      openInTab(dialogState.path, useWorktree || undefined)
    }
    setDialogState(null)
  }

  function cancelDialog() {
    setDialogState(null)
  }

  return { dialogState, openFolder, openPath, confirmDialog, cancelDialog }
}
