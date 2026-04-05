import { Folder, FolderOpen, FolderPlus, X } from 'lucide-react'
import { motion } from 'motion/react'
import { useCallback, useEffect, useState } from 'react'
import logoUrl from '../assets/logo.png'
import { SectionHeader } from '../components/SectionHeader'
import { SessionHistory } from '../components/SessionHistory'
import { WorktreeDialog } from '../components/WorktreeDialog'
import { useFolderOpen } from '../hooks/use-folder-open'
import { fadeUp, stagger } from '../lib/animations'
import { timeAgo } from '../lib/utils'
import { useTabStore } from '../store/tab-store'

type Project = {
  path: string
  lastUsed: number
}

export function HomePage() {
  // If the active tab has no cwd, we're inside a blank "New Tab" — reuse it
  const activeTab = useTabStore((s) => {
    const tab = s.tabs.find((t) => t.id === s.activeTabId)
    return tab && !tab.cwd ? tab : undefined
  })
  const { dialogState, openFolder, openPath, confirmDialog, cancelDialog } = useFolderOpen(
    activeTab?.id,
  )
  const [projects, setProjects] = useState<Project[]>([])

  const refreshProjects = useCallback(() => {
    window.api
      .listProjects()
      .then(setProjects)
      .catch(() => setProjects([]))
  }, [])

  useEffect(() => {
    refreshProjects()
  }, [refreshProjects])

  async function addProjectOnly() {
    const path = await window.api.openFolder()
    if (!path) return
    await window.api.addProject(path)
    refreshProjects()
  }

  async function removeProject(e: React.MouseEvent, projectPath: string) {
    e.stopPropagation()
    await window.api.removeProject(projectPath)
    refreshProjects()
  }

  return (
    <div className="flex h-full flex-col items-center overflow-y-auto px-6 py-16">
      <motion.div className="w-full max-w-lg" variants={stagger()} initial="hidden" animate="show">
        {/* Hero — staggered entrance */}
        <div className="mb-16">
          <motion.img
            src={logoUrl}
            alt="Pylon"
            className="mb-6 h-14 w-14 opacity-80"
            variants={fadeUp}
          />
          <motion.h1
            className="font-display text-5xl text-base-text italic tracking-tight"
            variants={fadeUp}
          >
            Pylon
          </motion.h1>
          <motion.p
            className="mt-3 max-w-xs text-base text-base-text-secondary leading-relaxed"
            variants={fadeUp}
          >
            Your code, with an architect beside you.
          </motion.p>
          <motion.div variants={fadeUp} className="mt-8 flex items-center gap-3">
            <button
              type="button"
              onClick={openFolder}
              className="inline-flex items-center gap-2.5 rounded-lg bg-accent px-5 py-2.5 font-semibold text-sm text-white transition-all hover:bg-accent-hover active:scale-[0.98]"
            >
              <FolderOpen size={16} />
              Open Folder
            </button>
            <button
              type="button"
              onClick={addProjectOnly}
              className="inline-flex items-center gap-2 rounded-lg border border-base-border px-4 py-2.5 text-base-text-secondary text-sm transition-colors hover:bg-base-raised hover:text-base-text"
            >
              <FolderPlus size={16} />
              Add Project
            </button>
          </motion.div>
          {projects.length === 0 && (
            <motion.p
              className="mt-6 max-w-xs text-base-text-faint text-xs leading-relaxed"
              variants={fadeUp}
            >
              Point Pylon at any project. It reads your code, runs commands, edits files, and
              explains what it finds.
            </motion.p>
          )}
        </div>

        {projects.length > 0 && (
          <motion.div className="mb-10" variants={fadeUp}>
            <SectionHeader>Projects</SectionHeader>
            <div className="space-y-0.5">
              {projects.map((project) => (
                <div key={project.path} className="group relative">
                  <button
                    type="button"
                    onClick={() => openPath(project.path)}
                    className="flex w-full items-start gap-3 rounded-lg p-3 text-left transition-colors hover:bg-base-raised"
                  >
                    <Folder size={14} className="mt-0.5 shrink-0 text-base-text-muted" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-base-text text-sm">
                        {project.path.split('/').pop()}
                      </p>
                      <p className="truncate text-base-text-muted text-xs">{project.path}</p>
                      <p className="mt-0.5 text-base-text-faint text-xs">
                        {timeAgo(project.lastUsed)}
                      </p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => removeProject(e, project.path)}
                    className="absolute top-3 right-3 rounded p-1 text-base-text-faint opacity-0 transition-all hover:bg-base-raised hover:text-base-text group-hover:opacity-100"
                    title="Remove from projects"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        <motion.div variants={fadeUp}>
          <SessionHistory />
        </motion.div>
      </motion.div>

      {dialogState && (
        <WorktreeDialog
          folderPath={dialogState.path}
          isDirty={dialogState.isDirty}
          onConfirm={confirmDialog}
          onCancel={cancelDialog}
        />
      )}
    </div>
  )
}
