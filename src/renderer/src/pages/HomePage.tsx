import { Folder, FolderOpen } from 'lucide-react'
import { useEffect, useState } from 'react'
import logoUrl from '../assets/logo.png'
import { SessionHistory } from '../components/SessionHistory'
import { WorktreeDialog } from '../components/WorktreeDialog'
import { useFolderOpen } from '../hooks/use-folder-open'
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
    <div className="flex h-full flex-col items-center overflow-y-auto px-6 py-12">
      <div className="w-full max-w-lg">
        <div className="mb-12 text-center">
          <img src={logoUrl} alt="Pylon" className="mx-auto mb-4 h-20 w-20" />
          <h1 className="font-bold text-4xl text-stone-100 tracking-tight">Pylon</h1>
          <p className="mt-2 text-stone-500">AI-powered development assistant</p>
          <button
            type="button"
            onClick={openFolder}
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-amber-600 px-5 py-2.5 font-medium text-sm text-stone-50 transition-colors hover:bg-amber-500"
          >
            <FolderOpen size={16} />
            Open Folder
          </button>
        </div>

        {projects.length > 0 && (
          <div className="mb-8">
            <p className="mb-2 font-medium text-stone-600 text-xs uppercase tracking-wider">
              Projects
            </p>
            <div className="space-y-1">
              {projects.map((project) => (
                <button
                  type="button"
                  key={project.path}
                  onClick={() => openPath(project.path)}
                  className="group flex w-full items-start gap-3 rounded-lg p-3 text-left transition-colors hover:bg-stone-800/60"
                >
                  <Folder size={14} className="mt-0.5 flex-shrink-0 text-stone-600" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-sm text-stone-300">
                      {project.path.split('/').pop()}
                    </p>
                    <p className="truncate text-stone-600 text-xs">{project.path}</p>
                    <p className="mt-0.5 text-[11px] text-stone-700">{timeAgo(project.lastUsed)}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        <SessionHistory />
      </div>

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
