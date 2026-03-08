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
