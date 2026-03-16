import { AlertTriangle, Check, Loader2, Play, Send, X } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import type { CommandEntry, ConflictResolution } from '../../../../shared/git-types'
import { useGitOpsStore } from '../../store/git-ops-store'
import { ConflictResolver } from './ConflictResolver'

type GitOpsTabProps = {
  cwd: string
  sessionId: string | null
}

const riskColors = {
  safe: 'border-emerald-800 bg-emerald-950/30',
  moderate: 'border-yellow-800 bg-yellow-950/30',
  destructive: 'border-red-800 bg-red-950/30',
}

const riskLabels = {
  safe: { text: 'Safe', color: 'text-emerald-400' },
  moderate: { text: 'Caution', color: 'text-yellow-400' },
  destructive: { text: 'Destructive', color: 'text-red-400' },
}

function CommandEntryCard({
  entry,
  onConfirm,
  onCancel,
}: {
  entry: CommandEntry
  onConfirm: () => void
  onCancel: () => void
}) {
  const plan = entry.plan
  return (
    <div className="mb-2">
      <p className="mb-1 text-stone-300 text-xs">▸ {entry.request}</p>

      {entry.status === 'pending' && (
        <div className="flex items-center gap-2 pl-3">
          <Loader2 size={11} className="animate-spin text-stone-600" />
          <span className="text-[10px] text-stone-500">Interpreting...</span>
        </div>
      )}

      {plan && entry.status === 'planned' && (
        <div className={`ml-3 rounded-lg border p-2.5 ${riskColors[plan.riskLevel]}`}>
          <div className="flex items-center justify-between">
            <p className="text-stone-300 text-xs">{plan.interpretation}</p>
            <span className={`font-medium text-[10px] ${riskLabels[plan.riskLevel].color}`}>
              {riskLabels[plan.riskLevel].text}
            </span>
          </div>
          <div className="mt-2 space-y-1">
            {plan.commands.map((cmd, i) => (
              <div key={i} className="flex items-start gap-2">
                <code className="font-[family-name:var(--font-mono)] text-[10px] text-amber-400/80">
                  {cmd.command}
                </code>
              </div>
            ))}
          </div>
          {plan.warnings && plan.warnings.length > 0 && (
            <div className="mt-2 flex items-start gap-1.5">
              <AlertTriangle size={10} className="mt-0.5 flex-shrink-0 text-yellow-500" />
              <p className="text-[10px] text-yellow-400/80">{plan.warnings.join('. ')}</p>
            </div>
          )}
          <p className="mt-2 text-[10px] text-stone-500">{plan.preview}</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={onConfirm}
              className="flex items-center gap-1 rounded bg-emerald-600 px-2.5 py-1 text-[10px] text-white hover:bg-emerald-500"
            >
              <Play size={9} /> Confirm
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="rounded px-2.5 py-1 text-[10px] text-stone-500 hover:bg-stone-800 hover:text-stone-300"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {entry.status === 'executing' && (
        <div className="ml-3 flex items-center gap-2">
          <Loader2 size={11} className="animate-spin text-amber-500" />
          <span className="text-[10px] text-amber-400">Executing...</span>
        </div>
      )}

      {entry.status === 'completed' && (
        <div className="ml-3 flex items-center gap-2 text-emerald-400">
          <Check size={11} />
          <span className="text-[10px]">{entry.result || 'Done'}</span>
        </div>
      )}

      {entry.status === 'failed' && (
        <div className="ml-3 flex items-center gap-2 text-red-400">
          <X size={11} />
          <span className="text-[10px]">{entry.error || 'Failed'}</span>
        </div>
      )}
    </div>
  )
}

export function GitOpsTab({ cwd, sessionId }: GitOpsTabProps) {
  const {
    commandHistory,
    conflicts,
    error,
    submitCommand,
    confirmPlan,
    cancelPlan,
    applyResolutions,
  } = useGitOpsStore()
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSubmit = useCallback(() => {
    if (!input.trim() || !sessionId) return
    submitCommand(cwd, sessionId, input.trim())
    setInput('')
  }, [cwd, sessionId, input, submitCommand])

  const handleApplyResolutions = useCallback(
    (resolutions: ConflictResolution[]) => {
      applyResolutions(cwd, resolutions)
    },
    [cwd, applyResolutions],
  )

  if (conflicts.length > 0) {
    return (
      <ConflictResolver
        conflicts={conflicts}
        onApply={handleApplyResolutions}
        onCancel={() => useGitOpsStore.getState().setConflicts([])}
      />
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Command history */}
      <div className="flex-1 overflow-y-auto p-3">
        {commandHistory.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2">
            <p className="text-stone-600 text-xs">Type a git command in plain English</p>
            <p className="text-[10px] text-stone-700">
              e.g. "undo my last commit" or "squash the last 3 commits"
            </p>
          </div>
        ) : (
          commandHistory.map((entry) => (
            <CommandEntryCard
              key={entry.id}
              entry={entry}
              onConfirm={() => entry.plan && confirmPlan(cwd, entry.plan.id)}
              onCancel={cancelPlan}
            />
          ))
        )}
      </div>

      {error && (
        <div className="border-stone-800 border-t bg-red-950/30 px-3 py-1.5 text-[10px] text-red-400">
          {error}
        </div>
      )}

      {/* Input */}
      <div className="border-stone-800 border-t p-3">
        <div className="flex items-center gap-2 rounded bg-stone-800 px-3 py-2 ring-1 ring-stone-700 focus-within:ring-stone-500">
          <span className="font-[family-name:var(--font-mono)] text-amber-500 text-xs">git ▸</span>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSubmit()
            }}
            placeholder="Describe what you want to do..."
            disabled={!sessionId}
            className="min-w-0 flex-1 bg-transparent text-stone-200 text-xs outline-none placeholder:text-stone-600"
          />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!input.trim() || !sessionId}
            className="rounded p-1 text-stone-500 transition-colors hover:text-amber-400 disabled:opacity-50"
          >
            <Send size={12} />
          </button>
        </div>
      </div>
    </div>
  )
}
