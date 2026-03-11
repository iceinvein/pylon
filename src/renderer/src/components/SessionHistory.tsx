import { Clock, DollarSign, Folder, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { resumeStoredSession, type StoredSession } from '../lib/resume-session'
import { formatCost, timeAgo } from '../lib/utils'
import { useTabStore } from '../store/tab-store'

export function SessionHistory() {
  const [storedSessions, setStoredSessions] = useState<StoredSession[]>([])
  const [loading, setLoading] = useState(true)
  const { addTab } = useTabStore()

  async function loadSessions() {
    setLoading(true)
    const sessions = await window.api.listSessions()
    setStoredSessions(sessions as StoredSession[])
    setLoading(false)
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: loadSessions is stable intent, not a dep
  useEffect(() => {
    loadSessions()
  }, [])

  async function handleResume(session: StoredSession) {
    const { title } = await resumeStoredSession(session)
    addTab(session.cwd, title, session.id)
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
        <p className="mt-1 text-stone-700 text-xs">Open a folder to get started</p>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <p className="mb-2 font-medium text-stone-600 text-xs uppercase tracking-wider">
        Recent Sessions
      </p>
      {storedSessions.slice(0, 20).map((session) => (
        <button
          type="button"
          key={session.id}
          onClick={() => handleResume(session)}
          className="group flex w-full items-start gap-3 rounded-lg p-3 text-left transition-colors hover:bg-stone-800/60"
        >
          <Folder size={14} className="mt-0.5 flex-shrink-0 text-stone-600" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-stone-300">
              {session.title || session.cwd.split('/').pop() || 'Untitled'}
            </p>
            <p className="truncate text-stone-600 text-xs">{session.cwd}</p>
            <div className="mt-1 flex items-center gap-3">
              <span className="flex items-center gap-1 text-stone-700 text-xs">
                <Clock size={10} />
                {timeAgo(session.updated_at)}
              </span>
              {session.total_cost_usd > 0 && (
                <span className="flex items-center gap-1 text-stone-700 text-xs">
                  <DollarSign size={10} />
                  {formatCost(session.total_cost_usd)}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={(e) => handleDelete(e, session.id)}
            className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-stone-600 opacity-0 transition-all hover:bg-stone-700 hover:text-red-400 group-hover:opacity-100"
          >
            <Trash2 size={12} />
          </button>
        </button>
      ))}
    </div>
  )
}
