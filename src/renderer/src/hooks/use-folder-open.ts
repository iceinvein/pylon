// src/renderer/src/hooks/use-folder-open.ts
import { useState } from 'react'
import { useUiStore } from '../store/ui-store'
import { useSessionStore } from '../store/session-store'

type DialogState = { path: string; isDirty: boolean }

export function useFolderOpen() {
  const setActiveSession = useUiStore((s) => s.setActiveSession)
  const setSession = useSessionStore((s) => s.setSession)
  const [dialogState, setDialogState] = useState<DialogState | null>(null)

  async function openInSession(cwd: string, useWorktree?: boolean) {
    // Persist this folder as a known project
    window.api.addProject(cwd).catch(() => {})

    // Get default model from settings
    const settings = await window.api.getSettings()
    const model = (settings as { defaultModel: string }).defaultModel || 'claude-opus-4-6'

    // Create the session
    const sessionId = await window.api.createSession(cwd, model, useWorktree)

    // Hydrate session state
    setSession({
      id: sessionId,
      cwd,
      status: 'empty',
      model,
      title: '',
      cost: {
        inputTokens: 0,
        outputTokens: 0,
        totalUsd: 0,
        contextWindow: 0,
        contextInputTokens: 0,
        maxOutputTokens: 0,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    setActiveSession(sessionId)
  }

  async function openPath(path: string) {
    const status = await window.api.checkGitStatus(path)
    if (status.isGitRepo) {
      setDialogState({ path, isDirty: status.isDirty })
    } else {
      await openInSession(path)
    }
  }

  async function openFolder() {
    const path = await window.api.openFolder()
    if (!path) return
    await openPath(path)
  }

  function confirmDialog(useWorktree: boolean) {
    if (dialogState) {
      openInSession(dialogState.path, useWorktree || undefined)
    }
    setDialogState(null)
  }

  function cancelDialog() {
    setDialogState(null)
  }

  return { dialogState, openFolder, openPath, confirmDialog, cancelDialog }
}
