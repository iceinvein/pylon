import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { CheckCircle, Circle, Loader, ChevronUp, ListChecks } from 'lucide-react'
import { useSessionStore } from '../../store/session-store'
import type { TaskItem } from '../../store/session-store'

type TasksPanelProps = {
  sessionId: string | null
}

function TaskIcon({ status }: { status: TaskItem['status'] }) {
  if (status === 'completed') return <CheckCircle size={12} className="text-green-500" />
  if (status === 'in_progress') return <Loader size={12} className="animate-spin text-amber-400" />
  return <Circle size={12} className="text-stone-600" />
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
      className="border-t border-stone-800"
    >
      {/* Summary bar — always visible */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="mx-auto flex w-full max-w-3xl items-center gap-2.5 px-4 py-2 text-left transition-colors hover:bg-stone-800/30"
      >
        <ListChecks size={14} className="flex-shrink-0 text-amber-400" />

        {/* Progress bar */}
        <div className="h-1 w-16 flex-shrink-0 overflow-hidden rounded-full bg-stone-800">
          <motion.div
            className={`h-full rounded-full ${allDone ? 'bg-green-500' : 'bg-amber-500'}`}
            animate={{ width: `${total > 0 ? (completed / total) * 100 : 0}%` }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          />
        </div>

        <span className="text-xs text-stone-500">
          <span className={allDone ? 'text-green-400' : 'text-stone-300'}>{completed}/{total}</span>
          {' '}tasks
        </span>

        {inProgress && !expanded && (
          <span className="min-w-0 flex-1 truncate text-xs text-stone-500 italic">
            {inProgress.activeForm ?? inProgress.subject}
          </span>
        )}

        <motion.span
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.15 }}
          className="ml-auto flex-shrink-0 text-stone-600"
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
                        ? 'text-stone-600 line-through'
                        : task.status === 'in_progress'
                          ? 'text-stone-200'
                          : 'text-stone-400'
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
