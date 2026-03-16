import { Folder, FolderOpen } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
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

  useEffect(() => {
    window.api
      .listProjects()
      .then(setProjects)
      .catch(() => setProjects([]))
  }, [])

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
            className="font-display text-5xl text-[var(--color-base-text)] italic tracking-tight"
            variants={fadeUp}
          >
            Pylon
          </motion.h1>
          <motion.p
            className="mt-3 max-w-xs text-[var(--color-base-text-secondary)] text-base leading-relaxed"
            variants={fadeUp}
          >
            Your code, with an architect beside you.
          </motion.p>
          <motion.div variants={fadeUp}>
            <button
              type="button"
              onClick={openFolder}
              className="mt-8 inline-flex items-center gap-2.5 rounded-lg bg-[var(--color-accent)] px-5 py-2.5 font-semibold text-sm text-white transition-all hover:bg-[var(--color-accent-hover)] active:scale-[0.98]"
            >
              <FolderOpen size={16} />
              Open Folder
            </button>
          </motion.div>
          {projects.length === 0 && (
            <motion.p
              className="mt-6 max-w-xs text-[var(--color-base-text-faint)] text-xs leading-relaxed"
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
                <button
                  type="button"
                  key={project.path}
                  onClick={() => openPath(project.path)}
                  className="group flex w-full items-start gap-3 rounded-lg p-3 text-left transition-colors hover:bg-[var(--color-base-raised)]"
                >
                  <Folder
                    size={14}
                    className="mt-0.5 flex-shrink-0 text-[var(--color-base-text-muted)]"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-[var(--color-base-text)] text-sm">
                      {project.path.split('/').pop()}
                    </p>
                    <p className="truncate text-[var(--color-base-text-muted)] text-xs">
                      {project.path}
                    </p>
                    <p className="mt-0.5 text-[11px] text-[var(--color-base-text-faint)]">
                      {timeAgo(project.lastUsed)}
                    </p>
                  </div>
                </button>
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
