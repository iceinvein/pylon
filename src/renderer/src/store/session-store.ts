import { create } from 'zustand'
import type {
  DetectedPlan,
  GitBranchStatus,
  PermissionRequest,
  PlanComment,
  PlanReviewStatus,
  QuestionRequest,
  SdkMessage,
  SessionInitInfo,
  SessionStatus,
} from '../../../shared/types'

type SessionState = {
  id: string
  cwd: string
  status: SessionStatus
  model: string
  title: string
  cost: {
    inputTokens: number
    outputTokens: number
    totalUsd: number
    contextWindow: number
    contextInputTokens: number
    maxOutputTokens: number
  }
  createdAt: number
  updatedAt: number
}

type TaskItem = {
  id: string
  subject: string
  status: 'pending' | 'in_progress' | 'completed'
  activeForm?: string
}

type CachedDiff = {
  filePath: string
  status: string
  diff: string
}

type SessionStore = {
  sessions: Map<string, SessionState>
  messages: Map<string, SdkMessage[]>
  pendingPermissions: PermissionRequest[]
  pendingQuestions: QuestionRequest[]
  streamingText: Map<string, string>
  /** Accumulated streaming text per subagent, keyed by parent_tool_use_id */
  subagentStreaming: Map<string, string>
  /** Complete subagent messages, keyed by parent_tool_use_id */
  subagentMessages: Map<string, SdkMessage[]>
  tasks: Map<string, TaskItem[]>
  /** SDK-reported status per session (e.g. 'compacting') */
  sdkStatus: Map<string, string | null>
  changedFiles: Map<string, string[]>
  /** Cached diff results per session, keyed by sessionId → filePath */
  diffCache: Map<string, Map<string, CachedDiff>>
  detectedPlans: Map<string, DetectedPlan[]>
  /** SDK init info per session (tools, skills, plugins, MCP servers) */
  initInfo: Map<string, SessionInitInfo>
  /** Git branch status per cwd (keyed by cwd path, not session id) */
  branchStatus: Map<string, GitBranchStatus>

  setSession: (session: SessionState) => void
  updateSession: (sessionId: string, updates: Partial<SessionState>) => void
  appendMessage: (sessionId: string, message: SdkMessage) => void
  setMessages: (sessionId: string, messages: SdkMessage[]) => void
  addPermission: (permission: PermissionRequest) => void
  removePermission: (requestId: string) => void
  addQuestion: (question: QuestionRequest) => void
  removeQuestion: (requestId: string) => void
  updateStreamingText: (sessionId: string, text: string) => void
  clearStreamingText: (sessionId: string) => void
  appendSubagentStreamText: (agentToolUseId: string, text: string) => void
  clearSubagentStream: (agentToolUseId: string) => void
  appendSubagentMessage: (agentToolUseId: string, message: SdkMessage) => void
  upsertTask: (sessionId: string, task: TaskItem) => void
  clearTasks: (sessionId: string) => void
  setSdkStatus: (sessionId: string, status: string | null) => void
  addChangedFile: (sessionId: string, filePath: string) => void
  clearChangedFiles: (sessionId: string) => void
  setCachedDiff: (sessionId: string, diff: CachedDiff) => void
  getCachedDiff: (sessionId: string, filePath: string) => CachedDiff | undefined
  clearDiffCache: (sessionId: string) => void
  addDetectedPlan: (sessionId: string, plan: DetectedPlan) => void
  updatePlanStatus: (sessionId: string, filePath: string, status: PlanReviewStatus) => void
  setPlanComments: (sessionId: string, filePath: string, comments: PlanComment[]) => void
  setInitInfo: (sessionId: string, info: SessionInitInfo) => void
  setBranchStatus: (cwd: string, status: GitBranchStatus) => void
}

export const useSessionStore = create<SessionStore>((set) => ({
  sessions: new Map(),
  messages: new Map(),
  pendingPermissions: [],
  pendingQuestions: [],
  streamingText: new Map(),
  subagentStreaming: new Map(),
  subagentMessages: new Map(),
  tasks: new Map(),
  sdkStatus: new Map(),
  changedFiles: new Map(),
  diffCache: new Map(),
  detectedPlans: new Map(),
  initInfo: new Map(),
  branchStatus: new Map(),

  setSession: (session) =>
    set((state) => {
      const next = new Map(state.sessions)
      next.set(session.id, session)
      return { sessions: next }
    }),

  updateSession: (sessionId, updates) =>
    set((state) => {
      const next = new Map(state.sessions)
      const existing = next.get(sessionId)
      if (existing) {
        next.set(sessionId, { ...existing, ...updates })
      }
      return { sessions: next }
    }),

  appendMessage: (sessionId, message) =>
    set((state) => {
      const next = new Map(state.messages)
      const existing = next.get(sessionId) ?? []
      next.set(sessionId, [...existing, message])
      return { messages: next }
    }),

  setMessages: (sessionId, messages) =>
    set((state) => {
      const next = new Map(state.messages)
      next.set(sessionId, messages)
      return { messages: next }
    }),

  addPermission: (permission) =>
    set((state) => ({
      pendingPermissions: [...state.pendingPermissions, permission],
    })),

  removePermission: (requestId) =>
    set((state) => ({
      pendingPermissions: state.pendingPermissions.filter((p) => p.requestId !== requestId),
    })),

  addQuestion: (question) =>
    set((state) => ({
      pendingQuestions: [...state.pendingQuestions, question],
    })),

  removeQuestion: (requestId) =>
    set((state) => ({
      pendingQuestions: state.pendingQuestions.filter((q) => q.requestId !== requestId),
    })),

  updateStreamingText: (sessionId, text) =>
    set((state) => {
      const next = new Map(state.streamingText)
      next.set(sessionId, text)
      return { streamingText: next }
    }),

  clearStreamingText: (sessionId) =>
    set((state) => {
      const next = new Map(state.streamingText)
      next.delete(sessionId)
      return { streamingText: next }
    }),

  appendSubagentStreamText: (agentToolUseId, text) =>
    set((state) => {
      const next = new Map(state.subagentStreaming)
      const current = next.get(agentToolUseId) ?? ''
      next.set(agentToolUseId, current + text)
      return { subagentStreaming: next }
    }),

  clearSubagentStream: (agentToolUseId) =>
    set((state) => {
      const next = new Map(state.subagentStreaming)
      next.delete(agentToolUseId)
      return { subagentStreaming: next }
    }),

  appendSubagentMessage: (agentToolUseId, message) =>
    set((state) => {
      const next = new Map(state.subagentMessages)
      const existing = next.get(agentToolUseId) ?? []
      next.set(agentToolUseId, [...existing, message])
      return { subagentMessages: next }
    }),

  upsertTask: (sessionId, task) =>
    set((state) => {
      const next = new Map(state.tasks)
      const existing = next.get(sessionId) ?? []
      const idx = existing.findIndex((t) => t.id === task.id)
      if (idx >= 0) {
        const updated = [...existing]
        updated[idx] = { ...existing[idx], ...task }
        next.set(sessionId, updated)
      } else {
        next.set(sessionId, [...existing, task])
      }
      return { tasks: next }
    }),

  clearTasks: (sessionId) =>
    set((state) => {
      const next = new Map(state.tasks)
      next.delete(sessionId)
      return { tasks: next }
    }),

  setSdkStatus: (sessionId, status) =>
    set((state) => {
      const next = new Map(state.sdkStatus)
      next.set(sessionId, status)
      return { sdkStatus: next }
    }),

  addChangedFile: (sessionId, filePath) =>
    set((state) => {
      const next = new Map(state.changedFiles)
      const existing = next.get(sessionId) ?? []
      if (!existing.includes(filePath)) {
        next.set(sessionId, [...existing, filePath])
      }
      return { changedFiles: next }
    }),

  clearChangedFiles: (sessionId) =>
    set((state) => {
      const next = new Map(state.changedFiles)
      next.delete(sessionId)
      return { changedFiles: next }
    }),

  setCachedDiff: (sessionId, diff) =>
    set((state) => {
      const next = new Map(state.diffCache)
      const sessionCache = new Map(next.get(sessionId) ?? [])
      sessionCache.set(diff.filePath, diff)
      next.set(sessionId, sessionCache)
      return { diffCache: next }
    }),

  getCachedDiff: (sessionId, filePath) => {
    return useSessionStore.getState().diffCache.get(sessionId)?.get(filePath)
  },

  clearDiffCache: (sessionId) =>
    set((state) => {
      const next = new Map(state.diffCache)
      next.delete(sessionId)
      return { diffCache: next }
    }),

  addDetectedPlan: (sessionId, plan) =>
    set((state) => {
      const next = new Map(state.detectedPlans)
      const existing = next.get(sessionId) ?? []
      if (existing.some((p) => p.toolUseId === plan.toolUseId)) return state
      next.set(sessionId, [...existing, plan])
      return { detectedPlans: next }
    }),

  updatePlanStatus: (sessionId, filePath, status) =>
    set((state) => {
      const next = new Map(state.detectedPlans)
      const existing = next.get(sessionId)
      if (!existing) return state
      next.set(
        sessionId,
        existing.map((p) => (p.filePath === filePath ? { ...p, status } : p)),
      )
      return { detectedPlans: next }
    }),

  setPlanComments: (sessionId, filePath, comments) =>
    set((state) => {
      const next = new Map(state.detectedPlans)
      const existing = next.get(sessionId)
      if (!existing) return state
      next.set(
        sessionId,
        existing.map((p) => (p.filePath === filePath ? { ...p, comments } : p)),
      )
      return { detectedPlans: next }
    }),

  setInitInfo: (sessionId, info) =>
    set((state) => {
      const next = new Map(state.initInfo)
      next.set(sessionId, info)
      return { initInfo: next }
    }),

  setBranchStatus: (cwd, status) =>
    set((state) => {
      const next = new Map(state.branchStatus)
      next.set(cwd, status)
      return { branchStatus: next }
    }),
}))

export type { CachedDiff, SessionState, TaskItem }
