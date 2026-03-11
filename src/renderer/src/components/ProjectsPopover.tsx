import { Folder, FolderOpen } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
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
  /** Where to place the popover relative to the anchor. Default: 'right' */
  position?: 'right' | 'below'
}

export function ProjectsPopover({
  open,
  onClose,
  onSelectProject,
  onBrowse,
  anchorRef,
  position = 'right',
}: ProjectsPopoverProps) {
  const [projects, setProjects] = useState<Project[]>([])
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      window.api
        .listProjects()
        .then(setProjects)
        .catch(() => setProjects([]))
    }
  }, [open])

  useEffect(() => {
    if (!open) return

    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node
      if (
        popoverRef.current &&
        !popoverRef.current.contains(target) &&
        anchorRef.current &&
        !anchorRef.current.contains(target)
      ) {
        onClose()
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
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
          style={
            position === 'below'
              ? {
                  right: anchorRef.current
                    ? window.innerWidth - anchorRef.current.getBoundingClientRect().right
                    : 8,
                  top: anchorRef.current
                    ? anchorRef.current.getBoundingClientRect().bottom + 6
                    : 44,
                }
              : {
                  left: anchorRef.current
                    ? anchorRef.current.getBoundingClientRect().right + 6
                    : 56,
                  top: anchorRef.current ? anchorRef.current.getBoundingClientRect().top : 120,
                }
          }
        >
          <div className="px-3 py-1.5">
            <p className="font-medium text-[10px] text-stone-500 uppercase tracking-wider">
              Projects
            </p>
          </div>

          <div className="max-h-64 overflow-y-auto">
            {projects.length === 0 ? (
              <div className="px-3 py-3 text-center text-stone-600 text-xs">No recent projects</div>
            ) : (
              projects.map((project) => (
                <button
                  type="button"
                  key={project.path}
                  onClick={() => {
                    onSelectProject(project.path)
                    onClose()
                  }}
                  className="flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors hover:bg-stone-800/60"
                >
                  <Folder size={13} className="mt-0.5 flex-shrink-0 text-stone-600" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-stone-300 text-xs">
                      {project.path.split('/').pop()}
                    </p>
                    <p className="truncate text-[11px] text-stone-600">{project.path}</p>
                    <p className="text-[10px] text-stone-700">{timeAgo(project.lastUsed)}</p>
                  </div>
                </button>
              ))
            )}
          </div>

          <div className="border-stone-800 border-t px-1.5 pt-1.5">
            <button
              type="button"
              onClick={() => {
                onBrowse()
                onClose()
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-stone-400 text-xs transition-colors hover:bg-stone-800/60 hover:text-stone-300"
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
