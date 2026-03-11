import { Clock, DollarSign, Folder, GitBranch, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { resumeStoredSession, type StoredSession } from '../lib/resume-session'
import { formatCost, timeAgo } from '../lib/utils'
import { useTabStore } from '../store/tab-store'

export function HistoryPanel() {
  const [storedSessions, setStoredSessions] = useState<StoredSession[]>([])
  const [loading, setLoading] = useState(true)
  const { tabs, addTab } = useTabStore()

  const openSessionIds = new Set(tabs.map((t) => t.sessionId).filter(Boolean))

  async function loadSessions() {
    setLoading(true)
    const sessions = await window.api.listSessions()
    setStoredSessions(sessions as StoredSession[])
    setLoading(false)
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only load
  useEffect(() => {
    loadSessions()
  }, [])

  // Reload when tabs change (to update filtered list)
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional trigger on tab count
  useEffect(() => {
    loadSessions()
  }, [tabs.length])

  async function handleResume(session: StoredSession) {
    const { title, isWorktree } = await resumeStoredSession(session)
    const displayCwd = session.original_cwd ?? session.cwd
    addTab(
      session.cwd,
      title || displayCwd.split('/').pop() || displayCwd,
      session.id,
      isWorktree ? true : undefined,
    )
  }

  async function handleDelete(e: React.MouseEvent, sessionId: string) {
    e.stopPropagation()
    await window.api.deleteSession(sessionId)
    setStoredSessions((prev) => prev.filter((s) => s.id !== sessionId))
  }

  const availableSessions = storedSessions.filter((s) => !openSessionIds.has(s.id))

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-stone-800 border-b px-4 py-3">
        <h2 className="font-medium text-stone-500 text-xs uppercase tracking-wider">
          Session History
        </h2>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-stone-600 text-xs">
            Loading...
          </div>
        ) : availableSessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-stone-600 text-xs">No previous sessions</p>
            <p className="mt-1 text-[11px] text-stone-700">Open a folder to get started</p>
          </div>
        ) : (
          availableSessions.map((session) => (
            <button
              type="button"
              key={session.id}
              onClick={() => handleResume(session)}
              className="group flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2.5 text-left transition-colors hover:bg-stone-800/60"
            >
              <Folder size={13} className="mt-0.5 flex-shrink-0 text-stone-600" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-stone-300 text-xs">
                  {session.title || session.cwd.split('/').pop() || 'Untitled'}
                </p>
                <p className="truncate text-[11px] text-stone-600">
                  {session.original_cwd ?? session.cwd}
                </p>
                {session.worktree_branch && (
                  <div className="mt-0.5 flex items-center gap-1">
                    <GitBranch size={9} className="text-amber-600" />
                    <span className="text-[10px] text-amber-600/80">{session.worktree_branch}</span>
                  </div>
                )}
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
                type="button"
                onClick={(e) => handleDelete(e, session.id)}
                className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-stone-600 opacity-0 transition-all hover:bg-stone-700 hover:text-red-400 group-hover:opacity-100"
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
