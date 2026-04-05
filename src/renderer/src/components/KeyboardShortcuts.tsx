import { Keyboard, Search, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { useUiStore } from '../store/ui-store'

type Shortcut = {
  keys: string[]
  label: string
}

type ShortcutSection = {
  title: string
  shortcuts: Shortcut[]
}

const SHORTCUT_SECTIONS: ShortcutSection[] = [
  {
    title: 'Navigation',
    shortcuts: [
      { keys: ['⌘', 'N'], label: 'New tab' },
      { keys: ['⌘', '1–9'], label: 'Switch to tab by index' },
      { keys: ['⌘', 'K'], label: 'Command palette' },
      { keys: ['⌘', ','], label: 'Open settings' },
    ],
  },
  {
    title: 'Panels',
    shortcuts: [
      { keys: ['⌘', '⇧', 'F'], label: 'Toggle flow panel' },
      { keys: ['⌘', '⇧', 'C'], label: 'Toggle changed files panel' },
      { keys: ['⌘', '⇧', 'I'], label: 'Toggle session info panel' },
    ],
  },
  {
    title: 'Chat',
    shortcuts: [
      { keys: ['Enter'], label: 'Send message' },
      { keys: ['⇧', 'Enter'], label: 'New line in message' },
      { keys: ['/'], label: 'Slash commands (in input)' },
    ],
  },
  {
    title: 'General',
    shortcuts: [
      { keys: ['?'], label: 'Show keyboard shortcuts' },
      { keys: ['⌘', '?'], label: 'Show keyboard shortcuts (alternative)' },
      { keys: ['Esc'], label: 'Close overlay or palette' },
    ],
  },
]

/** Flatten all shortcuts for search filtering */
function searchSections(sections: ShortcutSection[], query: string): ShortcutSection[] {
  if (!query.trim()) return sections
  const q = query.toLowerCase()
  return sections
    .map((section) => ({
      ...section,
      shortcuts: section.shortcuts.filter(
        (s) =>
          s.label.toLowerCase().includes(q) ||
          s.keys.some((k) => k.toLowerCase().includes(q)) ||
          section.title.toLowerCase().includes(q),
      ),
    }))
    .filter((section) => section.shortcuts.length > 0)
}

export function KeyboardShortcuts() {
  const open = useUiStore((s) => s.shortcutsOpen)
  const setOpen = useUiStore((s) => s.setShortcutsOpen)
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  // Global keyboard handlers
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (document.activeElement as HTMLElement)?.tagName
      const isInInput = tag === 'INPUT' || tag === 'TEXTAREA'

      // ? without modifier when not in an input field
      if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey && !isInInput) {
        e.preventDefault()
        setOpen(!open)
        return
      }

      // ⌘? (⌘+Shift+/) as alternative
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === '/') {
        e.preventDefault()
        setOpen(!open)
        return
      }

      if (e.key === 'Escape' && open) {
        setOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, setOpen])

  // Focus search on open, reset query on close
  useEffect(() => {
    if (open) {
      setQuery('')
      requestAnimationFrame(() => searchRef.current?.focus())
    }
  }, [open])

  const filteredSections = searchSections(SHORTCUT_SECTIONS, query)

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.1 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
            onClick={() => setOpen(false)}
          />

          {/* Modal */}
          <motion.div
            className="relative w-full max-w-lg overflow-hidden rounded-xl border border-base-border/80 bg-base-surface/95 shadow-[0_20px_60px_rgba(0,0,0,0.5)] backdrop-blur-xl"
            initial={{ scale: 0.96, opacity: 0, y: -10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: -10 }}
            transition={{ duration: 0.12, ease: [0.32, 0.72, 0, 1] }}
            style={{ maxHeight: '70vh' }}
          >
            {/* Header */}
            <div className="flex items-center gap-3 border-base-border-subtle/80 border-b px-4 py-3">
              <Keyboard size={14} className="shrink-0 text-base-text-muted" />
              <h2 className="flex-1 font-medium text-base-text text-sm">Keyboard Shortcuts</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-base-text-muted transition-colors hover:bg-base-raised hover:text-base-text"
                aria-label="Close"
              >
                <X size={13} />
              </button>
            </div>

            {/* Search */}
            <div className="border-base-border-subtle/60 border-b px-4 py-2.5">
              <div className="flex items-center gap-2 rounded-md border border-base-border/60 bg-base-bg px-3 py-1.5">
                <Search size={12} className="shrink-0 text-base-text-faint" />
                <input
                  ref={searchRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Filter shortcuts..."
                  className="flex-1 bg-transparent text-base-text text-sm placeholder-base-text-faint outline-none"
                  spellCheck={false}
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    className="text-base-text-faint transition-colors hover:text-base-text-muted"
                  >
                    <X size={11} />
                  </button>
                )}
              </div>
            </div>

            {/* Shortcuts list */}
            <div className="overflow-y-auto" style={{ maxHeight: 'calc(70vh - 130px)' }}>
              {filteredSections.length === 0 ? (
                <div className="px-4 py-8 text-center text-base-text-muted text-xs">
                  No shortcuts match "{query}"
                </div>
              ) : (
                <div className="py-2">
                  {filteredSections.map((section, sectionIdx) => (
                    <motion.div
                      key={section.title}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        duration: 0.2,
                        ease: [0.25, 1, 0.5, 1],
                        delay: sectionIdx * 0.03,
                      }}
                    >
                      <div className="px-4 pt-3 pb-1 first:pt-2">
                        <span className="font-medium text-[10px] text-base-text-muted uppercase tracking-wider">
                          {section.title}
                        </span>
                      </div>
                      {section.shortcuts.map((shortcut) => (
                        <ShortcutRow key={shortcut.label} shortcut={shortcut} />
                      ))}
                    </motion.div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center gap-3 border-base-border-subtle/60 border-t px-4 py-2">
              <p className="text-[10px] text-base-text-faint">
                Press{' '}
                <kbd className="rounded border border-base-border/50 bg-base-raised/40 px-1 py-px font-mono text-[9px]">
                  esc
                </kbd>{' '}
                to close
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function ShortcutRow({ shortcut }: { shortcut: Shortcut }) {
  return (
    <div className="flex items-center justify-between px-4 py-1.5 transition-colors hover:bg-base-raised/30">
      <span className="text-base-text-secondary text-sm">{shortcut.label}</span>
      <div className="flex items-center gap-1">
        {shortcut.keys.map((key, i) => (
          <kbd
            key={`${key}-${i}`}
            className="inline-flex items-center rounded border border-base-border/60 bg-base-bg px-1.5 py-0.5 font-mono text-[10px] text-base-text-muted leading-none"
          >
            {key}
          </kbd>
        ))}
      </div>
    </div>
  )
}
