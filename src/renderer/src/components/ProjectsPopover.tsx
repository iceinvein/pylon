import { useEffect, useRef, useState } from 'react'
import { Folder, FolderOpen } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { timeAgo } from '../lib/utils'

type Project = {
  path: string
  lastUsed: number
}

type ProjectsPopoverProps = {
  open: boolean
  onClose: () => void
  onSelectProject: (path: string) => void
  onBrowse: () => void
  anchorRef: React.RefObject<HTMLButtonElement | null>
}

export function ProjectsPopover({ open, onClose, onSelectProject, onBrowse, anchorRef }: ProjectsPopoverProps) {
  const [projects, setProjects] = useState<Project[]>([])
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      window.api.listProjects().then(setProjects)
    }
  }, [open])

  useEffect(() => {
    if (!open) return

    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node
      if (
        popoverRef.current && !popoverRef.current.contains(target) &&
        anchorRef.current && !anchorRef.current.contains(target)
      ) {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open, onClose, anchorRef])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={popoverRef}
          initial={{ opacity: 0, x: -4 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -4 }}
          transition={{ duration: 0.12 }}
          className="fixed z-50 w-72 rounded-xl border border-stone-700 bg-stone-900 py-1.5 shadow-2xl"
          style={{
            left: 56,
            top: anchorRef.current
              ? anchorRef.current.getBoundingClientRect().top
              : 120,
          }}
        >
          <div className="px-3 py-1.5">
            <p className="text-[10px] font-medium uppercase tracking-wider text-stone-500">Projects</p>
          </div>

          <div className="max-h-64 overflow-y-auto">
            {projects.length === 0 ? (
              <div className="px-3 py-3 text-center text-xs text-stone-600">
                No recent projects
              </div>
            ) : (
              projects.map((project) => (
                <button
                  key={project.path}
                  onClick={() => {
                    onSelectProject(project.path)
                    onClose()
                  }}
                  className="flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors hover:bg-stone-800/60"
                >
                  <Folder size={13} className="mt-0.5 flex-shrink-0 text-stone-600" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-stone-300">
                      {project.path.split('/').pop()}
                    </p>
                    <p className="truncate text-[11px] text-stone-600">{project.path}</p>
                    <p className="text-[10px] text-stone-700">{timeAgo(project.lastUsed)}</p>
                  </div>
                </button>
              ))
            )}
          </div>

          <div className="border-t border-stone-800 px-1.5 pt-1.5">
            <button
              onClick={() => {
                onBrowse()
                onClose()
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-xs text-stone-400 transition-colors hover:bg-stone-800/60 hover:text-stone-300"
            >
              <FolderOpen size={13} />
              Browse...
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
