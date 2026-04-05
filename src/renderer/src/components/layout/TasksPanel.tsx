import { CheckCircle, ChevronUp, Circle, Loader } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import type { TaskItem } from '../../store/session-store'
import { useSessionStore } from '../../store/session-store'

type TasksPanelProps = {
  sessionId: string | null
}

function TaskIcon({ status }: { status: TaskItem['status'] }) {
  if (status === 'completed') return <CheckCircle size={11} className="text-success" />
  if (status === 'in_progress') return <Loader size={11} className="animate-spin text-warning" />
  return <Circle size={11} className="text-base-text-faint" />
}

export function TasksPanel({ sessionId }: TasksPanelProps) {
  const tasks = useSessionStore((s) => (sessionId ? s.tasks.get(sessionId) : undefined)) ?? []
  const [expanded, setExpanded] = useState(false)

  const hasTasks = tasks.length > 0
  const completed = tasks.filter((t) => t.status === 'completed').length
  const inProgress = tasks.find((t) => t.status === 'in_progress')
  const total = tasks.length
  const allDone = completed === total

  if (!hasTasks) return null

  return (
    <div className="mx-auto w-full max-w-3xl px-4">
      <div className="flex items-center gap-3 py-1.5">
        {/* Task progress — compact pill */}
        {hasTasks && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-base-text-muted text-xs transition-colors hover:bg-base-raised/50"
          >
            {/* Tiny progress bar */}
            <div className="h-1 w-8 overflow-hidden rounded-full bg-base-raised">
              <motion.div
                className={`h-full rounded-full ${allDone ? 'bg-success' : 'bg-accent'}`}
                animate={{ width: `${total > 0 ? (completed / total) * 100 : 0}%` }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
              />
            </div>
            <span>
              {completed}/{total}
            </span>
            {inProgress && !expanded && (
              <span className="max-w-32 truncate italic">
                {inProgress.activeForm ?? inProgress.subject}
              </span>
            )}
            <motion.span animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.15 }}>
              <ChevronUp size={10} />
            </motion.span>
          </button>
        )}
      </div>

      {/* Expanded task list */}
      <AnimatePresence>
        {expanded && hasTasks && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="max-h-32 space-y-0.5 overflow-y-auto pb-1.5 pl-1">
              {tasks.map((task) => (
                <div key={task.id} className="flex items-start gap-1.5 py-0.5">
                  <span className="mt-px shrink-0">
                    <TaskIcon status={task.status} />
                  </span>
                  <span
                    className={`text-xs leading-relaxed ${
                      task.status === 'completed'
                        ? 'text-base-text-faint line-through'
                        : task.status === 'in_progress'
                          ? 'text-base-text'
                          : 'text-base-text-secondary'
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
    </div>
  )
}
