import { useEffect, useState } from 'react'
import { Folder, FolderOpen } from 'lucide-react'
import { useFolderOpen } from '../hooks/use-folder-open'
import logoUrl from '../assets/logo.png'
import { SessionHistory } from '../components/SessionHistory'
import { WorktreeDialog } from '../components/WorktreeDialog'
import { timeAgo } from '../lib/utils'

type Project = {
  path: string
  lastUsed: number
}

export function HomePage() {
  const { dialogState, openFolder, openPath, confirmDialog, cancelDialog } = useFolderOpen()
  const [projects, setProjects] = useState<Project[]>([])

  useEffect(() => {
    window.api.listProjects().then(setProjects).catch(() => setProjects([]))
  }, [])

  return (
    <div className="flex h-full flex-col items-center overflow-y-auto py-12 px-6">
      <div className="w-full max-w-lg">
        <div className="mb-12 text-center">
          <img src={logoUrl} alt="Pylon" className="mx-auto mb-4 h-20 w-20" />
          <h1 className="text-4xl font-bold tracking-tight text-stone-100">Pylon</h1>
          <p className="mt-2 text-stone-500">AI-powered development assistant</p>
          <button
            onClick={openFolder}
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-amber-600 px-5 py-2.5 text-sm font-medium text-stone-50 transition-colors hover:bg-amber-500"
          >
            <FolderOpen size={16} />
            Open Folder
          </button>
        </div>

        {projects.length > 0 && (
          <div className="mb-8">
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-stone-600">Projects</p>
            <div className="space-y-1">
              {projects.map((project) => (
                <button
                  key={project.path}
                  onClick={() => openPath(project.path)}
                  className="group flex w-full items-start gap-3 rounded-lg p-3 text-left transition-colors hover:bg-stone-800/60"
                >
                  <Folder size={14} className="mt-0.5 flex-shrink-0 text-stone-600" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-stone-300">
                      {project.path.split('/').pop()}
                    </p>
                    <p className="truncate text-xs text-stone-600">{project.path}</p>
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
