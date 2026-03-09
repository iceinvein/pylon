type Api = {
  createSession: (cwd: string, model?: string, useWorktree?: boolean) => Promise<string>
  checkGitStatus: (path: string) => Promise<{ isGitRepo: boolean; isDirty: boolean }>
  listProjects: () => Promise<Array<{ path: string; lastUsed: number }>>
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
  getUsageStats: (period: import('../shared/types').UsagePeriod) => Promise<import('../shared/types').UsageStats>
  mergeWorktree: (sessionId: string) => Promise<import('../shared/types').WorktreeMergeResult>
  discardWorktree: (sessionId: string) => Promise<boolean>
  getWorktreeInfo: (sessionId: string) => Promise<import('../shared/types').WorktreeInfo>
  onSessionMessage: (callback: (data: unknown) => void) => () => void
  onSessionStatus: (callback: (data: unknown) => void) => () => void
  onSessionPermission: (callback: (data: unknown) => void) => () => void
  onSessionQuestion: (callback: (data: unknown) => void) => () => void
  onSessionTitleUpdated: (callback: (data: unknown) => void) => () => void
  // PR Review
  checkGhStatus: () => Promise<import('../shared/types').GhCliStatus>
  setGhPath: (path: string) => Promise<import('../shared/types').GhCliStatus>
  listGhRepos: () => Promise<import('../shared/types').GhRepo[]>
  listGhPrs: (repo: string, state?: string) => Promise<import('../shared/types').GhPullRequest[]>
  getGhPrDetail: (repo: string, number: number) => Promise<import('../shared/types').GhPrDetail>
  startGhReview: (args: {
    repo: import('../shared/types').GhRepo
    prNumber: number; prTitle: string; prUrl: string; focus: string[]
  }) => Promise<import('../shared/types').PrReview>
  stopGhReview: (reviewId: string) => Promise<boolean>
  listGhReviews: (repo?: string, prNumber?: number) => Promise<import('../shared/types').PrReview[]>
  getGhReview: (reviewId: string) => Promise<(import('../shared/types').PrReview & { findings: import('../shared/types').ReviewFinding[] }) | null>
  deleteGhReview: (reviewId: string) => Promise<boolean>
  postGhComment: (repo: string, number: number, body: string) => Promise<boolean>
  postGhReview: (repo: string, number: number, findings: import('../shared/types').ReviewFinding[], commitId: string) => Promise<boolean>
  onGhReviewUpdate: (callback: (data: unknown) => void) => () => void
}

declare global {
  interface Window {
    api: Api
  }
}

export {}
