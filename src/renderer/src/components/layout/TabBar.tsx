import { Plus, X } from 'lucide-react'
import { memo, useRef } from 'react'
import type { SessionStatus, Tab } from '../../../../shared/types'
import { useFolderOpen } from '../../hooks/use-folder-open'
import { useSessionStore } from '../../store/session-store'
import { useTabStore } from '../../store/tab-store'
import { useUiStore } from '../../store/ui-store'
import { ProjectsPopover } from '../ProjectsPopover'
import { WorktreeDialog } from '../WorktreeDialog'

function StatusDot({ status }: { status: SessionStatus | undefined }) {
  if (!status || status === 'empty' || status === 'done') {
    return <span className="h-2 w-2 rounded-full bg-base-text-faint" />
  }
  if (status === 'running' || status === 'starting' || status === 'waiting') {
    return <span className="h-2 w-2 animate-pulse rounded-full bg-success" />
  }
  if (status === 'error') {
    return <span className="h-2 w-2 rounded-full bg-error" />
  }
  return null
}

/** Individual tab — subscribes only to its own session's status+title, not all sessions. */
const TabItem = memo(function TabItem({
  tab,
  isActive,
  shortcutNum,
  onSelect,
  onClose,
}: {
  tab: Tab
  isActive: boolean
  shortcutNum: number | null
  onSelect: () => void
  onClose: () => void
}) {
  const session = useSessionStore((s) =>
    tab.sessionId ? s.sessions.get(tab.sessionId) : undefined,
  )

  return (
    <div
      role="tab"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onSelect()
      }}
      className={`group flex h-7 min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-md px-3 text-xs transition-colors ${
        isActive
          ? 'bg-base-raised text-base-text'
          : 'text-base-text-secondary hover:bg-base-raised/60 hover:text-base-text'
      }`}
    >
      <StatusDot status={session?.status} />
      <span className="min-w-0 flex-1 truncate">{session?.title || tab.label}</span>
      <div className="relative ml-1 flex h-5 shrink-0 items-center justify-center">
        {shortcutNum !== null && (
          <span
            className={`px-1 text-[11px] tabular-nums transition-opacity group-hover:opacity-0 ${
              isActive ? 'text-base-text-muted' : 'text-base-text-faint'
            }`}
          >
            ⌘{shortcutNum}
          </span>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onClose()
          }}
          aria-label="Close tab"
          className="absolute inset-0 flex items-center justify-center rounded opacity-0 transition-opacity hover:bg-base-text-faint group-hover:opacity-100"
        >
          <X size={10} />
        </button>
      </div>
    </div>
  )
})

export function TabBar() {
  const { tabs, activeTabId, setActiveTab, closeTab } = useTabStore()
  const { dialogState, openFolder, openPath, confirmDialog, cancelDialog } = useFolderOpen()
  const newTabPopoverOpen = useUiStore((s) => s.newTabPopoverOpen)
  const setNewTabPopoverOpen = useUiStore((s) => s.setNewTabPopoverOpen)
  const plusBtnRef = useRef<HTMLButtonElement>(null)

  return (
    <>
      <div
        className="flex h-9 items-center border-base-border-subtle border-b bg-base-bg px-1"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <div className="flex min-w-0 flex-1 items-center gap-0.5">
          {tabs.map((tab, tabIndex) => (
            <TabItem
              key={tab.id}
              tab={tab}
              isActive={tab.id === activeTabId}
              shortcutNum={tabIndex < 9 ? tabIndex + 1 : null}
              onSelect={() => setActiveTab(tab.id)}
              onClose={() => closeTab(tab.id)}
            />
          ))}
        </div>

        <button
          ref={plusBtnRef}
          type="button"
          onClick={() => setNewTabPopoverOpen(!newTabPopoverOpen)}
          title="New Tab"
          aria-label="New Tab"
          className="ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-base-text-muted transition-colors hover:bg-base-raised hover:text-base-text"
        >
          <Plus size={14} />
        </button>
      </div>

      <ProjectsPopover
        open={newTabPopoverOpen}
        onClose={() => setNewTabPopoverOpen(false)}
        onSelectProject={(path) => openPath(path)}
        onBrowse={openFolder}
        anchorRef={plusBtnRef}
        position="below"
      />

      {dialogState && (
        <WorktreeDialog
          folderPath={dialogState.path}
          isDirty={dialogState.isDirty}
          onConfirm={confirmDialog}
          onCancel={cancelDialog}
        />
      )}
    </>
  )
}
