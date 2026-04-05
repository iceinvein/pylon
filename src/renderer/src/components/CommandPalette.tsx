import { RotateCcw, Search } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { type CommandContext, getCommands, type SlashCommand } from '../lib/command-registry'
import { resumeStoredSession, type StoredSession } from '../lib/resume-session'
import { timeAgo } from '../lib/utils'
import { useSessionStore } from '../store/session-store'
import { useUiStore } from '../store/ui-store'

type PaletteItem = {
  id: string
  label: string
  description: string
  icon: SlashCommand['icon']
  section: 'session' | 'global' | 'recent'
  keywords?: string[]
  action: () => void
}

export function CommandPalette() {
  const { commandPaletteOpen, toggleCommandPalette } = useUiStore()
  const activeSessionId = useUiStore((s) => s.activeSessionId)
  const [query, setQuery] = useState('')
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [recentSessions, setRecentSessions] = useState<StoredSession[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const sessionId = activeSessionId ?? null

  // Build the command context from current state
  // Note: permissionMode is local state in SessionView, not in the session store.
  // We default to 'default' here — the status command uses it for informational display only.
  const liveSessions = useSessionStore((s) => s.sessions)
  const session = sessionId ? liveSessions.get(sessionId) : undefined
  const context: CommandContext = {
    sessionId,
    activeSessionId: activeSessionId ?? null,
    model: session?.model ?? 'claude-opus-4-6',
    permissionMode: 'default',
  }

  // Load recent sessions when palette opens
  useEffect(() => {
    if (!commandPaletteOpen) return
    window.api.listSessions().then((allSessions) => {
      const available = (allSessions as StoredSession[]).filter((s) => !liveSessions.has(s.id))
      setRecentSessions(available.slice(0, 10))
    })
  }, [commandPaletteOpen, liveSessions])

  async function handleResumeSession(session: StoredSession) {
    toggleCommandPalette()
    await resumeStoredSession(session)
    useUiStore.getState().setActiveSession(session.id)
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: handleResumeSession captures data via recentSessions; context is rebuilt each render
  const items = useMemo(() => {
    const result: PaletteItem[] = []

    // Registry commands
    for (const cmd of getCommands(context)) {
      result.push({
        id: cmd.id,
        label: cmd.label,
        description: cmd.description,
        icon: cmd.icon,
        section: cmd.section,
        keywords: cmd.keywords,
        action: () => {
          toggleCommandPalette()
          cmd.execute(context)
        },
      })
    }

    // Recent sessions
    for (const session of recentSessions) {
      const label = session.title || session.cwd.split('/').pop() || 'Untitled'
      result.push({
        id: `resume-${session.id}`,
        label,
        description: `${session.cwd} · ${timeAgo(session.updated_at)}`,
        icon: RotateCcw,
        section: 'recent',
        action: () => handleResumeSession(session),
      })
    }

    return result
  }, [sessionId, activeSessionId, toggleCommandPalette, recentSessions, context.model])

  const filtered = items.filter((item) => {
    const q = query.toLowerCase()
    if (item.label.toLowerCase().includes(q)) return true
    if (item.description.toLowerCase().includes(q)) return true
    if (item.keywords?.some((kw) => kw.toLowerCase().includes(q))) return true
    return false
  })

  // Group filtered commands by section
  const sessionCmds = filtered.filter((c) => c.section === 'session')
  const globalCmds = filtered.filter((c) => c.section === 'global')
  const recentCmds = filtered.filter((c) => c.section === 'recent')
  const sections = [sessionCmds, globalCmds, recentCmds].filter((s) => s.length > 0)
  const showSections = sections.length > 1

  const flatList = [...sessionCmds, ...globalCmds, ...recentCmds]

  // Cmd+K / Ctrl+K toggle and Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        toggleCommandPalette()
      }
      if (e.key === 'Escape' && commandPaletteOpen) {
        toggleCommandPalette()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [commandPaletteOpen, toggleCommandPalette])

  useEffect(() => {
    if (commandPaletteOpen) {
      setQuery('')
      setSelectedIdx(0)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [commandPaletteOpen])

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional trigger on query change
  useEffect(() => {
    setSelectedIdx(0)
  }, [query])

  useEffect(() => {
    if (!listRef.current) return
    const buttons = listRef.current.querySelectorAll('button')
    buttons[selectedIdx]?.scrollIntoView({ block: 'nearest' })
  }, [selectedIdx])

  function handleInputKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIdx((i) => (i <= 0 ? flatList.length - 1 : i - 1))
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIdx((i) => (i >= flatList.length - 1 ? 0 : i + 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      flatList[selectedIdx]?.action()
    }
  }

  const isMac = typeof navigator !== 'undefined' && navigator.platform.includes('Mac')

  if (!commandPaletteOpen) return null

  let globalIdx = 0

  return (
    <AnimatePresence>
      {commandPaletteOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center pt-[18vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.1 }}
        >
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
            onClick={toggleCommandPalette}
          />

          <motion.div
            className="relative w-full max-w-105 overflow-hidden rounded-xl border border-base-border/80 bg-base-surface/95 shadow-[0_20px_60px_rgba(0,0,0,0.5)] backdrop-blur-xl"
            initial={{ scale: 0.96, opacity: 0, y: -10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: -10 }}
            transition={{ duration: 0.12, ease: [0.32, 0.72, 0, 1] }}
          >
            <div className="flex items-center gap-2.5 border-base-border-subtle/80 border-b px-4 py-3">
              <Search size={14} className="shrink-0 text-base-text-muted" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder="Type a command..."
                className="flex-1 bg-transparent text-base-text text-sm placeholder-base-text-muted outline-none"
                spellCheck={false}
              />
              <kbd className="rounded border border-base-border/70 bg-base-raised/60 px-1.5 py-0.5 text-[10px] text-base-text-muted leading-none">
                {isMac ? '⌘K' : 'Ctrl+K'}
              </kbd>
            </div>

            <div ref={listRef} className="max-h-75 overflow-y-auto p-1.5">
              {flatList.length === 0 ? (
                <div className="px-3 py-8 text-center text-base-text-muted text-xs">
                  No matching commands
                </div>
              ) : (
                <>
                  {sessionCmds.length > 0 && (
                    <>
                      {showSections && (
                        <div className="px-3 pt-1 pb-1.5 font-medium text-[10px] text-base-text-faint uppercase tracking-wider">
                          Session
                        </div>
                      )}
                      {sessionCmds.map((cmd) => {
                        const idx = globalIdx++
                        return (
                          <CommandRow
                            key={cmd.id}
                            cmd={cmd}
                            isSelected={idx === selectedIdx}
                            onSelect={() => setSelectedIdx(idx)}
                          />
                        )
                      })}
                    </>
                  )}

                  {globalCmds.length > 0 && (
                    <>
                      {showSections && (
                        <div className="px-3 pt-2.5 pb-1.5 font-medium text-[10px] text-base-text-faint uppercase tracking-wider">
                          General
                        </div>
                      )}
                      {globalCmds.map((cmd) => {
                        const idx = globalIdx++
                        return (
                          <CommandRow
                            key={cmd.id}
                            cmd={cmd}
                            isSelected={idx === selectedIdx}
                            onSelect={() => setSelectedIdx(idx)}
                          />
                        )
                      })}
                    </>
                  )}

                  {recentCmds.length > 0 && (
                    <>
                      {showSections && (
                        <div className="px-3 pt-2.5 pb-1.5 font-medium text-[10px] text-base-text-faint uppercase tracking-wider">
                          Recent sessions
                        </div>
                      )}
                      {recentCmds.map((cmd) => {
                        const idx = globalIdx++
                        return (
                          <CommandRow
                            key={cmd.id}
                            cmd={cmd}
                            isSelected={idx === selectedIdx}
                            onSelect={() => setSelectedIdx(idx)}
                          />
                        )
                      })}
                    </>
                  )}
                </>
              )}
            </div>

            <div className="flex items-center gap-3 border-base-border-subtle/60 border-t px-4 py-2">
              <span className="flex items-center gap-1 text-[10px] text-base-text-faint">
                <kbd className="rounded border border-base-border/50 bg-base-raised/40 px-1 py-px text-[10px]">
                  ↑↓
                </kbd>
                navigate
              </span>
              <span className="flex items-center gap-1 text-[10px] text-base-text-faint">
                <kbd className="rounded border border-base-border/50 bg-base-raised/40 px-1 py-px text-[10px]">
                  ↵
                </kbd>
                run
              </span>
              <span className="flex items-center gap-1 text-[10px] text-base-text-faint">
                <kbd className="rounded border border-base-border/50 bg-base-raised/40 px-1 py-px text-[10px]">
                  esc
                </kbd>
                close
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function CommandRow({
  cmd,
  isSelected,
  onSelect,
}: {
  cmd: PaletteItem
  isSelected: boolean
  onSelect: () => void
}) {
  const Icon = cmd.icon
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault()
        cmd.action()
      }}
      onMouseEnter={onSelect}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors duration-75 ${
        isSelected ? 'bg-base-raised/90' : 'hover:bg-base-raised/40'
      }`}
    >
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition-colors duration-75 ${
          isSelected
            ? 'border-base-border/60 bg-base-border/50 text-base-text'
            : 'border-base-border/40 bg-base-raised/40 text-base-text-muted'
        }`}
      >
        <Icon size={14} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-base-text text-sm transition-colors duration-75">{cmd.label}</p>
        <p className="text-base-text-muted text-xs leading-tight">{cmd.description}</p>
      </div>
    </button>
  )
}
