import { AlertTriangle, Check, Loader2, Sparkles, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import type { RecipeStep } from '../../../shared/types'
import { useWorktreeSetupStore } from '../store/worktree-setup-store'

function StepCheckbox({
  step,
  checked,
  onToggle,
}: {
  step: RecipeStep
  checked: boolean
  onToggle: () => void
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 rounded-md bg-base-bg/30 px-2.5 py-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="h-3.5 w-3.5 rounded border-base-border bg-base-raised accent-amber-600"
      />
      <span className="flex-1 text-base-text text-xs">{step.label}</span>
      <span className="font-mono text-[10px] text-base-text-faint">{step.type}</span>
    </label>
  )
}

export function WorktreeSetupModal() {
  const { phase, recipe, progress, result, error, reset } = useWorktreeSetupStore()
  const [checkedSteps, setCheckedSteps] = useState<Set<string>>(new Set())

  // Initialize checked steps when recipe arrives and we enter confirming
  useEffect(() => {
    if (recipe && phase === 'confirming') {
      setCheckedSteps(new Set(recipe.steps.map((s) => s.id)))
    }
  }, [recipe, phase])

  if (phase === 'idle') return null

  function toggleStep(stepId: string) {
    setCheckedSteps((prev) => {
      const next = new Set(prev)
      if (next.has(stepId)) next.delete(stepId)
      else next.add(stepId)
      return next
    })
  }

  async function handleRunSetup() {
    if (!recipe) return
    const store = useWorktreeSetupStore.getState()
    if (!store.sessionId) return

    store.startExecuting()
    const selectedStepIds = [...checkedSteps]

    try {
      const info = await window.api.getWorktreeInfo(store.sessionId)
      if (!info.worktreePath) throw new Error('Worktree path not found')

      await window.api.runWorktreeSetup(
        store.sessionId,
        recipe.projectPath,
        info.worktreePath,
        recipe.projectPath,
        selectedStepIds,
      )
    } catch (err) {
      store.setError(err instanceof Error ? err.message : String(err))
    }
  }

  function handleSkip() {
    reset()
  }

  function handleOpenAnyway() {
    reset()
  }

  async function handleFixIt() {
    if (!result) return
    const store = useWorktreeSetupStore.getState()
    if (!store.sessionId) return

    const failures = result.results.filter((r) => r.status === 'failed')
    const failureContext = failures.map((f) => `- ${f.label}: ${f.error}`).join('\n')

    await window.api.sendMessage(
      store.sessionId,
      `The worktree setup had failures that need fixing:\n\n${failureContext}\n\nPlease diagnose and fix these issues.`,
    )
    reset()
  }

  const failedResults = result?.results.filter((r) => r.status === 'failed') ?? []

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.15 }}
          className="w-full max-w-md rounded-xl border border-base-border bg-base-surface p-5 shadow-2xl"
        >
          {/* ── Analyzing ── */}
          {phase === 'analyzing' && (
            <div className="flex flex-col items-center gap-3 py-6">
              <Loader2 size={20} className="animate-spin text-accent" />
              <p className="font-medium text-base-text text-sm">Analyzing project setup...</p>
              <p className="text-base-text-muted text-xs">
                Claude is determining what this project needs.
              </p>
            </div>
          )}

          {/* ── Confirming ── */}
          {phase === 'confirming' && recipe && (
            <>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles size={14} className="text-accent" />
                  <h2 className="font-medium text-base-text text-sm">Worktree Setup</h2>
                </div>
                <button
                  type="button"
                  onClick={handleSkip}
                  className="rounded p-1 text-base-text-muted transition-colors hover:bg-base-raised hover:text-base-text"
                >
                  <X size={14} />
                </button>
              </div>
              <p className="mt-2 text-base-text-secondary text-xs">Detected setup steps:</p>

              <div className="mt-3 flex flex-col gap-1.5">
                {recipe.steps.map((step) => (
                  <StepCheckbox
                    key={step.id}
                    step={step}
                    checked={checkedSteps.has(step.id)}
                    onToggle={() => toggleStep(step.id)}
                  />
                ))}
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={handleSkip}
                  className="rounded-lg px-3.5 py-1.5 text-base-text-secondary text-xs transition-colors hover:bg-base-raised hover:text-base-text"
                >
                  Skip Setup
                </button>
                <button
                  type="button"
                  onClick={handleRunSetup}
                  disabled={checkedSteps.size === 0}
                  className="rounded-lg bg-accent px-3.5 py-1.5 font-medium text-white text-xs transition-colors hover:bg-accent-hover disabled:opacity-50"
                >
                  Run Setup
                </button>
              </div>
            </>
          )}

          {/* ── Executing ── */}
          {phase === 'executing' && recipe && (
            <>
              <p className="font-medium text-base-text text-sm">Setting up worktree...</p>
              <div className="mt-4 flex flex-col gap-1.5">
                {recipe.steps.map((step, idx) => {
                  const currentIdx = progress
                    ? recipe.steps.findIndex((s) => s.id === progress.stepId)
                    : -1
                  const isCurrentStep = progress?.stepId === step.id
                  const isDone = currentIdx >= 0 && idx < currentIdx
                  const isFailed = isCurrentStep && progress?.status === 'failed'
                  const isRunning = isCurrentStep && progress?.status === 'running'
                  const isStepDone = (isCurrentStep && progress?.status === 'done') || isDone

                  return (
                    <div
                      key={step.id}
                      className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 ${isCurrentStep ? 'bg-accent/5' : ''}`}
                    >
                      {isStepDone ? (
                        <Check size={13} className="shrink-0 text-emerald-500" />
                      ) : isFailed ? (
                        <X size={13} className="shrink-0 text-error" />
                      ) : isRunning ? (
                        <Loader2 size={13} className="shrink-0 animate-spin text-accent" />
                      ) : (
                        <div className="h-3.5 w-3.5 shrink-0 rounded-full border border-base-border" />
                      )}
                      <span
                        className={`text-xs ${isStepDone ? 'text-base-text-muted' : isCurrentStep ? 'text-base-text' : 'text-base-text-faint'}`}
                      >
                        {step.label}
                      </span>
                    </div>
                  )
                })}
              </div>

              {progress && (
                <div className="mt-3">
                  <div className="h-1 overflow-hidden rounded-full bg-base-raised">
                    <div
                      className="h-full rounded-full bg-accent transition-all duration-300"
                      style={{ width: `${(progress.current / progress.total) * 100}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-[10px] text-base-text-faint">
                    Step {progress.current} of {progress.total}
                  </p>
                </div>
              )}
            </>
          )}

          {/* ── Complete ── */}
          {phase === 'complete' && (
            <>
              <div className="flex items-center gap-2">
                <h2 className="font-medium text-base-text text-sm">Worktree Ready</h2>
                {failedResults.length > 0 && (
                  <span className="rounded border border-error/20 bg-error/10 px-1.5 py-0.5 text-[10px] text-error">
                    {failedResults.length} {failedResults.length === 1 ? 'issue' : 'issues'}
                  </span>
                )}
              </div>

              {error && (
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-error/30 bg-error/5 px-3 py-2">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0 text-error" />
                  <p className="text-error/80 text-xs">{error}</p>
                </div>
              )}

              {result && (
                <div className="mt-3 flex flex-col gap-1">
                  {result.results.map((r) => (
                    <div key={r.stepId}>
                      <div className="flex items-center gap-2.5 rounded-md px-2.5 py-1.5">
                        {r.status === 'done' ? (
                          <Check size={13} className="shrink-0 text-emerald-500" />
                        ) : (
                          <X size={13} className="shrink-0 text-error" />
                        )}
                        <span
                          className={`text-xs ${r.status === 'done' ? 'text-base-text-muted' : 'text-error/80'}`}
                        >
                          {r.label}
                        </span>
                      </div>
                      {r.error && (
                        <p className="ml-7.5 font-mono text-[10px] text-base-text-faint">
                          {r.error}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-4 flex justify-end gap-2">
                {failedResults.length > 0 && (
                  <button
                    type="button"
                    onClick={handleFixIt}
                    className="rounded-lg border border-accent/30 px-3.5 py-1.5 text-accent text-xs transition-colors hover:bg-accent/5"
                  >
                    Fix It
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleOpenAnyway}
                  className="rounded-lg bg-accent px-3.5 py-1.5 font-medium text-white text-xs transition-colors hover:bg-accent-hover"
                >
                  {failedResults.length > 0 ? 'Open Anyway' : 'Continue'}
                </button>
              </div>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
