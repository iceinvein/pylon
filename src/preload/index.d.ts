type Api = {
  createSession: (cwd: string, model?: string, useWorktree?: boolean) => Promise<string>
  checkGitStatus: (path: string) => Promise<{ isGitRepo: boolean; isDirty: boolean }>
  listProjects: () => Promise<Array<{ path: string; lastUsed: number }>>
  sendMessage: (sessionId: string, text: string, attachments?: unknown[]) => Promise<boolean>
  stopSession: (sessionId: string) => Promise<boolean>
  resumeSession: (sessionId: string) => Promise<{ success: boolean; title: string; status: string }>
  listSessions: () => Promise<unknown[]>
  getMessages: (sessionId: string) => Promise<unknown[]>
  deleteSession: (sessionId: string) => Promise<boolean>
  openFolder: () => Promise<string | null>
  readFileBase64: (path: string) => Promise<string>
  readPlanFile: (path: string) => Promise<string>
  respondToPermission: (
    requestId: string,
    behavior: 'allow' | 'deny',
    message?: string,
  ) => Promise<boolean>
  respondToQuestion: (requestId: string, answers: Record<string, string>) => Promise<boolean>
  setModel: (sessionId: string, model: string) => Promise<boolean>
  setPermissionMode: (sessionId: string, mode: string) => Promise<boolean>
  getSessionInfo: (sessionId: string) => Promise<{ model: string; permissionMode: string } | null>
  getSettings: () => Promise<unknown>
  updateSettings: (key: string, value: unknown) => Promise<boolean>
  getFileDiffs: (
    sessionId: string,
    filePaths: string[],
  ) => Promise<Array<{ filePath: string; status: string; diff: string }>>
  getFileStatuses: (
    sessionId: string,
    filePaths: string[],
  ) => Promise<Array<{ filePath: string; status: string }>>
  getUsageStats: (
    period: import('../shared/types').UsagePeriod,
  ) => Promise<import('../shared/types').UsageStats>
  mergeWorktree: (sessionId: string) => Promise<import('../shared/types').WorktreeMergeResult>
  discardWorktree: (sessionId: string) => Promise<boolean>
  getWorktreeInfo: (sessionId: string) => Promise<import('../shared/types').WorktreeInfo>
  getWorktreeUsage: () => Promise<{ count: number; sizeBytes: number }>
  cleanupAllWorktrees: () => Promise<{ removed: number; freedBytes: number }>
  // Git Branch Status
  getGitBranchStatus: (cwd: string) => Promise<import('../shared/types').GitBranchStatus>
  fetchAndCompare: (cwd: string) => Promise<import('../shared/types').GitFetchComparison>
  pullBranch: (cwd: string) => Promise<import('../shared/types').GitPullResult>
  watchGitCwd: (cwd: string) => Promise<boolean>
  onGitStatusChanged: (
    callback: (data: { cwd: string; status: import('../shared/types').GitBranchStatus }) => void,
  ) => () => void
  // Plugins
  listPlugins: () => Promise<import('../shared/types').PluginManagementData>
  togglePlugin: (pluginId: string, enabled: boolean) => Promise<boolean>

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
    prNumber: number
    prTitle: string
    prUrl: string
    focus: string[]
  }) => Promise<import('../shared/types').PrReview>
  stopGhReview: (reviewId: string) => Promise<boolean>
  listGhReviews: (repo?: string, prNumber?: number) => Promise<import('../shared/types').PrReview[]>
  getGhReview: (
    reviewId: string,
  ) => Promise<
    | (import('../shared/types').PrReview & { findings: import('../shared/types').ReviewFinding[] })
    | null
  >
  deleteGhReview: (reviewId: string) => Promise<boolean>
  saveGhFindings: (
    reviewId: string,
    findings: import('../shared/types').ReviewFinding[],
  ) => Promise<boolean>
  postGhComment: (repo: string, number: number, body: string) => Promise<boolean>
  postGhReview: (
    repo: string,
    number: number,
    findings: import('../shared/types').ReviewFinding[],
    commitId: string,
  ) => Promise<boolean>
  getAgentPrompts(): Promise<Array<{ id: string; name: string; prompt: string; isCustom: boolean }>>
  resetAgentPrompt(focus: string): Promise<boolean>
  onGhReviewUpdate: (callback: (data: unknown) => void) => () => void
  // PR Raise
  getRaisePrInfo: (sessionId: string) => Promise<import('../shared/types').PrRaiseInfo>
  generatePrDescription: (
    sessionId: string,
  ) => Promise<import('../shared/types').PrRaiseDescription>
  raisePr: (
    args: import('../shared/types').PrRaiseRequest,
  ) => Promise<import('../shared/types').PrRaiseResult>
  sendLog: (level: string, source: string, message: string) => void
}

declare global {
  interface Window {
    api: Api
  }
}

export {}
