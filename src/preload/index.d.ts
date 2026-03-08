type Api = {
  createSession: (cwd: string, model?: string) => Promise<string>
  sendMessage: (sessionId: string, text: string, attachments?: unknown[]) => Promise<boolean>
  stopSession: (sessionId: string) => Promise<boolean>
  resumeSession: (sessionId: string) => Promise<{ success: boolean; title: string }>
  listSessions: () => Promise<unknown[]>
  getMessages: (sessionId: string) => Promise<unknown[]>
  deleteSession: (sessionId: string) => Promise<boolean>
  openFolder: () => Promise<string | null>
  readFileBase64: (path: string) => Promise<string>
  respondToPermission: (requestId: string, behavior: 'allow' | 'deny', message?: string) => Promise<boolean>
  respondToQuestion: (requestId: string, answers: Record<string, string>) => Promise<boolean>
  setModel: (sessionId: string, model: string) => Promise<boolean>
  setPermissionMode: (sessionId: string, mode: string) => Promise<boolean>
  getSessionInfo: (sessionId: string) => Promise<{ model: string; permissionMode: string } | null>
  getSettings: () => Promise<unknown>
  updateSettings: (key: string, value: unknown) => Promise<boolean>
  getFileDiffs: (sessionId: string, filePaths: string[]) => Promise<Array<{ filePath: string; status: string; diff: string }>>
  getFileStatuses: (sessionId: string, filePaths: string[]) => Promise<Array<{ filePath: string; status: string }>>
  onSessionMessage: (callback: (data: unknown) => void) => () => void
  onSessionStatus: (callback: (data: unknown) => void) => () => void
  onSessionPermission: (callback: (data: unknown) => void) => () => void
  onSessionQuestion: (callback: (data: unknown) => void) => () => void
  onSessionTitleUpdated: (callback: (data: unknown) => void) => () => void
}

declare global {
  interface Window {
    api: Api
  }
}

export {}
