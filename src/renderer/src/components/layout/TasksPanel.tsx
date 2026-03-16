import { CheckCircle, ChevronUp, Circle, ListChecks, Loader } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import type { TaskItem } from '../../store/session-store'
import { useSessionStore } from '../../store/session-store'

type TasksPanelProps = {
  sessionId: string | null
}

function TaskIcon({ status }: { status: TaskItem['status'] }) {
  if (status === 'completed')
    return <CheckCircle size={12} className="text-[var(--color-success)]" />
  if (status === 'in_progress')
    return <Loader size={12} className="animate-spin text-[var(--color-warning)]" />
  return <Circle size={12} className="text-[var(--color-base-text-faint)]" />
}

export function TasksPanel({ sessionId }: TasksPanelProps) {
  const tasks = useSessionStore((s) => (sessionId ? s.tasks.get(sessionId) : undefined)) ?? []
  const [expanded, setExpanded] = useState(false)

  if (tasks.length === 0) return null

  const completed = tasks.filter((t) => t.status === 'completed').length
  const inProgress = tasks.find((t) => t.status === 'in_progress')
  const total = tasks.length
  const allDone = completed === total

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      className="border-[var(--color-base-border-subtle)] border-t"
    >
      {/* Summary bar — always visible */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="mx-auto flex w-full max-w-3xl items-center gap-2.5 px-4 py-2 text-left transition-colors hover:bg-[var(--color-base-raised)]/30"
      >
        <ListChecks size={14} className="flex-shrink-0 text-[var(--color-warning)]" />

        {/* Progress bar */}
        <div className="h-1 w-16 flex-shrink-0 overflow-hidden rounded-full bg-[var(--color-base-raised)]">
          <motion.div
            className={`h-full rounded-full ${allDone ? 'bg-[var(--color-success)]' : 'bg-[var(--color-accent-hover)]'}`}
            animate={{ width: `${total > 0 ? (completed / total) * 100 : 0}%` }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          />
        </div>

        <span className="text-[var(--color-base-text-muted)] text-xs">
          <span
            className={allDone ? 'text-[var(--color-success)]' : 'text-[var(--color-base-text)]'}
          >
            {completed}/{total}
          </span>{' '}
          tasks
        </span>

        {inProgress && !expanded && (
          <span className="min-w-0 flex-1 truncate text-[var(--color-base-text-muted)] text-xs italic">
            {inProgress.activeForm ?? inProgress.subject}
          </span>
        )}

        <motion.span
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.15 }}
          className="ml-auto flex-shrink-0 text-[var(--color-base-text-faint)]"
        >
          <ChevronUp size={14} />
        </motion.span>
      </button>

      {/* Expanded task list */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="mx-auto max-h-40 max-w-3xl space-y-0.5 overflow-y-auto px-4 pb-2">
              {tasks.map((task) => (
                <div key={task.id} className="flex items-start gap-2 py-0.5">
                  <span className="mt-0.5 flex-shrink-0">
                    <TaskIcon status={task.status} />
                  </span>
                  <span
                    className={`text-xs leading-relaxed ${
                      task.status === 'completed'
                        ? 'text-[var(--color-base-text-faint)] line-through'
                        : task.status === 'in_progress'
                          ? 'text-[var(--color-base-text)]'
                          : 'text-[var(--color-base-text-secondary)]'
                    }`}
                  >
                    {task.status === 'in_progress' && task.activeForm
                      ? task.activeForm
                      : task.subject}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
