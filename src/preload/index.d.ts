type Api = {
  createSession: (cwd: string, model?: string) => Promise<string>
  sendMessage: (sessionId: string, text: string, attachments?: unknown[]) => Promise<boolean>
  stopSession: (sessionId: string) => Promise<boolean>
  resumeSession: (sessionId: string) => Promise<boolean>
  listSessions: () => Promise<unknown[]>
  getMessages: (sessionId: string) => Promise<unknown[]>
  deleteSession: (sessionId: string) => Promise<boolean>
  openFolder: () => Promise<string | null>
  readFileBase64: (path: string) => Promise<string>
  respondToPermission: (requestId: string, behavior: 'allow' | 'deny', message?: string) => Promise<boolean>
  getSettings: () => Promise<unknown>
  updateSettings: (key: string, value: unknown) => Promise<boolean>
  onSessionMessage: (callback: (data: unknown) => void) => () => void
  onSessionStatus: (callback: (data: unknown) => void) => () => void
  onSessionPermission: (callback: (data: unknown) => void) => () => void
}

declare global {
  interface Window {
    api: Api
  }
}

export {}
