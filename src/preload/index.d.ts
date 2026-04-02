type Api = {
  createSession: (cwd: string, model?: string, useWorktree?: boolean) => Promise<string>
  checkGitStatus: (path: string) => Promise<{ isGitRepo: boolean; isDirty: boolean }>
  listProjects: () => Promise<Array<{ path: string; lastUsed: number }>>
  addProject: (path: string) => Promise<boolean>
  removeProject: (path: string) => Promise<boolean>
  sendMessage: (
    sessionId: string,
    text: string,
    attachments?: import('../shared/types').IpcAttachment[],
  ) => Promise<boolean>
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
  setEffort: (sessionId: string, effort: string) => Promise<boolean>
  setPermissionMode: (sessionId: string, mode: string) => Promise<boolean>
  getSessionInfo: (sessionId: string) => Promise<{ model: string; permissionMode: string } | null>
  getProviderModels: () => Promise<
    Array<{
      id: string
      label: string
      provider: string
      contextWindow: number
      supportsEffort: string[]
    }>
  >
  getSettings: () => Promise<unknown>
  updateSettings: (key: string, value: unknown) => Promise<boolean>
  getSavedTabs: () => Promise<{
    version: number
    tabs: import('../shared/types').Tab[]
    activeTabId: string | null
  } | null>
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
  // Worktree Recipe
  getWorktreeRecipe: (
    projectPath: string,
  ) => Promise<import('../shared/types').WorktreeRecipe | null>
  analyzeWorktreeRecipe: (
    projectPath: string,
    model?: string,
  ) => Promise<import('../shared/types').WorktreeRecipe>
  deleteWorktreeRecipe: (projectPath: string) => Promise<boolean>
  runWorktreeSetup: (
    sessionId: string,
    projectPath: string,
    worktreePath: string,
    originalPath: string,
    stepIds?: string[],
  ) => Promise<import('../shared/types').SetupCompleteEvent>
  onWorktreeSetupProgress: (
    callback: (data: import('../shared/types').SetupProgressEvent) => void,
  ) => () => void
  onWorktreeSetupComplete: (
    callback: (data: import('../shared/types').SetupCompleteEvent) => void,
  ) => () => void
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
  // PR Polling
  markPrSeen: (repo: string, prNumber: number) => Promise<void>
  getCachedPrs: (repo?: string) => Promise<import('../shared/types').GhPullRequest[]>
  forcePollPrs: () => Promise<void>
  onPrUnseenCount: (callback: (data: { count: number }) => void) => () => void
  // PR Raise
  getRaisePrInfo: (sessionId: string) => Promise<import('../shared/types').PrRaiseInfo>
  generatePrDescription: (
    sessionId: string,
  ) => Promise<import('../shared/types').PrRaiseDescription>
  raisePr: (
    args: import('../shared/types').PrRaiseRequest,
  ) => Promise<import('../shared/types').PrRaiseResult>
  // AI Exploration Testing
  startExploration: (args: {
    cwd: string
    url: string
    goal: string
    mode: string
    requirements?: string
    e2eOutputPath: string
    e2ePathReason?: string
    projectScan?: import('../shared/types').ProjectScan
  }) => Promise<import('../shared/types').TestExploration>
  startBatch: (args: {
    cwd: string
    goals: string[]
    agentCount: number
    mode: string
    requirements?: string
    e2eOutputPath: string
    e2ePathReason?: string
    autoStartServer: boolean
    projectScan?: unknown
  }) => Promise<import('../shared/types').TestExploration[]>
  stopExploration: (explorationId: string) => Promise<boolean>
  listExplorations: (cwd: string) => Promise<import('../shared/types').TestExploration[]>
  getExploration: (explorationId: string) => Promise<
    | (import('../shared/types').TestExploration & {
        findings: import('../shared/types').TestFinding[]
      })
    | null
  >
  deleteExploration: (explorationId: string) => Promise<boolean>
  resolveE2ePath: (cwd: string) => Promise<import('../shared/types').E2ePathResolution>
  readGeneratedTest: (cwd: string, relativePath: string) => Promise<string | null>
  onExplorationUpdate: (callback: (data: unknown) => void) => () => void
  scanProject: (cwd: string) => Promise<import('../shared/types').ProjectScan>
  suggestGoals: (cwd: string) => Promise<void>
  onGoalSuggestion: (
    callback: (data: import('../shared/types').GoalSuggestionUpdate) => void,
  ) => () => void
  // Git Graph (wired in Task 7)
  gitGraphGetLog: (
    cwd: string,
    afterHash?: string,
  ) => Promise<import('../shared/git-types').GraphCommit[]>
  gitGraphGetBranches: (cwd: string) => Promise<import('../shared/git-types').BranchInfo[]>
  gitGraphCheckout: (cwd: string, branch: string) => Promise<{ success: boolean }>
  // Git Commit (wired in Task 7)
  gitCommitGetStatus: (cwd: string) => Promise<import('../shared/git-types').FileStatus[]>
  gitCommitAnalyze: (
    cwd: string,
    sessionId: string,
  ) => Promise<import('../shared/git-types').CommitPlan>
  gitCommitGenerateMsg: (cwd: string, sessionId: string) => Promise<string>
  gitCommitExecute: (
    cwd: string,
    group: import('../shared/git-types').CommitGroup,
  ) => Promise<{ success: boolean }>
  gitCommitStage: (cwd: string, paths: string[]) => Promise<void>
  gitCommitUnstage: (cwd: string, paths: string[]) => Promise<void>
  // Git Ops (wired in Task 7)
  gitOpsExecuteNl: (
    cwd: string,
    sessionId: string,
    text: string,
  ) => Promise<import('../shared/git-types').GitCommandPlan>
  gitOpsConfirm: (cwd: string, planId: string) => Promise<{ success: boolean; result?: string }>
  gitOpsGetConflicts: (cwd: string) => Promise<{ filePath: string; status: string }[]>
  gitOpsResolveConflicts: (
    cwd: string,
    sessionId: string,
  ) => Promise<import('../shared/git-types').ConflictResolution[]>
  gitOpsApplyResolution: (
    cwd: string,
    resolutions: import('../shared/git-types').ConflictResolution[],
  ) => Promise<void>
  gitOpsContinue: (cwd: string) => Promise<{ success: boolean }>
  // Git Events (wired in Task 7)
  onGitGraphUpdated: (callback: (data: unknown) => void) => () => void
  onGitOpsConflictDetected: (callback: (data: unknown) => void) => () => void
  sendLog: (level: string, source: string, message: string) => void
  // AST Visualizer
  getCachedAnalysis: (scope: string) => Promise<{
    repoGraph: unknown
    archAnalysis: unknown | null
    analyzedAt: number
  } | null>
  analyzeScope: (scope: string) => Promise<void>
  getFileAst: (filePath: string) => Promise<import('../shared/types').AstNode[]>
  explainAstNode: (
    nodeId: string,
    filePath: string,
    context: string,
  ) => Promise<{ text: string; done: boolean }>
  sendAstChat: (message: string, scope: string) => Promise<{ text: string; done: boolean }>
  onAstAnalysisProgress: (callback: (data: unknown) => void) => () => void
  onAstRepoGraph: (callback: (data: unknown) => void) => () => void
  onAstArchAnalysis: (callback: (data: unknown) => void) => () => void
  onAstExplainResult: (callback: (data: unknown) => void) => () => void
  onAstChatResult: (callback: (data: unknown) => void) => () => void
}

declare global {
  interface Window {
    api: Api
  }
}

export {}
