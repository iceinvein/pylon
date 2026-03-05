import { useEffect, useState } from 'react'
import { Clock, Folder, Trash2, DollarSign } from 'lucide-react'
import { useTabStore } from '../store/tab-store'
import { useSessionStore } from '../store/session-store'
import { formatCost, timeAgo } from '../lib/utils'
import type { SessionState } from '../store/session-store'

type StoredSession = {
  id: string
  cwd: string
  status: string
  model: string
  title: string
  total_cost_usd: number
  input_tokens: number
  output_tokens: number
  created_at: number
  updated_at: number
}

export function SessionHistory() {
  const [storedSessions, setStoredSessions] = useState<StoredSession[]>([])
  const [loading, setLoading] = useState(true)
  const { addTab } = useTabStore()
  const { setSession, setMessages } = useSessionStore()

  async function loadSessions() {
    setLoading(true)
    const sessions = await window.api.listSessions()
    setStoredSessions(sessions as StoredSession[])
    setLoading(false)
  }

  useEffect(() => {
    loadSessions()
  }, [])

  async function handleResume(session: StoredSession) {
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
      },
      createdAt: session.created_at,
      updatedAt: session.updated_at,
    }

    setSession(sessionState)

    const msgs = await window.api.getMessages(session.id)
    const parsed = (msgs as { sdk_message: string }[]).map((m) => {
      try { return JSON.parse(m.sdk_message) } catch { return null }
    }).filter(Boolean)
    setMessages(session.id, parsed)

    await window.api.resumeSession(session.id)
    addTab(session.cwd, session.title || session.cwd.split('/').pop() || session.cwd, session.id)
  }

  async function handleDelete(e: React.MouseEvent, sessionId: string) {
    e.stopPropagation()
    await window.api.deleteSession(sessionId)
    setStoredSessions((prev) => prev.filter((s) => s.id !== sessionId))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-stone-600">
        Loading sessions...
      </div>
    )
  }

  if (storedSessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <p className="text-sm text-stone-600">No previous sessions</p>
        <p className="mt-1 text-xs text-stone-700">Open a folder to get started</p>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <p className="mb-2 text-xs font-medium uppercase tracking-wider text-stone-600">Recent Sessions</p>
      {storedSessions.slice(0, 20).map((session) => (
        <button
          key={session.id}
          onClick={() => handleResume(session)}
          className="group flex w-full items-start gap-3 rounded-lg p-3 text-left transition-colors hover:bg-stone-800/60"
        >
          <Folder size={14} className="mt-0.5 flex-shrink-0 text-stone-600" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-stone-300">
              {session.title || session.cwd.split('/').pop() || 'Untitled'}
            </p>
            <p className="truncate text-xs text-stone-600">{session.cwd}</p>
            <div className="mt-1 flex items-center gap-3">
              <span className="flex items-center gap-1 text-xs text-stone-700">
                <Clock size={10} />
                {timeAgo(session.updated_at)}
              </span>
              {session.total_cost_usd > 0 && (
                <span className="flex items-center gap-1 text-xs text-stone-700">
                  <DollarSign size={10} />
                  {formatCost(session.total_cost_usd)}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={(e) => handleDelete(e, session.id)}
            className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded opacity-0 text-stone-600 transition-all hover:bg-stone-700 hover:text-red-400 group-hover:opacity-100"
          >
            <Trash2 size={12} />
          </button>
        </button>
      ))}
    </div>
  )
}
