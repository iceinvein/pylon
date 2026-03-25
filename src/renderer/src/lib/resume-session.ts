import type { SessionStatus } from '../../../shared/types'
import type { SessionState } from '../store/session-store'
import { useSessionStore } from '../store/session-store'
import { extractChangedFiles } from './extract-changed-files'
import { extractDetectedPlans } from './extract-detected-plans'

/**
 * Shape of a session row returned by `window.api.listSessions()`.
 * Defined here so all resume call-sites share one type instead of
 * each declaring their own identical copy.
 */
export type StoredSession = {
  id: string
  cwd: string
  status: string
  model: string
  title: string
  total_cost_usd: number
  input_tokens: number
  output_tokens: number
  context_window: number
  context_input_tokens: number
  max_output_tokens: number
  created_at: number
  updated_at: number
  worktree_path?: string | null
  original_cwd?: string | null
  worktree_branch?: string | null
}

type ResumeResult = {
  /** Resolved display title (from SDK resume or stored session) */
  title: string
  /** Session status after resume (may still be 'running' or 'waiting') */
  status: SessionStatus
  /** Whether this session uses a git worktree */
  isWorktree: boolean
}

/**
 * Hydrate a stored session into the Zustand store, rebuild derived state
 * (changed files, detected plans) from persisted messages, and reconnect
 * the SDK. Returns info the caller needs to open a tab.
 *
 * This is the single source of truth for session resume logic — used by
 * HistoryPanel, SessionHistory, and CommandPalette.
 */
export async function resumeStoredSession(session: StoredSession): Promise<ResumeResult> {
  const store = useSessionStore.getState()

  // 1. Build and hydrate session state
  const sessionState: SessionState = {
    id: session.id,
    cwd: session.cwd,
    status: 'done',
    model: session.model,
    title: session.title,
    cost: {
      inputTokens: session.input_tokens ?? 0,
      outputTokens: session.output_tokens ?? 0,
      totalUsd: session.total_cost_usd ?? 0,
      contextWindow: session.context_window ?? 0,
      contextInputTokens: session.context_input_tokens ?? 0,
      maxOutputTokens: session.max_output_tokens ?? 0,
    },
    createdAt: session.created_at,
    updatedAt: session.updated_at,
  }
  store.setSession(sessionState)

  // 2. Fetch and parse persisted messages
  const msgs = await window.api.getMessages(session.id)
  const parsed = (msgs as { sdk_message: string }[])
    .map((m) => {
      try {
        return JSON.parse(m.sdk_message)
      } catch {
        return null
      }
    })
    .filter(Boolean)
  store.setMessages(session.id, parsed)

  // 3. Rebuild derived state from historical messages
  for (const filePath of extractChangedFiles(parsed)) {
    store.addChangedFile(session.id, filePath)
  }
  for (const plan of extractDetectedPlans(parsed)) {
    store.addDetectedPlan(session.id, plan)
  }

  // 4. Reconnect SDK session
  const result = await window.api.resumeSession(session.id)

  // 5. Reconcile title and status
  const resolvedTitle = result.title || session.title || session.cwd.split('/').pop() || session.cwd
  const resolvedStatus = (result.status as SessionStatus) || 'done'

  if (result.title) {
    store.setSession({ ...sessionState, title: result.title })
  }
  if (resolvedStatus !== 'done') {
    store.updateSession(session.id, { status: resolvedStatus })
  }

  return {
    title: resolvedTitle,
    status: resolvedStatus,
    isWorktree: !!session.worktree_path,
  }
}
