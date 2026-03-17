# Command Registry Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract slash command definitions from CommandPalette into a registry module, add 3 new commands (help, config, status), and make CommandPalette a pure consumer.

**Architecture:** A single renderer-side module (`command-registry.ts`) exports types, a COMMANDS array, and query functions. CommandPalette imports from the registry instead of defining commands inline. Commands import Zustand stores and `window.api` directly.

**Tech Stack:** TypeScript, Zustand, Lucide React icons, bun:test

**Spec:** `docs/superpowers/specs/2026-03-17-command-registry-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `src/renderer/src/lib/command-registry.ts` | **New** — SlashCommand/CommandContext types, COMMANDS array (8 commands), `getCommands()`, `findCommand()` |
| `src/renderer/src/lib/command-registry.test.ts` | **New** — Unit tests for getCommands filtering, findCommand lookup, no duplicate IDs |
| `src/renderer/src/components/CommandPalette.tsx` | **Modified** — Remove inline Command type + useMemo command block, import registry, add keywords to text filter |

---

## Chunk 1: Registry Module + Tests

### Task 1: Write registry tests

**Files:**
- Create: `src/renderer/src/lib/command-registry.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
import { describe, expect, test } from 'bun:test'
import { COMMANDS, getCommands, findCommand } from './command-registry'
import type { CommandContext } from './command-registry'

const fullContext: CommandContext = {
  sessionId: 'test-session-123',
  activeTabId: 'tab-1',
  cwd: '/Users/test/project',
  model: 'claude-opus-4-6',
  permissionMode: 'default',
}

const noSessionContext: CommandContext = {
  sessionId: null,
  activeTabId: null,
  cwd: null,
  model: 'claude-opus-4-6',
  permissionMode: 'default',
}

describe('command-registry', () => {
  test('COMMANDS has no duplicate IDs', () => {
    const ids = COMMANDS.map((c) => c.id)
    const unique = new Set(ids)
    expect(unique.size).toBe(ids.length)
  })

  describe('getCommands', () => {
    test('returns all commands when sessionId is present', () => {
      const cmds = getCommands(fullContext)
      expect(cmds.length).toBe(COMMANDS.length)
    })

    test('filters out requiresSession commands when sessionId is null', () => {
      const cmds = getCommands(noSessionContext)
      const sessionCmds = COMMANDS.filter((c) => c.requiresSession)
      const globalCmds = COMMANDS.filter((c) => !c.requiresSession)
      expect(cmds.length).toBe(globalCmds.length)
      for (const cmd of cmds) {
        expect(cmd.requiresSession).toBe(false)
      }
      expect(cmds.length).toBeLessThan(COMMANDS.length)
      expect(sessionCmds.length).toBeGreaterThan(0)
    })
  })

  describe('findCommand', () => {
    test('returns the correct command by ID', () => {
      const cmd = findCommand('clear')
      expect(cmd).toBeDefined()
      expect(cmd!.id).toBe('clear')
      expect(cmd!.label).toBe('Clear chat')
    })

    test('returns undefined for unknown IDs', () => {
      expect(findCommand('nonexistent')).toBeUndefined()
    })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/renderer/src/lib/command-registry.test.ts`
Expected: FAIL — `command-registry` module does not exist yet

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/lib/command-registry.test.ts
git commit -m "test: add command registry tests (red)"
```

---

### Task 2: Implement the registry module

**Files:**
- Create: `src/renderer/src/lib/command-registry.ts`

- [ ] **Step 1: Write the registry module**

This is the core module. It defines the types, all 8 commands, and the query functions. Each command's `execute` imports stores directly.

```typescript
import type { LucideIcon } from 'lucide-react'
import {
  Archive,
  DollarSign,
  Eraser,
  FolderOpen,
  GitCommit,
  HelpCircle,
  Info,
  Settings,
} from 'lucide-react'
import { useSessionStore } from '../store/session-store'
import { useTabStore } from '../store/tab-store'
import { useUiStore } from '../store/ui-store'

export type CommandContext = {
  sessionId: string | null
  activeTabId: string | null
  cwd: string | null
  model: string
  permissionMode: string
}

export type SlashCommand = {
  id: string
  label: string
  description: string
  icon: LucideIcon
  section: 'session' | 'global'
  requiresSession: boolean
  keywords?: string[]
  execute: (context: CommandContext) => void | Promise<void>
}

export const COMMANDS: SlashCommand[] = [
  // ── Session commands ──
  {
    id: 'clear',
    label: 'Clear chat',
    description: 'Clear conversation and start fresh in this tab',
    icon: Eraser,
    section: 'session',
    requiresSession: true,
    execute: async (ctx) => {
      if (!ctx.sessionId || !ctx.activeTabId) return
      try {
        await window.api.stopSession(ctx.sessionId)
      } catch {}
      useSessionStore.getState().setMessages(ctx.sessionId, [])
      useSessionStore.getState().clearTasks(ctx.sessionId)
      useTabStore.getState().updateTab(ctx.activeTabId, { sessionId: null })
    },
  },
  {
    id: 'commit',
    label: 'Commit',
    description: 'Commit current changes with AI-generated message',
    icon: GitCommit,
    section: 'session',
    requiresSession: true,
    keywords: ['git'],
    execute: async (ctx) => {
      if (!ctx.sessionId) return
      useSessionStore.getState().appendMessage(ctx.sessionId, { type: 'user', content: 'commit' })
      await window.api.sendMessage(ctx.sessionId, 'commit', [])
    },
  },
  {
    id: 'compact',
    label: 'Compact conversation',
    description: 'Summarize and compress history to save context',
    icon: Archive,
    section: 'session',
    requiresSession: true,
    keywords: ['summarize', 'compress'],
    execute: async (ctx) => {
      if (!ctx.sessionId) return
      await window.api.sendMessage(ctx.sessionId, '/compact', [])
    },
  },
  {
    id: 'cost',
    label: 'Show cost',
    description: 'Display token usage and cost',
    icon: DollarSign,
    section: 'session',
    requiresSession: true,
    keywords: ['tokens', 'usage', 'price'],
    execute: async (ctx) => {
      if (!ctx.sessionId) return
      await window.api.sendMessage(ctx.sessionId, '/cost', [])
    },
  },
  {
    id: 'status',
    label: 'Show status',
    description: 'Display session info, model, and cwd',
    icon: Info,
    section: 'session',
    requiresSession: true,
    keywords: ['info', 'session'],
    execute: (ctx) => {
      if (!ctx.sessionId) return
      const lines = [
        `**Model:** ${ctx.model}`,
        `**Directory:** ${ctx.cwd ?? 'unknown'}`,
        `**Permission mode:** ${ctx.permissionMode}`,
      ]
      useSessionStore.getState().appendMessage(ctx.sessionId, {
        type: 'system',
        content: lines.join('\n'),
      })
    },
  },

  // ── Global commands ──
  {
    id: 'help',
    label: 'Help',
    description: 'Show available commands',
    icon: HelpCircle,
    section: 'session',
    requiresSession: true,
    keywords: ['commands', 'list'],
    execute: (ctx) => {
      if (!ctx.sessionId) return
      const available = getCommands(ctx)
      const lines = available.map((c) => `**/${c.id}** — ${c.description}`)
      const content = `### Available commands\n\n${lines.join('\n')}`
      useSessionStore.getState().appendMessage(ctx.sessionId, {
        type: 'system',
        content,
      })
    },
  },
  {
    id: 'config',
    label: 'Settings',
    description: 'Open settings',
    icon: Settings,
    section: 'global',
    requiresSession: false,
    keywords: ['preferences', 'options'],
    execute: () => {
      useUiStore.getState().setSettingsOpen(true)
    },
  },
  {
    id: 'open-folder',
    label: 'Open folder',
    description: 'Open a project folder in a new tab',
    icon: FolderOpen,
    section: 'global',
    requiresSession: false,
    keywords: ['project', 'directory'],
    execute: async () => {
      const path = await window.api.openFolder()
      if (path) useTabStore.getState().addTab(path)
    },
  },
]

export function getCommands(context: CommandContext): SlashCommand[] {
  return COMMANDS.filter((cmd) => {
    if (cmd.requiresSession && !context.sessionId) return false
    return true
  })
}

export function findCommand(id: string): SlashCommand | undefined {
  return COMMANDS.find((cmd) => cmd.id === id)
}
```

- [ ] **Step 2: Run the tests to verify they pass**

Run: `bun test src/renderer/src/lib/command-registry.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 3: Run typecheck to verify no type errors**

Run: `bun run typecheck:web`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/lib/command-registry.ts
git commit -m "feat: add command registry with 8 slash commands"
```

---

## Chunk 2: CommandPalette Integration

### Task 3: Refactor CommandPalette to consume the registry

**Files:**
- Modify: `src/renderer/src/components/CommandPalette.tsx`

The changes:
1. Remove the inline `Command` type (lines 10-17)
2. Remove the `useMemo` command-building block (lines 50-151) and replace with registry call
3. Add `keywords` to the text filter (line 153-157)
4. Update `CommandRow` to call `execute` instead of `action`
5. Have the palette dismiss itself before calling `execute`

- [ ] **Step 1: Refactor CommandPalette**

Replace the entire `CommandPalette.tsx` with:

```tsx
import { RotateCcw, Search } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { getCommands, type CommandContext, type SlashCommand } from '../lib/command-registry'
import { resumeStoredSession, type StoredSession } from '../lib/resume-session'
import { timeAgo } from '../lib/utils'
import { useSessionStore } from '../store/session-store'
import { useTabStore } from '../store/tab-store'
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
  const { tabs, activeTabId, addTab } = useTabStore()
  const [query, setQuery] = useState('')
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [recentSessions, setRecentSessions] = useState<StoredSession[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const activeTab = tabs.find((t) => t.id === activeTabId)
  const sessionId = activeTab?.sessionId ?? null

  // Build the command context from current state
  // Note: permissionMode is local state in SessionView, not in the session store.
  // We default to 'default' here — the status command uses it for informational display only.
  const sessions = useSessionStore((s) => s.sessions)
  const session = sessionId ? sessions.get(sessionId) : undefined
  const context: CommandContext = {
    sessionId,
    activeTabId: activeTabId ?? null,
    cwd: activeTab?.cwd ?? null,
    model: session?.model ?? 'claude-opus-4-6',
    permissionMode: 'default',
  }

  // Load recent sessions when palette opens
  useEffect(() => {
    if (!commandPaletteOpen) return
    window.api.listSessions().then((sessions) => {
      const openSessionIds = new Set(tabs.map((t) => t.sessionId).filter(Boolean))
      const available = (sessions as StoredSession[]).filter((s) => !openSessionIds.has(s.id))
      setRecentSessions(available.slice(0, 10))
    })
  }, [commandPaletteOpen, tabs])

  async function handleResumeSession(session: StoredSession) {
    toggleCommandPalette()
    const { title } = await resumeStoredSession(session)
    addTab(session.cwd, title, session.id)
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
  }, [sessionId, activeTabId, toggleCommandPalette, addTab, recentSessions, context.model, context.cwd])

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
            className="relative w-full max-w-[420px] overflow-hidden rounded-xl border border-[var(--color-base-border)]/80 bg-[var(--color-base-surface)]/95 shadow-[0_20px_60px_rgba(0,0,0,0.5)] backdrop-blur-xl"
            initial={{ scale: 0.96, opacity: 0, y: -10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: -10 }}
            transition={{ duration: 0.12, ease: [0.32, 0.72, 0, 1] }}
          >
            <div className="flex items-center gap-2.5 border-[var(--color-base-border-subtle)]/80 border-b px-4 py-3">
              <Search size={14} className="flex-shrink-0 text-[var(--color-base-text-muted)]" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder="Type a command..."
                className="flex-1 bg-transparent text-[var(--color-base-text)] text-sm placeholder-[var(--color-base-text-muted)] outline-none"
                spellCheck={false}
              />
              <kbd className="rounded border border-[var(--color-base-border)]/70 bg-[var(--color-base-raised)]/60 px-1.5 py-0.5 text-[10px] text-[var(--color-base-text-muted)] leading-none">
                {isMac ? '⌘K' : 'Ctrl+K'}
              </kbd>
            </div>

            <div ref={listRef} className="max-h-[300px] overflow-y-auto p-1.5">
              {flatList.length === 0 ? (
                <div className="px-3 py-8 text-center text-[var(--color-base-text-muted)] text-xs">
                  No matching commands
                </div>
              ) : (
                <>
                  {sessionCmds.length > 0 && (
                    <>
                      {showSections && (
                        <div className="px-3 pt-1 pb-1.5 font-medium text-[10px] text-[var(--color-base-text-faint)] uppercase tracking-wider">
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
                        <div className="px-3 pt-2.5 pb-1.5 font-medium text-[10px] text-[var(--color-base-text-faint)] uppercase tracking-wider">
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
                        <div className="px-3 pt-2.5 pb-1.5 font-medium text-[10px] text-[var(--color-base-text-faint)] uppercase tracking-wider">
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

            <div className="flex items-center gap-3 border-[var(--color-base-border-subtle)]/60 border-t px-4 py-2">
              <span className="flex items-center gap-1 text-[10px] text-[var(--color-base-text-faint)]">
                <kbd className="rounded border border-[var(--color-base-border)]/50 bg-[var(--color-base-raised)]/40 px-1 py-px text-[9px]">
                  ↑↓
                </kbd>
                navigate
              </span>
              <span className="flex items-center gap-1 text-[10px] text-[var(--color-base-text-faint)]">
                <kbd className="rounded border border-[var(--color-base-border)]/50 bg-[var(--color-base-raised)]/40 px-1 py-px text-[9px]">
                  ↵
                </kbd>
                run
              </span>
              <span className="flex items-center gap-1 text-[10px] text-[var(--color-base-text-faint)]">
                <kbd className="rounded border border-[var(--color-base-border)]/50 bg-[var(--color-base-raised)]/40 px-1 py-px text-[9px]">
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
        isSelected ? 'bg-[var(--color-base-raised)]/90' : 'hover:bg-[var(--color-base-raised)]/40'
      }`}
    >
      <div
        className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border transition-colors duration-75 ${
          isSelected
            ? 'border-[var(--color-base-border)]/60 bg-[var(--color-base-border)]/50 text-[var(--color-base-text)]'
            : 'border-[var(--color-base-border)]/40 bg-[var(--color-base-raised)]/40 text-[var(--color-base-text-muted)]'
        }`}
      >
        <Icon size={14} />
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={`text-sm transition-colors duration-75 ${isSelected ? 'text-[var(--color-base-text)]' : 'text-[var(--color-base-text)]'}`}
        >
          {cmd.label}
        </p>
        <p className="text-[11px] text-[var(--color-base-text-muted)] leading-tight">
          {cmd.description}
        </p>
      </div>
    </button>
  )
}
```

Key changes from the original:
- Removed `Command` type → replaced with `PaletteItem` (internal to palette)
- Removed all command definitions from `useMemo` → replaced with `getCommands(context)` loop
- Removed store action selectors (`setMessages`, `clearTasks`, `updateTab`) — the registry handles those
- Added `context` construction from Zustand stores
- Added `keywords` to text filter
- Palette calls `toggleCommandPalette()` before `cmd.execute(context)` in the PaletteItem's `action`

- [ ] **Step 2: Run typecheck**

Run: `bun run typecheck:web`
Expected: No errors

- [ ] **Step 3: Run lint**

Run: `bun run lint`
Expected: No errors (or only pre-existing ones)

- [ ] **Step 4: Run all tests**

Run: `bun test`
Expected: All pass including the new registry tests

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/CommandPalette.tsx
git commit -m "refactor: make CommandPalette consume command registry"
```

---

## Chunk 3: Verification

### Task 4: Manual verification

- [ ] **Step 1: Start dev server**

Run: `bun run dev`

- [ ] **Step 2: Verify existing commands work**

1. Open a folder and start a session
2. Press Cmd+K — palette opens with session + global commands
3. Type `/` in InputBar — palette opens
4. Select "Clear chat" — session resets
5. Select "Commit" — commit message appears in chat
6. Select "Compact conversation" — SDK processes /compact
7. Select "Show cost" — SDK processes /cost
8. Select "Open folder" — native folder picker opens

- [ ] **Step 3: Verify new commands work**

1. Press Cmd+K, select "Help" — system message with command list appears in chat
2. Press Cmd+K, select "Settings" — SettingsOverlay opens
3. Press Cmd+K, select "Show status" — system message with model/cwd/permission mode appears
4. Close the session tab — open palette without a session — only "Settings" and "Open folder" appear (all session commands including Help are hidden)

- [ ] **Step 4: Verify keyword search**

1. Cmd+K, type "git" — "Commit" should appear (has keyword "git")
2. Type "tokens" — "Show cost" should appear (has keyword "tokens")
3. Type "preferences" — "Settings" should appear (has keyword "preferences")

- [ ] **Step 5: Verify recent sessions still work**

1. With a previous session in history, open palette
2. Recent sessions section appears below commands
3. Clicking a recent session resumes it

- [ ] **Step 6: Run full verification suite**

Run: `bun run lint && bun run typecheck && bun test`
Expected: All pass
