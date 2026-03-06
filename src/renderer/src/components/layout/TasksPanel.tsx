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
      className="flex flex-col items-center gap-1 border-t border-stone-800 py-2"
    >
      <span className="text-[10px] font-medium text-stone-500">
        {completed}/{total}
      </span>

      <div className="h-1 w-6 overflow-hidden rounded-full bg-stone-800">
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
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            transition={{ duration: 0.15 }}
            title={task.status === 'in_progress' && task.activeForm ? task.activeForm : task.subject}
          >
            <TaskIcon status={task.status} />
          </motion.div>
        ))}
      </AnimatePresence>
    </motion.div>
  )
}
