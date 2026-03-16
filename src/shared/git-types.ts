// src/shared/git-types.ts

// ── Git Graph types ──

export type GraphRef = {
  name: string
  type: 'local-branch' | 'remote-branch' | 'tag' | 'head'
  isCurrent: boolean
}

export type GraphLine = {
  fromColumn: number
  toColumn: number
  type: 'straight' | 'merge-in' | 'fork-out'
  color: string
}

export type GraphCommit = {
  hash: string
  shortHash: string
  parents: string[]
  message: string
  author: string
  date: string
  refs: GraphRef[]
  graphColumns: number
  graphLines: GraphLine[]
}

export type BranchInfo = {
  name: string
  type: 'local' | 'remote'
  isCurrent: boolean
  upstream: string | null
  ahead: number
  behind: number
  headHash: string
}

// ── Git Commit types ──

export type FileStatus = {
  path: string
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked'
  staged: boolean
}

export type StagedFile = {
  path: string
}

export type CommitGroup = {
  title: string
  message: string
  files: StagedFile[]
  order: number
  rationale: string
}

export type CommitPlan = {
  groups: CommitGroup[]
  reasoning: string
}

// ── Git Ops types ──

export type PlannedCommand = {
  command: string
  explanation: string
}

export type GitCommandPlan = {
  id: string
  interpretation: string
  commands: PlannedCommand[]
  preview: string
  riskLevel: 'safe' | 'moderate' | 'destructive'
  warnings?: string[]
}

export type CommandEntry = {
  id: string
  request: string
  plan: GitCommandPlan | null
  status: 'pending' | 'planned' | 'confirmed' | 'executing' | 'completed' | 'failed' | 'cancelled'
  result?: string
  error?: string
  timestamp: number
}

export type ConflictResolution = {
  filePath: string
  originalContent: string
  resolvedContent: string
  explanation: string
  confidence: 'high' | 'medium' | 'low'
}
