import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc-channels'

const api = {
  createSession: (cwd: string, model?: string, useWorktree?: boolean) =>
    ipcRenderer.invoke(IPC.SESSION_CREATE, { cwd, model, useWorktree }),
  sendMessage: (sessionId: string, text: string, attachments?: unknown[]) =>
    ipcRenderer.invoke(IPC.SESSION_SEND, { sessionId, text, attachments }),
  stopSession: (sessionId: string) => ipcRenderer.invoke(IPC.SESSION_STOP, { sessionId }),
  resumeSession: (sessionId: string) => ipcRenderer.invoke(IPC.SESSION_RESUME, { sessionId }),
  listSessions: () => ipcRenderer.invoke(IPC.SESSION_LIST),
  getMessages: (sessionId: string) => ipcRenderer.invoke(IPC.SESSION_MESSAGES, { sessionId }),
  deleteSession: (sessionId: string) => ipcRenderer.invoke(IPC.SESSION_DELETE, { sessionId }),
  openFolder: () => ipcRenderer.invoke(IPC.FOLDER_OPEN),
  checkGitStatus: (path: string) => ipcRenderer.invoke(IPC.FOLDER_CHECK_GIT_STATUS, { path }),
  listProjects: () => ipcRenderer.invoke(IPC.FOLDER_LIST_PROJECTS),
  readFileBase64: (path: string) => ipcRenderer.invoke(IPC.FILE_READ_BASE64, { path }),
  readPlanFile: (path: string) => ipcRenderer.invoke(IPC.FILE_READ_PLAN, { path }),
  respondToPermission: (requestId: string, behavior: 'allow' | 'deny', message?: string) =>
    ipcRenderer.invoke(IPC.PERMISSION_RESPONSE, { requestId, behavior, message }),
  respondToQuestion: (requestId: string, answers: Record<string, string>) =>
    ipcRenderer.invoke(IPC.QUESTION_RESPONSE, { requestId, answers }),
  setModel: (sessionId: string, model: string) =>
    ipcRenderer.invoke(IPC.SESSION_SET_MODEL, { sessionId, model }),
  setEffort: (sessionId: string, effort: string) =>
    ipcRenderer.invoke(IPC.SESSION_SET_EFFORT, { sessionId, effort }),
  setPermissionMode: (sessionId: string, mode: string) =>
    ipcRenderer.invoke(IPC.SESSION_SET_PERMISSION_MODE, { sessionId, mode }),
  getSessionInfo: (sessionId: string) => ipcRenderer.invoke(IPC.SESSION_GET_INFO, { sessionId }),
  getSettings: () => ipcRenderer.invoke(IPC.SETTINGS_GET),
  updateSettings: (key: string, value: unknown) =>
    ipcRenderer.invoke(IPC.SETTINGS_UPDATE, { key, value }),
  getSavedTabs: () => ipcRenderer.invoke(IPC.TABS_GET),
  getFileDiffs: (sessionId: string, filePaths: string[]) =>
    ipcRenderer.invoke(IPC.SESSION_FILE_DIFFS, { sessionId, filePaths }),
  getFileStatuses: (sessionId: string, filePaths: string[]) =>
    ipcRenderer.invoke(IPC.SESSION_FILE_STATUSES, { sessionId, filePaths }),
  getUsageStats: (period: string) => ipcRenderer.invoke(IPC.USAGE_STATS, { period }),
  mergeWorktree: (sessionId: string) =>
    ipcRenderer.invoke(IPC.WORKTREE_MERGE_CLEANUP, { sessionId }),
  discardWorktree: (sessionId: string) =>
    ipcRenderer.invoke(IPC.WORKTREE_DISCARD_CLEANUP, { sessionId }),
  getWorktreeInfo: (sessionId: string) => ipcRenderer.invoke(IPC.WORKTREE_INFO, { sessionId }),
  getWorktreeUsage: () => ipcRenderer.invoke(IPC.WORKTREE_GET_USAGE),
  cleanupAllWorktrees: () => ipcRenderer.invoke(IPC.WORKTREE_CLEANUP_ALL),

  // Git Branch Status
  getGitBranchStatus: (cwd: string) => ipcRenderer.invoke(IPC.GIT_BRANCH_STATUS, { cwd }),
  fetchAndCompare: (cwd: string) => ipcRenderer.invoke(IPC.GIT_FETCH_COMPARE, { cwd }),
  pullBranch: (cwd: string) => ipcRenderer.invoke(IPC.GIT_PULL, { cwd }),
  watchGitCwd: (cwd: string) => ipcRenderer.invoke(IPC.GIT_WATCH, { cwd }),
  onGitStatusChanged: (callback: (data: unknown) => void) => {
    const handler = (_event: unknown, data: unknown) => callback(data)
    ipcRenderer.on(IPC.GIT_STATUS_CHANGED, handler)
    return () => ipcRenderer.removeListener(IPC.GIT_STATUS_CHANGED, handler)
  },

  // Git Graph
  gitGraphGetLog: (cwd: string, afterHash?: string) =>
    ipcRenderer.invoke(IPC.GIT_GRAPH_GET_LOG, { cwd, afterHash }),
  gitGraphGetBranches: (cwd: string) => ipcRenderer.invoke(IPC.GIT_GRAPH_GET_BRANCHES, { cwd }),
  gitGraphCheckout: (cwd: string, branch: string) =>
    ipcRenderer.invoke(IPC.GIT_GRAPH_CHECKOUT, { cwd, branch }),

  // Git Commit
  gitCommitGetStatus: (cwd: string) => ipcRenderer.invoke(IPC.GIT_COMMIT_GET_STATUS, { cwd }),
  gitCommitAnalyze: (cwd: string, sessionId: string) =>
    ipcRenderer.invoke(IPC.GIT_COMMIT_ANALYZE, { cwd, sessionId }),
  gitCommitGenerateMsg: (cwd: string, sessionId: string) =>
    ipcRenderer.invoke(IPC.GIT_COMMIT_GENERATE_MSG, { cwd, sessionId }),
  gitCommitExecute: (cwd: string, group: unknown) =>
    ipcRenderer.invoke(IPC.GIT_COMMIT_EXECUTE, { cwd, group }),
  gitCommitStage: (cwd: string, paths: string[]) =>
    ipcRenderer.invoke(IPC.GIT_COMMIT_STAGE, { cwd, paths }),
  gitCommitUnstage: (cwd: string, paths: string[]) =>
    ipcRenderer.invoke(IPC.GIT_COMMIT_UNSTAGE, { cwd, paths }),

  // Git Ops
  gitOpsExecuteNl: (cwd: string, sessionId: string, text: string) =>
    ipcRenderer.invoke(IPC.GIT_OPS_EXECUTE_NL, { cwd, sessionId, text }),
  gitOpsConfirm: (cwd: string, planId: string) =>
    ipcRenderer.invoke(IPC.GIT_OPS_CONFIRM, { cwd, planId }),
  gitOpsGetConflicts: (cwd: string) => ipcRenderer.invoke(IPC.GIT_OPS_GET_CONFLICTS, { cwd }),
  gitOpsResolveConflicts: (cwd: string, sessionId: string) =>
    ipcRenderer.invoke(IPC.GIT_OPS_RESOLVE_CONFLICTS, { cwd, sessionId }),
  gitOpsApplyResolution: (cwd: string, resolutions: unknown[]) =>
    ipcRenderer.invoke(IPC.GIT_OPS_APPLY_RESOLUTION, { cwd, resolutions }),
  gitOpsContinue: (cwd: string) => ipcRenderer.invoke(IPC.GIT_OPS_CONTINUE, { cwd }),

  // Git Events (main → renderer)
  onGitGraphUpdated: (callback: (data: unknown) => void) => {
    const handler = (_event: unknown, data: unknown) => callback(data)
    ipcRenderer.on(IPC.GIT_GRAPH_UPDATED, handler)
    return () => ipcRenderer.removeListener(IPC.GIT_GRAPH_UPDATED, handler)
  },
  onGitOpsConflictDetected: (callback: (data: unknown) => void) => {
    const handler = (_event: unknown, data: unknown) => callback(data)
    ipcRenderer.on(IPC.GIT_OPS_CONFLICT_DETECTED, handler)
    return () => ipcRenderer.removeListener(IPC.GIT_OPS_CONFLICT_DETECTED, handler)
  },

  // PR Review
  checkGhStatus: () => ipcRenderer.invoke(IPC.GH_CHECK_STATUS),
  setGhPath: (path: string) => ipcRenderer.invoke(IPC.GH_SET_PATH, { path }),
  listGhRepos: () => ipcRenderer.invoke(IPC.GH_LIST_REPOS),
  listGhPrs: (repo: string, state?: string) => ipcRenderer.invoke(IPC.GH_LIST_PRS, { repo, state }),
  getGhPrDetail: (repo: string, number: number) =>
    ipcRenderer.invoke(IPC.GH_PR_DETAIL, { repo, number }),
  startGhReview: (args: {
    repo: { owner: string; repo: string; fullName: string; projectPath: string }
    prNumber: number
    prTitle: string
    prUrl: string
    focus: string[]
  }) => ipcRenderer.invoke(IPC.GH_START_REVIEW, args),
  stopGhReview: (reviewId: string) => ipcRenderer.invoke(IPC.GH_STOP_REVIEW, { reviewId }),
  listGhReviews: (repo?: string, prNumber?: number) =>
    ipcRenderer.invoke(IPC.GH_LIST_REVIEWS, { repo, prNumber }),
  getGhReview: (reviewId: string) => ipcRenderer.invoke(IPC.GH_GET_REVIEW, { reviewId }),
  deleteGhReview: (reviewId: string) => ipcRenderer.invoke(IPC.GH_DELETE_REVIEW, { reviewId }),
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

  // PR Polling
  markPrSeen: (repo: string, prNumber: number) =>
    ipcRenderer.invoke(IPC.PR_POLL_MARK_SEEN, { repo, prNumber }),
  getCachedPrs: (repo?: string) =>
    ipcRenderer.invoke(IPC.PR_POLL_GET_CACHED, { repo }),
  forcePollPrs: () => ipcRenderer.invoke(IPC.PR_POLL_FORCE),
  onPrUnseenCount: (callback: (data: { count: number }) => void) => {
    const handler = (_event: unknown, data: { count: number }) => callback(data)
    ipcRenderer.on(IPC.PR_POLL_UNSEEN_COUNT, handler)
    return () => ipcRenderer.removeListener(IPC.PR_POLL_UNSEEN_COUNT, handler)
  },

  // PR Raise
  getRaisePrInfo: (sessionId: string) => ipcRenderer.invoke(IPC.GH_RAISE_PR_INFO, { sessionId }),
  generatePrDescription: (sessionId: string) =>
    ipcRenderer.invoke(IPC.GH_RAISE_PR_GENERATE_DESCRIPTION, { sessionId }),
  raisePr: (args: {
    sessionId: string
    title: string
    body: string
    baseBranch: string
    squash: boolean
  }) => ipcRenderer.invoke(IPC.GH_RAISE_PR_CREATE, args),

  // AI Exploration Testing
  startExploration: (args: {
    cwd: string
    url: string
    goal: string
    mode: string
    requirements?: string
    e2eOutputPath: string
    e2ePathReason?: string
  }) => ipcRenderer.invoke(IPC.TEST_START_EXPLORATION, args),
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
  }) => ipcRenderer.invoke(IPC.TEST_START_BATCH, args),
  stopExploration: (explorationId: string) =>
    ipcRenderer.invoke(IPC.TEST_STOP_EXPLORATION, { explorationId }),
  listExplorations: (cwd: string) => ipcRenderer.invoke(IPC.TEST_LIST_EXPLORATIONS, { cwd }),
  getExploration: (explorationId: string) =>
    ipcRenderer.invoke(IPC.TEST_GET_EXPLORATION, { explorationId }),
  deleteExploration: (explorationId: string) =>
    ipcRenderer.invoke(IPC.TEST_DELETE_EXPLORATION, { explorationId }),
  resolveE2ePath: (cwd: string) => ipcRenderer.invoke(IPC.TEST_RESOLVE_E2E_PATH, { cwd }),
  readGeneratedTest: (cwd: string, relativePath: string) =>
    ipcRenderer.invoke(IPC.TEST_READ_GENERATED_TEST, { cwd, relativePath }),
  onExplorationUpdate: (callback: (data: unknown) => void) => {
    const handler = (_event: unknown, data: unknown) => callback(data)
    ipcRenderer.on(IPC.TEST_EXPLORATION_UPDATE, handler)
    return () => ipcRenderer.removeListener(IPC.TEST_EXPLORATION_UPDATE, handler)
  },
  scanProject: (cwd: string) => ipcRenderer.invoke(IPC.TEST_SCAN_PROJECT, { cwd }),
  suggestGoals: (cwd: string) => ipcRenderer.invoke(IPC.TEST_SUGGEST_GOALS, { cwd }),
  onGoalSuggestion: (callback: (data: unknown) => void) => {
    const handler = (_event: unknown, data: unknown) => callback(data)
    ipcRenderer.on(IPC.TEST_GOAL_SUGGESTION, handler)
    return () => ipcRenderer.removeListener(IPC.TEST_GOAL_SUGGESTION, handler)
  },

  // Plugins
  listPlugins: () => ipcRenderer.invoke(IPC.PLUGINS_LIST),
  togglePlugin: (pluginId: string, enabled: boolean) =>
    ipcRenderer.invoke(IPC.PLUGINS_TOGGLE, { pluginId, enabled }),

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
