import {
  ChevronDown,
  ChevronRight,
  Clock,
  DollarSign,
  Folder,
  GitBranch,
  Trash2,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { resumeStoredSession, type StoredSession } from '../lib/resume-session'
import { formatCost, timeAgo } from '../lib/utils'
import { useTabStore } from '../store/tab-store'
import { SectionHeader } from './SectionHeader'

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
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
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

  function handleDelete(e: React.MouseEvent, sessionId: string) {
    e.stopPropagation()
    // Start timed delete — gives user 3s to undo
    setPendingDelete(sessionId)
    if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current)
    deleteTimerRef.current = setTimeout(async () => {
      await window.api.deleteSession(sessionId)
      setStoredSessions((prev) => prev.filter((s) => s.id !== sessionId))
      setPendingDelete(null)
    }, 3000)
  }

  function handleUndoDelete(e: React.MouseEvent) {
    e.stopPropagation()
    if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current)
    setPendingDelete(null)
  }

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current)
    }
  }, [])

  const availableSessions = storedSessions.filter((s) => !openSessionIds.has(s.id))
  const groups = useMemo(() => groupByProject(availableSessions), [availableSessions])

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-base-border-subtle border-b px-4 py-3">
        <SectionHeader>History</SectionHeader>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-base-text-faint text-xs">
            Loading...
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-base-text-muted text-xs">No sessions yet</p>
            <p className="mt-1 text-[11px] text-base-text-faint">Open a folder to get started</p>
          </div>
        ) : (
          groups.map((group) => {
            const isCollapsed = collapsed.has(group.projectPath)
            return (
              <div key={group.projectPath} className="mb-1">
                <button
                  type="button"
                  onClick={() => toggleCollapsed(group.projectPath)}
                  className="group flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-base-raised/50"
                >
                  {isCollapsed ? (
                    <ChevronRight size={12} className="shrink-0 text-base-text-faint" />
                  ) : (
                    <ChevronDown size={12} className="shrink-0 text-base-text-faint" />
                  )}
                  <Folder size={12} className="shrink-0 text-base-text-muted" />
                  <span className="min-w-0 flex-1 truncate font-medium text-[11px] text-base-text-secondary">
                    {group.projectName}
                  </span>
                  <span className="shrink-0 rounded-full bg-base-raised px-1.5 py-0.5 text-[10px] text-base-text-muted">
                    {group.sessions.length}
                  </span>
                </button>
                {!isCollapsed && (
                  <div className="ml-3 border-base-border-subtle/50 border-l pl-1">
                    {(expanded.has(group.projectPath)
                      ? group.sessions
                      : group.sessions.slice(0, PROJECT_SESSION_LIMIT)
                    ).map((session) => (
                      <button
                        type="button"
                        key={session.id}
                        onClick={() => handleResume(session)}
                        className={`group flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left transition-colors hover:bg-base-raised/60 ${
                          pendingDelete === session.id ? 'opacity-40' : ''
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-base-text text-xs">
                            {session.title || 'Untitled'}
                          </p>
                          {session.worktree_branch && (
                            <div className="mt-0.5 flex items-center gap-1">
                              <GitBranch size={9} className="text-accent" />
                              <span className="text-[10px] text-accent/80">
                                {session.worktree_branch}
                              </span>
                            </div>
                          )}
                          <div className="mt-0.5 flex items-center gap-2.5">
                            <span className="flex items-center gap-1 text-[11px] text-base-text-faint">
                              <Clock size={9} />
                              {timeAgo(session.updated_at)}
                            </span>
                            {session.total_cost_usd > 0 && (
                              <span className="flex items-center gap-1 text-[11px] text-base-text-faint">
                                <DollarSign size={9} />
                                {formatCost(session.total_cost_usd)}
                              </span>
                            )}
                          </div>
                        </div>
                        {pendingDelete === session.id ? (
                          <button
                            type="button"
                            onClick={handleUndoDelete}
                            aria-label="Undo delete"
                            className="shrink-0 rounded px-1.5 py-0.5 font-medium text-[10px] text-accent-text transition-colors hover:bg-accent/15"
                          >
                            Undo
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => handleDelete(e, session.id)}
                            aria-label="Delete session"
                            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-base-text-faint opacity-0 transition-all hover:bg-base-border hover:text-error group-hover:opacity-100"
                          >
                            <Trash2 size={11} />
                          </button>
                        )}
                      </button>
                    ))}
                    {group.sessions.length > PROJECT_SESSION_LIMIT &&
                      !expanded.has(group.projectPath) && (
                        <button
                          type="button"
                          onClick={() =>
                            setExpanded((prev) => new Set([...prev, group.projectPath]))
                          }
                          className="w-full rounded-md px-2 py-1.5 text-center text-[11px] text-base-text-muted transition-colors hover:bg-base-raised/50 hover:text-base-text-secondary"
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
