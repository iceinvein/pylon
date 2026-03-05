import { useState, useEffect, useCallback } from 'react'
import { Zap } from 'lucide-react'

type SlashCommand = {
  name: string
  description: string
  value: string
}

const SLASH_COMMANDS: SlashCommand[] = [
  { name: 'help', description: 'Show available commands', value: '/help' },
  { name: 'clear', description: 'Clear the conversation', value: '/clear' },
  { name: 'compact', description: 'Compact conversation history', value: '/compact' },
  { name: 'model', description: 'Switch model', value: '/model ' },
  { name: 'cost', description: 'Show session cost', value: '/cost' },
]

type SlashCommandMenuProps = {
  query: string
  onSelect: (command: string) => void
  onClose: () => void
}

export function SlashCommandMenu({ query, onSelect, onClose }: SlashCommandMenuProps) {
  const [selectedIdx, setSelectedIdx] = useState(0)

  const filtered = SLASH_COMMANDS.filter(
    (cmd) =>
      cmd.name.toLowerCase().includes(query.toLowerCase()) ||
      cmd.description.toLowerCase().includes(query.toLowerCase())
  )

  useEffect(() => {
    setSelectedIdx(0)
  }, [query])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIdx((i) => Math.max(0, i - 1))
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIdx((i) => Math.min(filtered.length - 1, i + 1))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (filtered[selectedIdx]) {
          onSelect(filtered[selectedIdx].value)
        }
      } else if (e.key === 'Escape') {
        onClose()
      }
    },
    [filtered, selectedIdx, onSelect, onClose]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  if (filtered.length === 0) return null

  return (
    <div className="absolute bottom-full left-0 right-0 mb-1 rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl">
      <div className="p-1">
        {filtered.map((cmd, i) => (
          <button
            key={cmd.name}
            onMouseDown={(e) => {
              e.preventDefault()
              onSelect(cmd.value)
            }}
            onMouseEnter={() => setSelectedIdx(i)}
            className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors ${
              i === selectedIdx ? 'bg-zinc-800' : 'hover:bg-zinc-800/50'
            }`}
          >
            <Zap size={13} className="flex-shrink-0 text-zinc-500" />
            <span className="text-sm font-medium text-zinc-300">/{cmd.name}</span>
            <span className="text-xs text-zinc-500">{cmd.description}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
