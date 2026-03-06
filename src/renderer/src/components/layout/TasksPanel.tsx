import { motion, AnimatePresence } from 'motion/react'
import { CheckCircle, Circle, Loader } from 'lucide-react'
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

  if (tasks.length === 0) return null

  const completed = tasks.filter((t) => t.status === 'completed').length
  const total = tasks.length

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      className="border-t border-stone-800 px-2 py-2"
    >
      <div className="mb-1.5 flex items-center justify-between px-1">
        <span className="text-[11px] font-medium text-stone-400">
          Tasks {completed}/{total}
        </span>
      </div>

      <div className="mb-2 h-0.5 overflow-hidden rounded-full bg-stone-800 mx-1">
        <motion.div
          className="h-full rounded-full bg-amber-500"
          initial={{ width: 0 }}
          animate={{ width: `${total > 0 ? (completed / total) * 100 : 0}%` }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        />
      </div>

      <AnimatePresence>
        {tasks.map((task) => (
          <motion.div
            key={task.id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.15 }}
            className="flex items-center gap-1.5 rounded px-1 py-0.5"
            title={task.subject}
          >
            <TaskIcon status={task.status} />
            <span
              className={`min-w-0 flex-1 truncate text-[11px] ${
                task.status === 'completed'
                  ? 'text-stone-600 line-through'
                  : task.status === 'in_progress'
                    ? 'text-amber-300'
                    : 'text-stone-400'
              }`}
            >
              {task.status === 'in_progress' && task.activeForm
                ? task.activeForm
                : task.subject}
            </span>
          </motion.div>
        ))}
      </AnimatePresence>
    </motion.div>
  )
}
