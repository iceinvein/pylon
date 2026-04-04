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
  contextWindow: number
  contextInputTokens: number
  maxOutputTokens: number
}

/**
 * Shape of a raw SDK message as received from the Claude/Codex provider
 * and stored in the renderer's Zustand message store.
 *
 * Uses an index signature because SDK messages carry many provider-specific
 * fields that vary by message type. The typed fields here are the ones the
 * renderer actively reads.
 */
export type SdkMessage = {
  type: string
  role?: string
  subtype?: string
  content?: unknown
  parent_tool_use_id?: string | null
  session_id?: string
  is_error?: boolean
  error?: string
  total_cost_usd?: number
  duration_ms?: number
  message?: {
    content?: Array<{ type: string; [key: string]: unknown }>
    [key: string]: unknown
  }
  [key: string]: unknown
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

export type IpcAttachment =
  | {
      type: 'image'
      content: string
      mediaType: string
      name?: string
    }
  | {
      type: 'file'
      content: string
      name?: string
    }

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

/**
 * Permission/approval mode union across all providers.
 *
 * Claude modes:   'default' (ask each tool) | 'auto-approve' (skip permission prompts)
 * Codex modes:    'never' | 'on-request' | 'on-failure' | 'untrusted'
 *
 * The renderer shows the appropriate subset based on the selected model's provider.
 */
export type PermissionMode =
  | 'default'
  | 'auto-approve'
  | 'never'
  | 'on-request'
  | 'on-failure'
  | 'untrusted'

export type EffortLevel = 'low' | 'medium' | 'high' | 'max'

export type AppSettings = {
  defaultModel: string
  defaultPermissionMode: PermissionMode
  theme: 'dark'
}

export type GitRepoStatus = {
  isGitRepo: boolean
  isDirty: boolean
}

export type GitBranchStatus = {
  branch: string | null
  ahead: number
  behind: number
  hasUpstream: boolean
  isGitRepo: boolean
}

export type GitFetchCompareCommit = {
  hash: string
  message: string
}

export type GitFetchComparison = {
  branch: string
  ahead: number
  behind: number
  aheadCommits: GitFetchCompareCommit[]
  behindCommits: GitFetchCompareCommit[]
  filesChanged: number
}

export type GitPullResult = {
  success: boolean
  error?: string
}

export type FileDiff = {
  filePath: string
  status: 'modified' | 'added' | 'deleted' | 'renamed'
  diff: string
}

// ── Session Init Info (from SDK init system message) ──

export type SessionPlugin = {
  name: string
  path: string
}

export type SessionMcpServer = {
  name: string
  status: string
}

export type SessionSlashCommand = {
  name: string
  description: string
  argumentHint: string
}

export type SessionInitInfo = {
  tools: string[]
  skills: string[]
  slashCommands: string[]
  plugins: SessionPlugin[]
  mcpServers: SessionMcpServer[]
  model: string
  permissionMode: string
  claudeCodeVersion: string
}

// ── Plugin Management ──────────────────────────

export type InstalledPlugin = {
  /** Plugin ID in format "name@marketplace" */
  id: string
  /** Plugin name (without marketplace) */
  name: string
  /** Marketplace ID */
  marketplace: string
  /** Whether enabled in user settings */
  enabled: boolean
  /** Install scope: user-wide or project-specific */
  scope: 'user' | 'project'
  /** Project path for project-scoped plugins */
  projectPath?: string
  /** Installed version */
  version: string
  /** When the plugin was installed */
  installedAt: string
  /** When the plugin was last updated */
  lastUpdated: string
}

export type PluginMarketplace = {
  id: string
  source: { source: string; repo?: string; url?: string }
  lastUpdated: string
}

export type PluginManagementData = {
  plugins: InstalledPlugin[]
  marketplaces: PluginMarketplace[]
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
  costByProject: Array<{
    project: string
    cost: number
    sessions: number
    inputTokens: number
    outputTokens: number
  }>
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
  mergedFrom?: { domain: string; title: string }[]
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
  costUsd: number
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

// ── PR Raise ──────────────────────────────────

export type PrRaiseFileInfo = {
  path: string
  status: string
  insertions: number
  deletions: number
}

export type PrRaiseCommitInfo = {
  hash: string
  message: string
  timestamp: string
}

export type PrRaiseInfo = {
  diff: string
  files: PrRaiseFileInfo[]
  commits: PrRaiseCommitInfo[]
  stats: { insertions: number; deletions: number; filesChanged: number }
  headBranch: string
  baseBranch: string
  remote: string
  repoFullName: string
}

export type PrRaiseDescription = {
  title: string
  body: string
}

export type PrRaiseRequest = {
  sessionId: string
  title: string
  body: string
  baseBranch: string
  squash: boolean
}

export type PrRaiseResult = {
  success: boolean
  prUrl?: string
  prNumber?: number
  error?: string
}

// -- AI Exploration Testing --

export type ExplorationMode = 'manual' | 'requirements'
export type ExplorationStatus = 'pending' | 'running' | 'done' | 'stopped' | 'error'
export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info'

export type E2ePathResolution = {
  path: string
  reason: string
}

export type PortOverrideMethod = { type: 'env' } | { type: 'cli-flag'; flag: string }

export type TestExploration = {
  id: string
  batchId: string | null
  cwd: string
  url: string
  goal: string
  mode: ExplorationMode
  requirements: string | null
  e2eOutputPath: string
  e2ePathReason: string | null
  status: ExplorationStatus
  errorMessage: string | null
  findingsCount: number
  testsGenerated: number
  generatedTestPaths: string[]
  inputTokens: number
  outputTokens: number
  totalCostUsd: number
  startedAt: number | null
  completedAt: number | null
  createdAt: number
}

export type TestFinding = {
  id: string
  explorationId: string
  title: string
  description: string
  severity: FindingSeverity
  url: string
  screenshotPath: string | null
  reproductionSteps: string[]
  createdAt: number
}

export type ExplorationAgentMessage =
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; toolUseId: string; content: string }
  | { type: 'text'; text: string }
  | { type: 'thinking'; text: string }

export type ExplorationUpdate = {
  explorationId: string
  status: ExplorationStatus
  findings?: TestFinding[]
  generatedTests?: string[]
  streamingText?: string
  agentMessages?: ExplorationAgentMessage[]
  findingsCount?: number
  testsGenerated?: number
  error?: string
  inputTokens?: number
  outputTokens?: number
  totalCostUsd?: number
}

export type ProjectScan = {
  framework: string | null
  devCommand: string | null
  detectedPort: number | null
  detectedUrl: string | null
  packageManager: string | null
  portOverrideMethod: PortOverrideMethod | null
  serverRunning: boolean
  routeFiles: string[]
  hasPlaywrightConfig: boolean
  docsFiles: string[]
  error: string | null
}

export type SuggestedGoal = {
  id: string
  title: string
  description: string
  area?: string
  selected: boolean
}

export type GoalSuggestionUpdate = {
  cwd: string
  goals: Array<{ id: string; title: string; description: string; area?: string }>
  status: 'loading' | 'done' | 'error'
  error?: string
}

// ── AST Visualizer Types ──

export type AstNodeType =
  | 'function'
  | 'class'
  | 'type'
  | 'variable'
  | 'import'
  | 'export'
  | 'block'
  | 'statement'
  | 'expression'
  | 'parameter'
  | 'other'

export type AstNode = {
  id: string
  type: AstNodeType
  name: string
  startLine: number
  endLine: number
  children: AstNode[]
  filePath: string
}

export type FileNode = {
  filePath: string
  language: string
  declarations: AstNode[]
  imports: ImportEdge[]
  size: number
  lastModified: number
}

export type ImportEdge = {
  source: string
  target: string
  specifiers: string[]
}

export type RepoGraph = {
  files: FileNode[]
  edges: ImportEdge[]
}

export type ArchLayer = {
  id: string
  name: string
  color: string
  pattern: string
}

export type ModuleCluster = {
  id: string
  name: string
  description: string
  files: string[]
  layerId: string
}

export type CallEdge = {
  caller: { filePath: string; symbolName: string }
  callee: { filePath: string; symbolName: string }
}

export type DataFlowStep = {
  filePath: string
  symbolName: string
  direction: 'in' | 'out' | 'transform'
}

export type DataFlow = {
  id: string
  name: string
  description: string
  steps: DataFlowStep[]
}

export type ArchAnalysis = {
  layers: ArchLayer[]
  clusters: ModuleCluster[]
  annotations: Record<string, string>
  callEdges: CallEdge[]
  dataFlows: DataFlow[]
}

export type AstOverlay = 'deps' | 'calls' | 'dataflow'

export type AstChatMessage = {
  role: 'user' | 'assistant'
  content: string
  highlights?: Array<{ filePath: string; symbolName: string }>
}

// ── Worktree Recipe Types ────────────────────────

export type RecipeStepType = 'install' | 'copy' | 'symlink' | 'run'

export type RecipeStep = {
  id: string
  type: RecipeStepType
  label: string
  command?: string
  source?: string
  destination?: string
  glob?: string
  optional?: boolean
}

export type WorktreeRecipe = {
  id: string
  projectPath: string
  createdAt: number
  updatedAt: number
  version: number
  steps: RecipeStep[]
}

export type SetupProgressEvent = {
  sessionId: string
  stepId: string
  stepLabel: string
  status: 'running' | 'done' | 'failed'
  error?: string
  current: number
  total: number
}

export type SetupCompleteEvent = {
  sessionId: string
  success: boolean
  results: Array<{
    stepId: string
    label: string
    status: 'done' | 'failed'
    error?: string
  }>
}
