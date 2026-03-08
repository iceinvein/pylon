import { ipcMain, dialog, BrowserWindow } from 'electron'
import { readFile } from 'fs/promises'
import { IPC } from '../shared/ipc-channels'
import { getDb } from './db'
import { sessionManager } from './session-manager'
import type { AppSettings, PermissionMode, PermissionResponse, QuestionResponse } from '../shared/types'

const DEFAULT_SETTINGS: AppSettings = {
  defaultModel: 'claude-opus-4-6',
  defaultPermissionMode: 'default',
  theme: 'dark',
}

function getSettings(): AppSettings {
  const db = getDb()
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]
  const stored: Record<string, string> = {}
  for (const row of rows) {
    stored[row.key] = row.value
  }
  return {
    defaultModel: stored.defaultModel ?? DEFAULT_SETTINGS.defaultModel,
    defaultPermissionMode: (stored.defaultPermissionMode as PermissionMode) ?? DEFAULT_SETTINGS.defaultPermissionMode,
    theme: 'dark',
  }
}

function updateSetting(key: string, value: unknown): void {
  const db = getDb()
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, String(value))
}

export function registerIpcHandlers(): void {
  ipcMain.handle(IPC.SESSION_CREATE, async (_e, args: { cwd: string; model?: string }) => {
    return sessionManager.createSession(args.cwd, args.model)
  })

  ipcMain.handle(IPC.SESSION_SEND, async (_e, args: {
    sessionId: string; text: string;
    attachments?: Array<{ type: string; content: string; mediaType?: string; name?: string }>
  }) => {
    sessionManager.sendMessage(args.sessionId, args.text, args.attachments).catch(console.error)
    return true
  })

  ipcMain.handle(IPC.SESSION_STOP, async (_e, args: { sessionId: string }) => {
    await sessionManager.stopSession(args.sessionId)
    return true
  })

  ipcMain.handle(IPC.SESSION_RESUME, async (_e, args: { sessionId: string }) => {
    const success = sessionManager.resumeSession(args.sessionId)
    if (success) {
      const db = getDb()
      const row = db.prepare('SELECT title FROM sessions WHERE id = ?').get(args.sessionId) as { title: string } | undefined
      return { success: true, title: row?.title ?? '' }
    }
    return { success: false, title: '' }
  })

  ipcMain.handle(IPC.SESSION_LIST, async () => {
    return sessionManager.getStoredSessions()
  })

  ipcMain.handle(IPC.SESSION_MESSAGES, async (_e, args: { sessionId: string }) => {
    return sessionManager.getSessionMessages(args.sessionId)
  })

  ipcMain.handle(IPC.SESSION_DELETE, async (_e, args: { sessionId: string }) => {
    sessionManager.deleteSession(args.sessionId)
    return true
  })

  ipcMain.handle(IPC.FOLDER_OPEN, async () => {
    const window = BrowserWindow.getFocusedWindow()
    if (!window) return null
    const result = await dialog.showOpenDialog(window, {
      properties: ['openDirectory'],
      title: 'Select Project Folder',
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle(IPC.FILE_READ_BASE64, async (_e, args: { path: string }) => {
    const buffer = await readFile(args.path)
    return buffer.toString('base64')
  })

  ipcMain.handle(IPC.PERMISSION_RESPONSE, async (_e, response: PermissionResponse) => {
    sessionManager.resolvePermission(response)
    return true
  })

  ipcMain.handle(IPC.QUESTION_RESPONSE, async (_e, response: QuestionResponse) => {
    sessionManager.resolveQuestion(response)
    return true
  })

  ipcMain.handle(IPC.SESSION_SET_MODEL, async (_e, args: { sessionId: string; model: string }) => {
    sessionManager.setModel(args.sessionId, args.model)
    return true
  })

  ipcMain.handle(IPC.SESSION_SET_PERMISSION_MODE, async (_e, args: { sessionId: string; mode: PermissionMode }) => {
    sessionManager.setPermissionMode(args.sessionId, args.mode)
    return true
  })

  ipcMain.handle(IPC.SESSION_GET_INFO, async (_e, args: { sessionId: string }) => {
    return sessionManager.getSessionInfo(args.sessionId)
  })

  ipcMain.handle(IPC.SESSION_FILE_DIFFS, async (_e, args: { sessionId: string; filePaths: string[] }) => {
    return sessionManager.getFileDiffs(args.sessionId, args.filePaths)
  })

  ipcMain.handle(IPC.SESSION_FILE_STATUSES, async (_e, args: { sessionId: string; filePaths: string[] }) => {
    return sessionManager.getFileStatuses(args.sessionId, args.filePaths)
  })

  ipcMain.handle(IPC.SETTINGS_GET, async () => {
    return getSettings()
  })

  ipcMain.handle(IPC.SETTINGS_UPDATE, async (_e, args: { key: string; value: unknown }) => {
    updateSetting(args.key, args.value)
    return true
  })
}
