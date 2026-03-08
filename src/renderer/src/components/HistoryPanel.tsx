import { useEffect, useState } from 'react'
import { Clock, Folder, Trash2, DollarSign } from 'lucide-react'
import { useTabStore } from '../store/tab-store'
import { useSessionStore } from '../store/session-store'
import { formatCost, timeAgo } from '../lib/utils'
import { extractChangedFiles } from '../lib/extract-changed-files'
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

export function HistoryPanel() {
  const [storedSessions, setStoredSessions] = useState<StoredSession[]>([])
  const [loading, setLoading] = useState(true)
  const { tabs, addTab } = useTabStore()
  const setSession = useSessionStore((s) => s.setSession)
  const setMessages = useSessionStore((s) => s.setMessages)
  const addChangedFile = useSessionStore((s) => s.addChangedFile)

  const openSessionIds = new Set(tabs.map((t) => t.sessionId).filter(Boolean))

  async function loadSessions() {
    setLoading(true)
    const sessions = await window.api.listSessions()
    setStoredSessions(sessions as StoredSession[])
    setLoading(false)
  }

  useEffect(() => {
    loadSessions()
  }, [])

  // Reload when tabs change (to update filtered list)
  useEffect(() => {
    loadSessions()
  }, [tabs.length])

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

    for (const filePath of extractChangedFiles(parsed)) {
      addChangedFile(session.id, filePath)
    }

    await window.api.resumeSession(session.id)
    addTab(session.cwd, session.title || session.cwd.split('/').pop() || session.cwd, session.id)
  }

  async function handleDelete(e: React.MouseEvent, sessionId: string) {
    e.stopPropagation()
    await window.api.deleteSession(sessionId)
    setStoredSessions((prev) => prev.filter((s) => s.id !== sessionId))
  }

  const availableSessions = storedSessions.filter((s) => !openSessionIds.has(s.id))

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-stone-800 px-4 py-3">
        <h2 className="text-xs font-medium uppercase tracking-wider text-stone-500">Session History</h2>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-xs text-stone-600">
            Loading...
          </div>
        ) : availableSessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-xs text-stone-600">No previous sessions</p>
            <p className="mt-1 text-[11px] text-stone-700">Open a folder to get started</p>
          </div>
        ) : (
          availableSessions.map((session) => (
            <button
              key={session.id}
              onClick={() => handleResume(session)}
              className="group flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2.5 text-left transition-colors hover:bg-stone-800/60"
            >
              <Folder size={13} className="mt-0.5 flex-shrink-0 text-stone-600" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-stone-300">
                  {session.title || session.cwd.split('/').pop() || 'Untitled'}
                </p>
                <p className="truncate text-[11px] text-stone-600">{session.cwd}</p>
                <div className="mt-1 flex items-center gap-2.5">
                  <span className="flex items-center gap-1 text-[11px] text-stone-700">
                    <Clock size={9} />
                    {timeAgo(session.updated_at)}
                  </span>
                  {session.total_cost_usd > 0 && (
                    <span className="flex items-center gap-1 text-[11px] text-stone-700">
                      <DollarSign size={9} />
                      {formatCost(session.total_cost_usd)}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={(e) => handleDelete(e, session.id)}
                className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded opacity-0 text-stone-600 transition-all hover:bg-stone-700 hover:text-red-400 group-hover:opacity-100"
              >
                <Trash2 size={11} />
              </button>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
