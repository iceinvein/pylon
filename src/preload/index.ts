import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc-channels'

const api = {
  createSession: (cwd: string, model?: string) =>
    ipcRenderer.invoke(IPC.SESSION_CREATE, { cwd, model }),
  sendMessage: (sessionId: string, text: string, attachments?: unknown[]) =>
    ipcRenderer.invoke(IPC.SESSION_SEND, { sessionId, text, attachments }),
  stopSession: (sessionId: string) =>
    ipcRenderer.invoke(IPC.SESSION_STOP, { sessionId }),
  resumeSession: (sessionId: string) =>
    ipcRenderer.invoke(IPC.SESSION_RESUME, { sessionId }),
  listSessions: () =>
    ipcRenderer.invoke(IPC.SESSION_LIST),
  getMessages: (sessionId: string) =>
    ipcRenderer.invoke(IPC.SESSION_MESSAGES, { sessionId }),
  deleteSession: (sessionId: string) =>
    ipcRenderer.invoke(IPC.SESSION_DELETE, { sessionId }),
  openFolder: () =>
    ipcRenderer.invoke(IPC.FOLDER_OPEN),
  readFileBase64: (path: string) =>
    ipcRenderer.invoke(IPC.FILE_READ_BASE64, { path }),
  respondToPermission: (requestId: string, behavior: 'allow' | 'deny', message?: string) =>
    ipcRenderer.invoke(IPC.PERMISSION_RESPONSE, { requestId, behavior, message }),
  respondToQuestion: (requestId: string, answers: Record<string, string>) =>
    ipcRenderer.invoke(IPC.QUESTION_RESPONSE, { requestId, answers }),
  setModel: (sessionId: string, model: string) =>
    ipcRenderer.invoke(IPC.SESSION_SET_MODEL, { sessionId, model }),
  setPermissionMode: (sessionId: string, mode: string) =>
    ipcRenderer.invoke(IPC.SESSION_SET_PERMISSION_MODE, { sessionId, mode }),
  getSessionInfo: (sessionId: string) =>
    ipcRenderer.invoke(IPC.SESSION_GET_INFO, { sessionId }),
  getSettings: () =>
    ipcRenderer.invoke(IPC.SETTINGS_GET),
  updateSettings: (key: string, value: unknown) =>
    ipcRenderer.invoke(IPC.SETTINGS_UPDATE, { key, value }),
  getFileDiffs: (sessionId: string, filePaths: string[]) =>
    ipcRenderer.invoke(IPC.SESSION_FILE_DIFFS, { sessionId, filePaths }),
  getFileStatuses: (sessionId: string, filePaths: string[]) =>
    ipcRenderer.invoke(IPC.SESSION_FILE_STATUSES, { sessionId, filePaths }),

  onSessionMessage: (callback: (data: unknown) => void) => {
    const handler = (_event: unknown, data: unknown) => callback(data)
    ipcRenderer.on(IPC.SESSION_MESSAGE, handler)
    return () => ipcRenderer.removeListener(IPC.SESSION_MESSAGE, handler)
  },
  onSessionStatus: (callback: (data: unknown) => void) => {
    const handler = (_event: unknown, data: unknown) => callback(data)
    ipcRenderer.on(IPC.SESSION_STATUS, handler)
    return () => ipcRenderer.removeListener(IPC.SESSION_STATUS, handler)
  },
  onSessionPermission: (callback: (data: unknown) => void) => {
    const handler = (_event: unknown, data: unknown) => callback(data)
    ipcRenderer.on(IPC.SESSION_PERMISSION, handler)
    return () => ipcRenderer.removeListener(IPC.SESSION_PERMISSION, handler)
  },
  onSessionQuestion: (callback: (data: unknown) => void) => {
    const handler = (_event: unknown, data: unknown) => callback(data)
    ipcRenderer.on(IPC.SESSION_QUESTION, handler)
    return () => ipcRenderer.removeListener(IPC.SESSION_QUESTION, handler)
  },
}

contextBridge.exposeInMainWorld('api', api)
