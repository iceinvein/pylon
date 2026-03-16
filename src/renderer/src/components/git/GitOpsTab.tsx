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
  safe: 'border-emerald-800 bg-[var(--color-success)]/30',
  moderate: 'border-yellow-800 bg-yellow-950/30',
  destructive: 'border-[var(--color-error)] bg-[var(--color-error)]/30',
}

const riskLabels = {
  safe: { text: 'Safe', color: 'text-emerald-400' },
  moderate: { text: 'Caution', color: 'text-yellow-400' },
  destructive: { text: 'Destructive', color: 'text-[var(--color-error)]' },
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
      <p className="mb-1 text-[var(--color-base-text)] text-xs">▸ {entry.request}</p>

      {entry.status === 'pending' && (
        <div className="flex items-center gap-2 pl-3">
          <Loader2 size={11} className="animate-spin text-[var(--color-base-text-faint)]" />
          <span className="text-[10px] text-[var(--color-base-text-muted)]">Interpreting...</span>
        </div>
      )}

      {plan && entry.status === 'planned' && (
        <div className={`ml-3 rounded-lg border p-2.5 ${riskColors[plan.riskLevel]}`}>
          <div className="flex items-center justify-between">
            <p className="text-[var(--color-base-text)] text-xs">{plan.interpretation}</p>
            <span className={`font-medium text-[10px] ${riskLabels[plan.riskLevel].color}`}>
              {riskLabels[plan.riskLevel].text}
            </span>
          </div>
          <div className="mt-2 space-y-1">
            {plan.commands.map((cmd, i) => (
              <div key={i} className="flex items-start gap-2">
                <code className="font-[family-name:var(--font-mono)] text-[10px] text-[var(--color-warning)]/80">
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
          <p className="mt-2 text-[10px] text-[var(--color-base-text-muted)]">{plan.preview}</p>
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
              className="rounded px-2.5 py-1 text-[10px] text-[var(--color-base-text-muted)] hover:bg-[var(--color-base-raised)] hover:text-[var(--color-base-text)]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {entry.status === 'executing' && (
        <div className="ml-3 flex items-center gap-2">
          <Loader2 size={11} className="animate-spin text-[var(--color-warning)]" />
          <span className="text-[10px] text-[var(--color-warning)]">Executing...</span>
        </div>
      )}

      {entry.status === 'completed' && (
        <div className="ml-3 flex items-center gap-2 text-emerald-400">
          <Check size={11} />
          <span className="text-[10px]">{entry.result || 'Done'}</span>
        </div>
      )}

      {entry.status === 'failed' && (
        <div className="ml-3 flex items-center gap-2 text-[var(--color-error)]">
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
            <p className="text-[var(--color-base-text-faint)] text-xs">
              Type a git command in plain English
            </p>
            <p className="text-[10px] text-[var(--color-base-text-faint)]">
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
        <div className="border-[var(--color-base-border-subtle)] border-t bg-[var(--color-error)]/30 px-3 py-1.5 text-[10px] text-[var(--color-error)]">
          {error}
        </div>
      )}

      {/* Input */}
      <div className="border-[var(--color-base-border-subtle)] border-t p-3">
        <div className="flex items-center gap-2 rounded bg-[var(--color-base-raised)] px-3 py-2 ring-1 ring-[var(--color-base-border)] focus-within:ring-[var(--color-accent)]">
          <span className="font-[family-name:var(--font-mono)] text-[var(--color-warning)] text-xs">
            git ▸
          </span>
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
            className="min-w-0 flex-1 bg-transparent text-[var(--color-base-text)] text-xs outline-none placeholder:text-[var(--color-base-text-faint)]"
          />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!input.trim() || !sessionId}
            className="rounded p-1 text-[var(--color-base-text-muted)] transition-colors hover:text-[var(--color-warning)] disabled:opacity-50"
          >
            <Send size={12} />
          </button>
        </div>
      </div>
    </div>
  )
}
