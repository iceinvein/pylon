import { useState, useEffect, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Search, FolderOpen, Archive, DollarSign, RotateCcw, GitCommit, Eraser } from 'lucide-react'
import { useUiStore } from '../store/ui-store'
import { useTabStore } from '../store/tab-store'
import { useSessionStore } from '../store/session-store'
import type { SessionState } from '../store/session-store'
import { timeAgo } from '../lib/utils'
import { extractChangedFiles } from '../lib/extract-changed-files'

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

type Command = {
  id: string
  label: string
  description: string
  icon: typeof Search
  section: 'session' | 'global' | 'recent'
  action: () => void
}

export function CommandPalette() {
  const { commandPaletteOpen, toggleCommandPalette } = useUiStore()
  const { tabs, activeTabId, addTab, updateTab } = useTabStore()
  const setSession = useSessionStore((s) => s.setSession)
  const setMessages = useSessionStore((s) => s.setMessages)
  const addChangedFile = useSessionStore((s) => s.addChangedFile)
  const clearTasks = useSessionStore((s) => s.clearTasks)
  const [query, setQuery] = useState('')
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [recentSessions, setRecentSessions] = useState<StoredSession[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const activeTab = tabs.find((t) => t.id === activeTabId)
  const sessionId = activeTab?.sessionId ?? null

  // Load recent sessions when palette opens
  useEffect(() => {
    if (!commandPaletteOpen) return
    window.api.listSessions().then((sessions) => {
      // Filter out sessions already open in tabs
      const openSessionIds = new Set(tabs.map((t) => t.sessionId).filter(Boolean))
      const available = (sessions as StoredSession[]).filter((s) => !openSessionIds.has(s.id))
      setRecentSessions(available.slice(0, 5))
    })
  }, [commandPaletteOpen, tabs])

  async function handleResumeSession(session: StoredSession) {
    toggleCommandPalette()

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

    // Rebuild changed files list from historical messages
    for (const filePath of extractChangedFiles(parsed)) {
      addChangedFile(session.id, filePath)
    }

    await window.api.resumeSession(session.id)
    addTab(session.cwd, session.title || session.cwd.split('/').pop() || session.cwd, session.id)
  }

  const commands = useMemo(() => {
    const cmds: Command[] = []

    // Session-specific commands — only show when a session is active
    if (sessionId && activeTabId) {
      cmds.push(
        {
          id: 'clear',
          label: 'Clear chat',
          description: 'Clear conversation and start fresh in this tab',
          icon: Eraser,
          section: 'session',
          action: async () => {
            toggleCommandPalette()
            // Stop current session if running
            try { await window.api.stopSession(sessionId) } catch {}
            // Clean up session data from store
            setMessages(sessionId, [])
            clearTasks(sessionId)
            // Clear tab's session — next message triggers ensureSession() for a fresh one
            updateTab(activeTabId, { sessionId: null })
          },
        },
        {
          id: 'commit',
          label: 'Commit',
          description: 'Commit current changes with AI-generated message',
          icon: GitCommit,
          section: 'session',
          action: async () => {
            toggleCommandPalette()
            // Append user message to store so ChatView can detect the commit turn
            useSessionStore.getState().appendMessage(sessionId, { type: 'user', content: 'commit' })
            await window.api.sendMessage(sessionId, 'commit', [])
          },
        },
        {
          id: 'compact',
          label: 'Compact conversation',
          description: 'Summarize and compress history to save context',
          icon: Archive,
          section: 'session',
          action: async () => {
            toggleCommandPalette()
            await window.api.sendMessage(sessionId, '/compact', [])
          },
        },
        {
          id: 'cost',
          label: 'Show cost',
          description: 'Display token usage and cost',
          icon: DollarSign,
          section: 'session',
          action: async () => {
            toggleCommandPalette()
            await window.api.sendMessage(sessionId, '/cost', [])
          },
        }
      )
    }

    // Global commands
    cmds.push({
      id: 'open-folder',
      label: 'Open folder',
      description: 'Open a project folder in a new tab',
      icon: FolderOpen,
      section: 'global',
      action: async () => {
        toggleCommandPalette()
        const path = await window.api.openFolder()
        if (path) addTab(path)
      },
    })

    // Recent sessions as individual commands
    for (const session of recentSessions) {
      const label = session.title || session.cwd.split('/').pop() || 'Untitled'
      cmds.push({
        id: `resume-${session.id}`,
        label,
        description: `${session.cwd} · ${timeAgo(session.updated_at)}`,
        icon: RotateCcw,
        section: 'recent',
        action: () => handleResumeSession(session),
      })
    }

    return cmds
  }, [sessionId, activeTabId, toggleCommandPalette, addTab, updateTab, setMessages, clearTasks, recentSessions])

  const filtered = commands.filter(
    (cmd) =>
      cmd.label.toLowerCase().includes(query.toLowerCase()) ||
      cmd.description.toLowerCase().includes(query.toLowerCase())
  )

  // Group filtered commands by section
  const sessionCmds = filtered.filter((c) => c.section === 'session')
  const globalCmds = filtered.filter((c) => c.section === 'global')
  const recentCmds = filtered.filter((c) => c.section === 'recent')
  const sections = [sessionCmds, globalCmds, recentCmds].filter((s) => s.length > 0)
  const showSections = sections.length > 1

  // Flat list for keyboard navigation (session → global → recent)
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

  // Reset on open
  useEffect(() => {
    if (commandPaletteOpen) {
      setQuery('')
      setSelectedIdx(0)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [commandPaletteOpen])

  // Reset selection on query change
  useEffect(() => {
    setSelectedIdx(0)
  }, [query])

  // Scroll selected into view
  useEffect(() => {
    if (!listRef.current) return
    // Find the actual button elements (skip section headers)
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

  // Track the global index across sections for highlighting
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
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
            onClick={toggleCommandPalette}
          />

          {/* Palette */}
          <motion.div
            className="relative w-full max-w-[420px] overflow-hidden rounded-xl border border-stone-700/80 bg-stone-900/95 shadow-[0_20px_60px_rgba(0,0,0,0.5)] backdrop-blur-xl"
            initial={{ scale: 0.96, opacity: 0, y: -10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: -10 }}
            transition={{ duration: 0.12, ease: [0.32, 0.72, 0, 1] }}
          >
            {/* Search input */}
            <div className="flex items-center gap-2.5 border-b border-stone-800/80 px-4 py-3">
              <Search size={14} className="flex-shrink-0 text-stone-500" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder="Type a command..."
                className="flex-1 bg-transparent text-sm text-stone-200 placeholder-stone-500 outline-none"
                spellCheck={false}
              />
              <kbd className="rounded border border-stone-700/70 bg-stone-800/60 px-1.5 py-0.5 text-[10px] leading-none text-stone-500">
                {isMac ? '⌘K' : 'Ctrl+K'}
              </kbd>
            </div>

            {/* Command list */}
            <div ref={listRef} className="max-h-[300px] overflow-y-auto p-1.5">
              {flatList.length === 0 ? (
                <div className="px-3 py-8 text-center text-xs text-stone-500">
                  No matching commands
                </div>
              ) : (
                <>
                  {/* Session commands */}
                  {sessionCmds.length > 0 && (
                    <>
                      {showSections && (
                        <div className="px-3 pt-1 pb-1.5 text-[10px] font-medium uppercase tracking-wider text-stone-600">
                          Session
                        </div>
                      )}
                      {sessionCmds.map((cmd) => {
                        const idx = globalIdx++
                        return <CommandRow key={cmd.id} cmd={cmd} isSelected={idx === selectedIdx} onSelect={() => setSelectedIdx(idx)} />
                      })}
                    </>
                  )}

                  {/* Global commands */}
                  {globalCmds.length > 0 && (
                    <>
                      {showSections && (
                        <div className="px-3 pt-2.5 pb-1.5 text-[10px] font-medium uppercase tracking-wider text-stone-600">
                          General
                        </div>
                      )}
                      {globalCmds.map((cmd) => {
                        const idx = globalIdx++
                        return <CommandRow key={cmd.id} cmd={cmd} isSelected={idx === selectedIdx} onSelect={() => setSelectedIdx(idx)} />
                      })}
                    </>
                  )}

                  {/* Recent sessions */}
                  {recentCmds.length > 0 && (
                    <>
                      {showSections && (
                        <div className="px-3 pt-2.5 pb-1.5 text-[10px] font-medium uppercase tracking-wider text-stone-600">
                          Recent sessions
                        </div>
                      )}
                      {recentCmds.map((cmd) => {
                        const idx = globalIdx++
                        return <CommandRow key={cmd.id} cmd={cmd} isSelected={idx === selectedIdx} onSelect={() => setSelectedIdx(idx)} />
                      })}
                    </>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center gap-3 border-t border-stone-800/60 px-4 py-2">
              <span className="flex items-center gap-1 text-[10px] text-stone-600">
                <kbd className="rounded border border-stone-700/50 bg-stone-800/40 px-1 py-px text-[9px]">↑↓</kbd>
                navigate
              </span>
              <span className="flex items-center gap-1 text-[10px] text-stone-600">
                <kbd className="rounded border border-stone-700/50 bg-stone-800/40 px-1 py-px text-[9px]">↵</kbd>
                run
              </span>
              <span className="flex items-center gap-1 text-[10px] text-stone-600">
                <kbd className="rounded border border-stone-700/50 bg-stone-800/40 px-1 py-px text-[9px]">esc</kbd>
                close
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function CommandRow({ cmd, isSelected, onSelect }: { cmd: Command; isSelected: boolean; onSelect: () => void }) {
  const Icon = cmd.icon
  return (
    <button
      onMouseDown={(e) => {
        e.preventDefault()
        cmd.action()
      }}
      onMouseEnter={onSelect}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors duration-75 ${
        isSelected ? 'bg-stone-800/90' : 'hover:bg-stone-800/40'
      }`}
    >
      <div
        className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border transition-colors duration-75 ${
          isSelected
            ? 'border-stone-600/60 bg-stone-700/50 text-stone-300'
            : 'border-stone-700/40 bg-stone-800/40 text-stone-500'
        }`}
      >
        <Icon size={14} />
      </div>
      <div className="min-w-0 flex-1">
        <p className={`text-sm transition-colors duration-75 ${isSelected ? 'text-stone-200' : 'text-stone-300'}`}>
          {cmd.label}
        </p>
        <p className="text-[11px] leading-tight text-stone-500">{cmd.description}</p>
      </div>
    </button>
  )
}
