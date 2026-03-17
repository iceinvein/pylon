import { Clock, DollarSign, Folder, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { resumeStoredSession, type StoredSession } from '../lib/resume-session'
import { formatCost, timeAgo } from '../lib/utils'
import { useTabStore } from '../store/tab-store'
import { SectionHeader } from './SectionHeader'

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
      <div className="flex items-center justify-center py-8 text-base-text-faint text-sm">
        Loading...
      </div>
    )
  }

  if (storedSessions.length === 0) return null

  return (
    <div className="space-y-1">
      <SectionHeader>Recent</SectionHeader>
      {storedSessions.slice(0, 5).map((session) => (
        <button
          type="button"
          key={session.id}
          onClick={() => handleResume(session)}
          className="group flex w-full items-start gap-3 rounded-lg p-3 text-left transition-colors hover:bg-base-raised"
        >
          <Folder size={14} className="mt-0.5 shrink-0 text-base-text-muted" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-base-text text-sm">
              {session.title || session.cwd.split('/').pop() || 'Untitled'}
            </p>
            <p className="truncate text-base-text-muted text-xs">{session.cwd}</p>
            <div className="mt-1 flex items-center gap-3">
              <span className="flex items-center gap-1 text-base-text-faint text-xs">
                <Clock size={10} />
                {timeAgo(session.updated_at)}
              </span>
              {session.total_cost_usd > 0 && (
                <span className="flex items-center gap-1 text-base-text-faint text-xs">
                  <DollarSign size={10} />
                  {formatCost(session.total_cost_usd)}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={(e) => handleDelete(e, session.id)}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-base-text-faint opacity-0 transition-all hover:bg-base-border hover:text-error group-hover:opacity-100"
          >
            <Trash2 size={12} />
          </button>
        </button>
      ))}
    </div>
  )
}
