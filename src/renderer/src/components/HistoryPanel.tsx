import {
  ChevronDown,
  ChevronRight,
  Clock,
  DollarSign,
  Folder,
  GitBranch,
  Trash2,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { resumeStoredSession, type StoredSession } from '../lib/resume-session'
import { formatCost, timeAgo } from '../lib/utils'
import { useTabStore } from '../store/tab-store'

const COLLAPSED_KEY = 'pylon:history-collapsed'
const PROJECT_SESSION_LIMIT = 10

function loadCollapsed(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY)
    return raw ? new Set(JSON.parse(raw)) : new Set()
  } catch {
    return new Set()
  }
}

function saveCollapsed(collapsed: Set<string>) {
  localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...collapsed]))
}

type ProjectGroup = {
  projectPath: string
  projectName: string
  sessions: StoredSession[]
  latestUpdate: number
}

function groupByProject(sessions: StoredSession[]): ProjectGroup[] {
  const map = new Map<string, StoredSession[]>()

  for (const session of sessions) {
    const key = session.original_cwd ?? session.cwd
    const existing = map.get(key)
    if (existing) {
      existing.push(session)
    } else {
      map.set(key, [session])
    }
  }

  const groups: ProjectGroup[] = []
  for (const [projectPath, projectSessions] of map) {
    projectSessions.sort((a, b) => b.updated_at - a.updated_at)
    groups.push({
      projectPath,
      projectName: projectPath.split('/').pop() || projectPath,
      sessions: projectSessions,
      latestUpdate: projectSessions[0].updated_at,
    })
  }

  groups.sort((a, b) => b.latestUpdate - a.latestUpdate)
  return groups
}

export function HistoryPanel() {
  const [storedSessions, setStoredSessions] = useState<StoredSession[]>([])
  const [loading, setLoading] = useState(true)
  const [collapsed, setCollapsed] = useState<Set<string>>(loadCollapsed)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
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

  const toggleCollapsed = useCallback((projectPath: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(projectPath)) {
        next.delete(projectPath)
      } else {
        next.add(projectPath)
      }
      saveCollapsed(next)
      return next
    })
  }, [])

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
  const groups = useMemo(() => groupByProject(availableSessions), [availableSessions])

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
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-stone-600 text-xs">No previous sessions</p>
            <p className="mt-1 text-[11px] text-stone-700">Open a folder to get started</p>
          </div>
        ) : (
          groups.map((group) => {
            const isCollapsed = collapsed.has(group.projectPath)
            return (
              <div key={group.projectPath} className="mb-1">
                <button
                  type="button"
                  onClick={() => toggleCollapsed(group.projectPath)}
                  className="group flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-stone-800/50"
                >
                  {isCollapsed ? (
                    <ChevronRight size={12} className="flex-shrink-0 text-stone-600" />
                  ) : (
                    <ChevronDown size={12} className="flex-shrink-0 text-stone-600" />
                  )}
                  <Folder size={12} className="flex-shrink-0 text-stone-500" />
                  <span className="min-w-0 flex-1 truncate font-medium text-[11px] text-stone-400">
                    {group.projectName}
                  </span>
                  <span className="flex-shrink-0 rounded-full bg-stone-800 px-1.5 py-0.5 text-[10px] text-stone-600">
                    {group.sessions.length}
                  </span>
                </button>
                {!isCollapsed && (
                  <div className="ml-3 border-stone-800/50 border-l pl-1">
                    {(expanded.has(group.projectPath)
                      ? group.sessions
                      : group.sessions.slice(0, PROJECT_SESSION_LIMIT)
                    ).map((session) => (
                      <button
                        type="button"
                        key={session.id}
                        onClick={() => handleResume(session)}
                        className="group flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left transition-colors hover:bg-stone-800/60"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-stone-300 text-xs">
                            {session.title || 'Untitled'}
                          </p>
                          {session.worktree_branch && (
                            <div className="mt-0.5 flex items-center gap-1">
                              <GitBranch size={9} className="text-amber-600" />
                              <span className="text-[10px] text-amber-600/80">
                                {session.worktree_branch}
                              </span>
                            </div>
                          )}
                          <div className="mt-0.5 flex items-center gap-2.5">
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
                    ))}
                    {group.sessions.length > PROJECT_SESSION_LIMIT &&
                      !expanded.has(group.projectPath) && (
                        <button
                          type="button"
                          onClick={() =>
                            setExpanded((prev) => new Set([...prev, group.projectPath]))
                          }
                          className="w-full rounded-md px-2 py-1.5 text-center text-[11px] text-stone-500 transition-colors hover:bg-stone-800/50 hover:text-stone-400"
                        >
                          Show {group.sessions.length - PROJECT_SESSION_LIMIT} more
                        </button>
                      )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
