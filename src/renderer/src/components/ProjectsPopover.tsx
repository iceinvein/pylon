import { Folder, FolderOpen, FolderPlus, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
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

  const refreshProjects = useCallback(() => {
    window.api
      .listProjects()
      .then(setProjects)
      .catch(() => setProjects([]))
  }, [])

  useEffect(() => {
    if (open) refreshProjects()
  }, [open, refreshProjects])

  async function addProjectOnly() {
    const path = await window.api.openFolder()
    if (!path) return
    await window.api.addProject(path)
    refreshProjects()
  }

  async function handleRemoveProject(e: React.MouseEvent, projectPath: string) {
    e.stopPropagation()
    await window.api.removeProject(projectPath)
    refreshProjects()
  }

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
          className="fixed z-50 w-72 rounded-xl border border-base-border bg-base-surface py-1.5 shadow-2xl"
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
            <p className="font-medium text-[10px] text-base-text-muted uppercase tracking-wider">
              Projects
            </p>
          </div>

          <div className="max-h-64 overflow-y-auto">
            {projects.length === 0 ? (
              <div className="px-3 py-3 text-center text-base-text-faint text-xs">
                No projects yet
              </div>
            ) : (
              projects.map((project) => (
                <div key={project.path} className="group relative">
                  <button
                    type="button"
                    onClick={() => {
                      onSelectProject(project.path)
                      onClose()
                    }}
                    className="flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors hover:bg-base-raised/60"
                  >
                    <Folder size={13} className="mt-0.5 shrink-0 text-base-text-faint" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-base-text text-xs">
                        {project.path.split('/').pop()}
                      </p>
                      <p className="truncate text-base-text-faint text-xs">{project.path}</p>
                      <p className="text-[10px] text-base-text-faint">
                        {timeAgo(project.lastUsed)}
                      </p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleRemoveProject(e, project.path)}
                    className="absolute top-2 right-2 rounded p-0.5 text-base-text-faint opacity-0 transition-all hover:bg-base-raised hover:text-base-text group-hover:opacity-100"
                    title="Remove from projects"
                  >
                    <X size={11} />
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="border-base-border-subtle border-t px-1.5 pt-1.5">
            <button
              type="button"
              onClick={() => {
                onBrowse()
                onClose()
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-base-text-secondary text-xs transition-colors hover:bg-base-raised/60 hover:text-base-text"
            >
              <FolderOpen size={13} />
              Open Folder...
            </button>
            <button
              type="button"
              onClick={addProjectOnly}
              className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-base-text-secondary text-xs transition-colors hover:bg-base-raised/60 hover:text-base-text"
            >
              <FolderPlus size={13} />
              Add Project...
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
