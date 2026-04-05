import { GitPullRequestArrow, Loader2, Search, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useState } from 'react'
import { usePrRaiseStore } from '../../store/pr-raise-store'
import { PrRaiseCommits } from './PrRaiseCommits'
import { PrRaiseDescription } from './PrRaiseDescription'
import { PrRaiseFiles } from './PrRaiseFiles'
import { PrRaiseMetadata } from './PrRaiseMetadata'

type TabId = 'description' | 'files' | 'commits'

export function PrRaiseOverlay() {
  const overlay = usePrRaiseStore((s) => s.overlay)
  const closeOverlay = usePrRaiseStore((s) => s.closeOverlay)
  const createPr = usePrRaiseStore((s) => s.createPr)
  const fetchInfo = usePrRaiseStore((s) => s.fetchInfo)
  const fetchDescription = usePrRaiseStore((s) => s.fetchDescription)

  const [activeTab, setActiveTab] = useState<TabId>('description')
  const [editedTitle, setEditedTitle] = useState('')
  const [editedBody, setEditedBody] = useState('')
  const [baseBranch, setBaseBranch] = useState('main')
  const [squash, setSquash] = useState(false)

  const isOpen = overlay !== null
  const info = overlay?.info
  const description = overlay?.description
  const creating = overlay?.creating ?? false
  const result = overlay?.result
  const loading = overlay?.loading ?? false
  const error = overlay?.error

  // Fetch info and description when overlay opens
  useEffect(() => {
    if (!overlay?.sessionId) return
    fetchInfo(overlay.sessionId)
    fetchDescription(overlay.sessionId)
  }, [overlay?.sessionId, fetchInfo, fetchDescription])

  // Sync description edits when AI-generated description arrives
  useEffect(() => {
    if (description) {
      setEditedTitle((prev) => prev || description.title)
      setEditedBody((prev) => prev || description.body)
    }
  }, [description])

  // Sync base branch from info
  useEffect(() => {
    if (info) {
      setBaseBranch(info.baseBranch)
    }
  }, [info])

  // Reset local state when overlay opens fresh
  useEffect(() => {
    if (isOpen) {
      setActiveTab('description')
      setEditedTitle('')
      setEditedBody('')
      setSquash(false)
    }
  }, [isOpen])

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') closeOverlay()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, closeOverlay])

  const handleCreate = useCallback(() => {
    if (!overlay?.sessionId || !editedTitle) return
    createPr({
      sessionId: overlay.sessionId,
      title: editedTitle,
      body: editedBody,
      baseBranch,
      squash,
    })
  }, [overlay?.sessionId, editedTitle, editedBody, baseBranch, squash, createPr])

  // After successful creation, close and emit a message into the chat
  useEffect(() => {
    if (!result?.success) return
    const timer = setTimeout(() => closeOverlay(), 1500)
    return () => clearTimeout(timer)
  }, [result?.success, closeOverlay])

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="pr-raise-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/60"
            onClick={closeOverlay}
          />
          {/* Slide-over panel */}
          <motion.div
            key="pr-raise-slider"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
            className="fixed top-0 right-0 bottom-0 z-50 flex w-[70vw] min-w-120 max-w-250 flex-col border-info/20 border-l bg-base-bg shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-base-border-subtle border-b px-6 py-4">
              <div className="flex items-center gap-2.5 font-semibold text-base text-base-text">
                <GitPullRequestArrow size={18} className="text-info" />
                Raise Pull Request
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="rounded-md border border-base-border bg-base-raised px-3 py-1.5 text-[12px] text-base-text-secondary transition-colors hover:bg-base-border hover:text-base-text"
                  title="Run self-review on changes (coming soon)"
                  disabled
                >
                  <span className="flex items-center gap-1.5">
                    <Search size={13} />
                    Self-Review
                  </span>
                </button>
                <button
                  type="button"
                  onClick={closeOverlay}
                  className="rounded-md p-1.5 text-base-text-muted transition-colors hover:bg-base-raised hover:text-base-text"
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {loading ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3">
                <Loader2 size={24} className="animate-spin text-base-text-muted" />
                <span className="text-base-text-muted text-sm">Loading PR info...</span>
              </div>
            ) : error ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6">
                <span className="text-error text-sm">Error</span>
                <span className="text-center text-[12px] text-base-text-muted">{error}</span>
              </div>
            ) : (
              <>
                {/* Metadata */}
                <PrRaiseMetadata
                  info={info ?? null}
                  title={editedTitle}
                  onTitleChange={setEditedTitle}
                  baseBranch={baseBranch}
                  onBaseBranchChange={setBaseBranch}
                  squash={squash}
                  onSquashChange={setSquash}
                />

                {/* Tabs */}
                <div className="flex border-base-border-subtle border-b px-6 text-sm">
                  {(['description', 'files', 'commits'] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setActiveTab(tab)}
                      className={`px-3 py-2.5 capitalize transition-colors ${
                        activeTab === tab
                          ? 'border-info border-b-2 text-info'
                          : 'text-base-text-muted hover:text-base-text'
                      }`}
                    >
                      {tab}
                      {tab === 'files' && info ? ` (${info.files.length})` : ''}
                      {tab === 'commits' && info ? ` (${info.commits.length})` : ''}
                    </button>
                  ))}
                </div>

                {/* Tab content */}
                <div className="min-h-0 flex-1 overflow-y-auto">
                  {activeTab === 'description' && (
                    <PrRaiseDescription
                      body={editedBody}
                      onBodyChange={setEditedBody}
                      generating={!description}
                    />
                  )}
                  {activeTab === 'files' && info && <PrRaiseFiles info={info} />}
                  {activeTab === 'commits' && info && <PrRaiseCommits commits={info.commits} />}
                </div>

                {/* Footer */}
                <div className="flex items-center gap-3 border-base-border-subtle border-t px-6 py-4">
                  {result?.success ? (
                    <div className="flex flex-1 items-center gap-2 text-sm text-success">
                      <span>✓ PR #{result.prNumber} created!</span>
                      <a
                        href={result.prUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-info underline hover:text-info"
                      >
                        View on GitHub
                      </a>
                    </div>
                  ) : result?.error ? (
                    <div className="flex-1 text-error text-xs">{result.error}</div>
                  ) : (
                    <div className="flex-1" />
                  )}
                  <button
                    type="button"
                    onClick={closeOverlay}
                    className="rounded-md border border-base-border bg-base-raised px-5 py-2 text-base-text text-sm transition-colors hover:bg-base-border"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleCreate}
                    disabled={creating || !editedTitle || !info || result?.success === true}
                    className="rounded-md bg-info px-5 py-2 font-medium text-sm text-white transition-colors hover:bg-info disabled:opacity-40"
                  >
                    {creating ? (
                      <span className="flex items-center gap-2">
                        <Loader2 size={14} className="animate-spin" />
                        Creating...
                      </span>
                    ) : (
                      'Create PR'
                    )}
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
