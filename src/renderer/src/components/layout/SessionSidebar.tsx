// src/renderer/src/components/layout/SessionSidebar.tsx
import { ChevronDown, ChevronRight, Plus } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { groupByProject } from '../../lib/group-sessions'
import { resumeStoredSession, type StoredSession } from '../../lib/resume-session'
import { useSessionStore } from '../../store/session-store'
import { useUiStore } from '../../store/ui-store'
import { ProjectsPopover } from '../ProjectsPopover'
import { WorktreeDialog } from '../WorktreeDialog'
import { useFolderOpen } from '../../hooks/use-folder-open'
import { SessionCard } from './SessionCard'

const COLLAPSED_KEY = 'pylon:sidebar-collapsed'
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

export function SessionSidebar() {
  const [storedSessions, setStoredSessions] = useState<StoredSession[]>([])
  const [loading, setLoading] = useState(true)
  const [collapsed, setCollapsed] = useState<Set<string>>(loadCollapsed)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const activeSessionId = useUiStore((s) => s.activeSessionId)
  const setActiveSession = useUiStore((s) => s.setActiveSession)
  const newSessionPopoverOpen = useUiStore((s) => s.newSessionPopoverOpen)
  const setNewSessionPopoverOpen = useUiStore((s) => s.setNewSessionPopoverOpen)

  const liveSessions = useSessionStore((s) => s.sessions)
  const messages = useSessionStore((s) => s.messages)
  const plusBtnRef = useRef<HTMLButtonElement>(null)
  const { dialogState, openFolder, openPath, confirmDialog, cancelDialog } = useFolderOpen()

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

  // Reload when live session count changes (new session created)
  const liveSessionCount = liveSessions.size
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional trigger on live count
  useEffect(() => {
    loadSessions()
  }, [liveSessionCount])

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

  async function handleSelect(session: StoredSession) {
    // If not already live, hydrate it
    if (!liveSessions.has(session.id)) {
      await resumeStoredSession(session)
    }
    setActiveSession(session.id)
  }

  function handleDelete(e: React.MouseEvent, sessionId: string) {
    e.stopPropagation()
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

  useEffect(() => {
    return () => {
      if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current)
    }
  }, [])

  // Merge live sessions into stored sessions for display
  const mergedSessions = useMemo(() => {
    const storedMap = new Map(storedSessions.map((s) => [s.id, s]))

    // Overlay live session data onto stored sessions
    for (const [id, live] of liveSessions) {
      const stored = storedMap.get(id)
      if (stored) {
        // Update with live data
        storedMap.set(id, {
          ...stored,
          title: live.title || stored.title,
          total_cost_usd: live.cost.totalUsd || stored.total_cost_usd,
          updated_at: live.updatedAt || stored.updated_at,
        })
      }
    }

    return [...storedMap.values()]
  }, [storedSessions, liveSessions])

  const groups = useMemo(() => groupByProject(mergedSessions), [mergedSessions])

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-base-border-subtle px-3 py-2.5">
        <span className="text-xs font-medium text-base-text-secondary uppercase tracking-wider">
          Sessions
        </span>
        <button
          ref={plusBtnRef}
          type="button"
          onClick={() => setNewSessionPopoverOpen(!newSessionPopoverOpen)}
          title="New Session (⌘N)"
          aria-label="New Session"
          className="flex h-6 w-6 items-center justify-center rounded-md text-base-text-muted transition-colors hover:bg-base-raised hover:text-base-text"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {loading ? (
          <div className="space-y-2 px-2 py-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="space-y-1.5 rounded-lg px-2 py-2">
                <div
                  className="h-3 animate-pulse rounded bg-base-raised"
                  style={{ width: `${75 - i * 10}%`, animationDelay: `${i * 150}ms` }}
                />
                <div
                  className="h-2 animate-pulse rounded bg-base-raised/60"
                  style={{ width: `${50 - i * 8}%`, animationDelay: `${i * 150 + 75}ms` }}
                />
              </div>
            ))}
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-xs text-base-text-muted">No sessions yet</p>
            <p className="mt-1 text-[10px] text-base-text-faint">
              Press ⌘N to start your first session
            </p>
          </div>
        ) : (
          groups.map((group) => {
            const isCollapsed = collapsed.has(group.projectPath)
            return (
              <div key={group.projectPath} className="mb-2">
                {/* Project header */}
                <button
                  type="button"
                  onClick={() => toggleCollapsed(group.projectPath)}
                  className="group flex w-full items-center gap-1.5 px-1 py-1 text-left"
                >
                  {isCollapsed ? (
                    <ChevronRight size={10} className="shrink-0 text-base-text-faint" />
                  ) : (
                    <ChevronDown size={10} className="shrink-0 text-base-text-faint" />
                  )}
                  <span className="text-[10px] font-semibold uppercase tracking-[0.05em] text-base-text-muted">
                    {group.projectName}
                  </span>
                </button>

                {/* Session cards with tree line */}
                {!isCollapsed && (
                  <div className="ml-[7px] border-l border-base-border-subtle/50 pl-2">
                    {(expanded.has(group.projectPath)
                      ? group.sessions
                      : group.sessions.slice(0, PROJECT_SESSION_LIMIT)
                    ).map((session) => {
                      const liveSession = liveSessions.get(session.id)
                      const sessionMessages = messages.get(session.id)
                      return (
                        <SessionCard
                          key={session.id}
                          session={session}
                          isActive={session.id === activeSessionId}
                          status={liveSession?.status}
                          messages={sessionMessages}
                          onSelect={() => handleSelect(session)}
                          onDelete={(e) => handleDelete(e, session.id)}
                          isPendingDelete={pendingDelete === session.id}
                          onUndoDelete={handleUndoDelete}
                        />
                      )
                    })}
                    {group.sessions.length > PROJECT_SESSION_LIMIT &&
                      !expanded.has(group.projectPath) && (
                        <button
                          type="button"
                          onClick={() =>
                            setExpanded((prev) => new Set([...prev, group.projectPath]))
                          }
                          className="w-full rounded-md px-2 py-1.5 text-center text-[10px] text-base-text-muted transition-colors hover:bg-base-raised/50"
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

      {/* Popover + Dialog */}
      <ProjectsPopover
        open={newSessionPopoverOpen}
        onClose={() => setNewSessionPopoverOpen(false)}
        onSelectProject={(path) => openPath(path)}
        onBrowse={openFolder}
        anchorRef={plusBtnRef}
        position="right"
      />
      {dialogState && (
        <WorktreeDialog
          folderPath={dialogState.path}
          isDirty={dialogState.isDirty}
          onConfirm={confirmDialog}
          onCancel={cancelDialog}
        />
      )}
    </div>
  )
}
