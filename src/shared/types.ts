export type SessionStatus = 'empty' | 'starting' | 'running' | 'waiting' | 'done' | 'error'

export type Session = {
  id: string
  cwd: string
  sdkSessionId: string | null
  status: SessionStatus
  model: string
  title: string
  cost: SessionCost
  createdAt: number
  updatedAt: number
}

export type SessionCost = {
  inputTokens: number
  outputTokens: number
  totalUsd: number
}

export type Tab = {
  id: string
  sessionId: string | null
  cwd: string
  label: string
  useWorktree?: boolean
}

export type SerializedMessage = {
  id: string
  sessionId: string
  timestamp: number
  sdkMessage: string
}

export type ImageAttachment = {
  type: 'image'
  name: string
  mediaType: string
  base64: string
  previewUrl: string
}

export type FileAttachment = {
  type: 'file'
  name: string
  path: string
  size: number
  content?: string
}

export type Attachment = ImageAttachment | FileAttachment

export type PermissionRequest = {
  requestId: string
  sessionId: string
  toolName: string
  input: Record<string, unknown>
  suggestions?: Array<{ type: string; pattern: string }>
}

export type PermissionResponse = {
  requestId: string
  behavior: 'allow' | 'deny'
  message?: string
  alwaysAllow?: boolean
}

export type QuestionOption = {
  label: string
  description: string
  preview?: string
}

export type QuestionItem = {
  question: string
  header: string
  options: QuestionOption[]
  multiSelect?: boolean
}

export type QuestionRequest = {
  requestId: string
  sessionId: string
  questions: QuestionItem[]
}

export type QuestionResponse = {
  requestId: string
  answers: Record<string, string>
}

export type PermissionMode = 'default' | 'auto-approve'

export type AppSettings = {
  defaultModel: string
  defaultPermissionMode: PermissionMode
  theme: 'dark'
}

export type GitRepoStatus = {
  isGitRepo: boolean
  isDirty: boolean
}

export type FileDiff = {
  filePath: string
  status: 'modified' | 'added' | 'deleted' | 'renamed'
  diff: string
}

export type WorktreeMergeResult = {
  success: boolean
  error?: 'conflicts' | 'not-a-worktree' | 'branch-not-found' | 'uncommitted-changes' | string
  conflictFiles?: string[]
}

export type WorktreeInfo = {
  worktreePath: string | null
  worktreeBranch: string | null
  originalBranch: string | null
}

export type UsagePeriod = '7d' | '30d' | '90d' | 'all'

export type UsageStats = {
  summary: {
    totalCost: number
    sessionCount: number
    avgCostPerSession: number
    totalInput: number
    totalOutput: number
  }
  dailyCosts: Array<{ day: string; cost: number }>
  costByModel: Array<{ model: string; cost: number; sessions: number }>
  costByProject: Array<{ project: string; cost: number; sessions: number; inputTokens: number; outputTokens: number }>
  tokensByDay: Array<{ day: string; input: number; output: number }>
  topSessions: Array<{
    id: string
    title: string
    model: string
    cost: number
    inputTokens: number
    outputTokens: number
    createdAt: number
  }>
}

// ── PR Review ──────────────────────────────────

export type GhCliStatus = {
  available: boolean
  authenticated: boolean
  binaryPath: string | null
  username: string | null
  error: string | null
}

export type GhRepo = {
  owner: string
  repo: string
  fullName: string
  projectPath: string
}

export type GhPullRequest = {
  number: number
  title: string
  author: string
  state: 'open' | 'closed' | 'merged'
  createdAt: string
  updatedAt: string
  headBranch: string
  baseBranch: string
  additions: number
  deletions: number
  reviewDecision: string | null
  isDraft: boolean
  url: string
  repo: GhRepo
}

export type GhPrDetail = GhPullRequest & {
  body: string
  files: Array<{ path: string; additions: number; deletions: number }>
  diff: string
}

export type ReviewFinding = {
  id: string
  file: string
  line: number | null
  severity: 'critical' | 'warning' | 'suggestion' | 'nitpick'
  title: string
  description: string
  domain: ReviewFocus | null
  posted: boolean
}

export type ReviewFocus = 'security' | 'bugs' | 'performance' | 'style' | 'architecture' | 'ux'

export type ReviewStatus = 'pending' | 'running' | 'done' | 'error'

export type PrReview = {
  id: string
  prNumber: number
  repo: GhRepo
  prTitle: string
  prUrl: string
  status: ReviewStatus
  focus: ReviewFocus[]
  findings: ReviewFinding[]
  sessionId: string | null
  startedAt: number
  completedAt: number | null
  createdAt: number
}

export type ReviewAgentConfig = {
  id: ReviewFocus
  name: string
  prompt: string
}

export type ReviewAgentProgress = {
  agentId: ReviewFocus
  status: 'pending' | 'running' | 'done' | 'error'
  findingsCount: number
  error?: string
  /** Current chunk being reviewed (1-indexed), undefined if single-chunk */
  currentChunk?: number
  /** Total chunks for this agent, undefined if single-chunk */
  totalChunks?: number
}

// ── Plan Review ──────────────────────────────

export type PlanReviewStatus = 'pending' | 'approved' | 'changes_requested'

export type PlanComment = {
  sectionIndex: number
  sectionTitle: string
  comment: string
}

export type DetectedPlan = {
  filePath: string
  relativePath: string
  toolUseId: string
  status: PlanReviewStatus
  comments: PlanComment[]
}

export type PlanSection = {
  level: number
  title: string
  body: string
  children?: PlanSection[]
}
