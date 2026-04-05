import { AnimatePresence, motion } from 'motion/react'
import { useEffect } from 'react'
import { useUiStore } from '../store/ui-store'

const SHORTCUT_SECTIONS = [
  {
    title: 'Navigation',
    shortcuts: [
      { keys: '⌘K', label: 'Command palette' },
      { keys: '⌘N', label: 'New tab' },
      { keys: '⌘1–9', label: 'Switch to tab' },
      { keys: '/', label: 'Slash commands (in input)' },
    ],
  },
  {
    title: 'Panels',
    shortcuts: [
      { keys: '⌘⇧F', label: 'Toggle flow panel' },
      { keys: '⌘⇧C', label: 'Toggle changed files' },
      { keys: '⌘⇧I', label: 'Toggle session info' },
    ],
  },
  {
    title: 'Chat',
    shortcuts: [
      { keys: 'Enter', label: 'Send message' },
      { keys: 'Shift+Enter', label: 'New line' },
      { keys: 'Esc', label: 'Close overlay or palette' },
    ],
  },
  {
    title: 'Quick reference',
    shortcuts: [
      { keys: '⌘?', label: 'This shortcut reference' },
      { keys: '⌘,', label: 'Open settings' },
    ],
  },
]

export function KeyboardShortcuts() {
  const open = useUiStore((s) => s.shortcutsOpen)
  const setOpen = useUiStore((s) => s.setShortcutsOpen)

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // ⌘? (⌘+Shift+/) toggles shortcuts
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === '/') {
        e.preventDefault()
        setOpen(!open)
      }
      if (e.key === 'Escape' && open) {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, setOpen])

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
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
            onClick={() => setOpen(false)}
          />
          <motion.div
            className="relative w-full max-w-sm overflow-hidden rounded-xl border border-base-border/80 bg-base-surface/95 shadow-[0_20px_60px_rgba(0,0,0,0.5)] backdrop-blur-xl"
            initial={{ scale: 0.96, opacity: 0, y: -10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: -10 }}
            transition={{ duration: 0.12, ease: [0.32, 0.72, 0, 1] }}
          >
            <div className="border-base-border-subtle/80 border-b px-4 py-3">
              <h2 className="font-medium text-base-text text-sm">Keyboard Shortcuts</h2>
            </div>
            <div className="space-y-4 px-4 py-3">
              {SHORTCUT_SECTIONS.map((section) => (
                <div key={section.title}>
                  <p className="mb-1.5 font-medium text-[10px] text-base-text-faint uppercase tracking-wider">
                    {section.title}
                  </p>
                  <div className="space-y-1">
                    {section.shortcuts.map((s) => (
                      <div key={s.keys} className="flex items-center justify-between py-0.5">
                        <span className="text-base-text-secondary text-xs">{s.label}</span>
                        <kbd className="rounded border border-base-border/60 bg-base-raised/50 px-1.5 py-0.5 font-mono text-[10px] text-base-text-muted">
                          {s.keys}
                        </kbd>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="border-base-border-subtle/60 border-t px-4 py-2">
              <p className="text-[10px] text-base-text-faint">
                Press{' '}
                <kbd className="rounded border border-base-border/50 bg-base-raised/40 px-1 py-px text-[10px]">
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
