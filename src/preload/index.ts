import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc-channels'

const api = {
  createSession: (cwd: string, model?: string, useWorktree?: boolean) =>
    ipcRenderer.invoke(IPC.SESSION_CREATE, { cwd, model, useWorktree }),
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
  checkGitStatus: (path: string) =>
    ipcRenderer.invoke(IPC.FOLDER_CHECK_GIT_STATUS, { path }),
  listProjects: () =>
    ipcRenderer.invoke(IPC.FOLDER_LIST_PROJECTS),
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
  getUsageStats: (period: string) =>
    ipcRenderer.invoke(IPC.USAGE_STATS, { period }),
  mergeWorktree: (sessionId: string) =>
    ipcRenderer.invoke(IPC.WORKTREE_MERGE_CLEANUP, { sessionId }),
  discardWorktree: (sessionId: string) =>
    ipcRenderer.invoke(IPC.WORKTREE_DISCARD_CLEANUP, { sessionId }),
  getWorktreeInfo: (sessionId: string) =>
    ipcRenderer.invoke(IPC.WORKTREE_INFO, { sessionId }),

  // PR Review
  checkGhStatus: () =>
    ipcRenderer.invoke(IPC.GH_CHECK_STATUS),
  setGhPath: (path: string) =>
    ipcRenderer.invoke(IPC.GH_SET_PATH, { path }),
  listGhRepos: () =>
    ipcRenderer.invoke(IPC.GH_LIST_REPOS),
  listGhPrs: (repo: string, state?: string) =>
    ipcRenderer.invoke(IPC.GH_LIST_PRS, { repo, state }),
  getGhPrDetail: (repo: string, number: number) =>
    ipcRenderer.invoke(IPC.GH_PR_DETAIL, { repo, number }),
  startGhReview: (args: {
    repo: { owner: string; repo: string; fullName: string; projectPath: string }
    prNumber: number; prTitle: string; prUrl: string; focus: string[]
  }) =>
    ipcRenderer.invoke(IPC.GH_START_REVIEW, args),
  stopGhReview: (reviewId: string) =>
    ipcRenderer.invoke(IPC.GH_STOP_REVIEW, { reviewId }),
  listGhReviews: (repo?: string, prNumber?: number) =>
    ipcRenderer.invoke(IPC.GH_LIST_REVIEWS, { repo, prNumber }),
  getGhReview: (reviewId: string) =>
    ipcRenderer.invoke(IPC.GH_GET_REVIEW, { reviewId }),
  deleteGhReview: (reviewId: string) =>
    ipcRenderer.invoke(IPC.GH_DELETE_REVIEW, { reviewId }),
  saveGhFindings: (reviewId: string, findings: unknown[]) =>
    ipcRenderer.invoke(IPC.GH_SAVE_FINDINGS, { reviewId, findings }),
  postGhComment: (repo: string, number: number, body: string) =>
    ipcRenderer.invoke(IPC.GH_POST_COMMENT, { repo, number, body }),
  postGhReview: (repo: string, number: number, findings: unknown[], commitId: string) =>
    ipcRenderer.invoke(IPC.GH_POST_REVIEW, { repo, number, findings, commitId }),
  getAgentPrompts: () => ipcRenderer.invoke(IPC.GH_GET_AGENT_PROMPTS),
  resetAgentPrompt: (focus: string) => ipcRenderer.invoke(IPC.GH_RESET_AGENT_PROMPT, { focus }),
  onGhReviewUpdate: (callback: (data: unknown) => void) => {
    const handler = (_event: unknown, data: unknown) => callback(data)
    ipcRenderer.on(IPC.GH_REVIEW_UPDATE, handler)
    return () => ipcRenderer.removeListener(IPC.GH_REVIEW_UPDATE, handler)
  },

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
  onSessionTitleUpdated: (callback: (data: unknown) => void) => {
    const handler = (_event: unknown, data: unknown) => callback(data)
    ipcRenderer.on(IPC.SESSION_TITLE_UPDATED, handler)
    return () => ipcRenderer.removeListener(IPC.SESSION_TITLE_UPDATED, handler)
  },

  // Logging
  sendLog: (level: string, source: string, message: string) =>
    ipcRenderer.send(IPC.LOG_FROM_RENDERER, { level, source, message }),
}

contextBridge.exposeInMainWorld('api', api)
