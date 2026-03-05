import { useState, useEffect, useRef } from 'react'
import { Search, FolderOpen, Plus, RotateCcw } from 'lucide-react'
import { useUiStore } from '../store/ui-store'
import { useTabStore } from '../store/tab-store'

type Command = {
  id: string
  label: string
  description?: string
  icon: React.ReactNode
  action: () => void
}

export function CommandPalette() {
  const { commandPaletteOpen, toggleCommandPalette } = useUiStore()
  const { addTab } = useTabStore()
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const [selectedIdx, setSelectedIdx] = useState(0)

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
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [commandPaletteOpen])

  const commands: Command[] = [
    {
      id: 'open-folder',
      label: 'Open Folder',
      description: 'Open a project folder in a new tab',
      icon: <FolderOpen size={15} />,
      action: async () => {
        toggleCommandPalette()
        const path = await window.api.openFolder()
        if (path) addTab(path)
      },
    },
    {
      id: 'new-tab',
      label: 'New Tab',
      description: 'Open a new tab',
      icon: <Plus size={15} />,
      action: async () => {
        toggleCommandPalette()
        const path = await window.api.openFolder()
        if (path) addTab(path)
      },
    },
    {
      id: 'resume-session',
      label: 'Resume Session',
      description: 'Resume a previous session',
      icon: <RotateCcw size={15} />,
      action: () => {
        toggleCommandPalette()
      },
    },
  ]

  const filtered = commands.filter(
    (cmd) =>
      cmd.label.toLowerCase().includes(query.toLowerCase()) ||
      (cmd.description ?? '').toLowerCase().includes(query.toLowerCase())
  )

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIdx((i) => Math.max(0, i - 1))
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIdx((i) => Math.min(filtered.length - 1, i + 1))
    } else if (e.key === 'Enter') {
      filtered[selectedIdx]?.action()
    }
  }

  if (!commandPaletteOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-32">
      <div
        className="absolute inset-0 bg-black/60"
        onClick={toggleCommandPalette}
      />
      <div className="relative w-full max-w-lg overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl">
        <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-3">
          <Search size={16} className="flex-shrink-0 text-zinc-500" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIdx(0) }}
            onKeyDown={handleKeyDown}
            placeholder="Type a command..."
            className="flex-1 bg-transparent text-sm text-zinc-100 placeholder-zinc-600 outline-none"
          />
          <kbd className="rounded border border-zinc-700 px-1.5 py-0.5 text-xs text-zinc-600">Esc</kbd>
        </div>

        <div className="max-h-64 overflow-y-auto p-1">
          {filtered.length === 0 && (
            <div className="py-8 text-center text-sm text-zinc-600">No commands found</div>
          )}
          {filtered.map((cmd, i) => (
            <button
              key={cmd.id}
              onMouseDown={(e) => { e.preventDefault(); cmd.action() }}
              onMouseEnter={() => setSelectedIdx(i)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                i === selectedIdx ? 'bg-zinc-800' : 'hover:bg-zinc-800/50'
              }`}
            >
              <span className="text-zinc-500">{cmd.icon}</span>
              <div>
                <p className="text-sm text-zinc-200">{cmd.label}</p>
                {cmd.description && (
                  <p className="text-xs text-zinc-500">{cmd.description}</p>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
