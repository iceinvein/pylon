import { create } from 'zustand'
import type { SessionStatus, PermissionRequest } from '../../../shared/types'

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
  }
  createdAt: number
  updatedAt: number
}

type SessionStore = {
  sessions: Map<string, SessionState>
  messages: Map<string, unknown[]>
  pendingPermissions: PermissionRequest[]
  streamingText: Map<string, string>

  setSession: (session: SessionState) => void
  updateSession: (sessionId: string, updates: Partial<SessionState>) => void
  appendMessage: (sessionId: string, message: unknown) => void
  setMessages: (sessionId: string, messages: unknown[]) => void
  addPermission: (permission: PermissionRequest) => void
  removePermission: (requestId: string) => void
  updateStreamingText: (sessionId: string, text: string) => void
  clearStreamingText: (sessionId: string) => void
}

export const useSessionStore = create<SessionStore>((set) => ({
  sessions: new Map(),
  messages: new Map(),
  pendingPermissions: [],
  streamingText: new Map(),

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
}))

export type { SessionState }
