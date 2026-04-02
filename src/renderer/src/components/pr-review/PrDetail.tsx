import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  GitBranch,
  GitPullRequest,
  GitPullRequestDraft,
  Loader2,
  Play,
  RotateCw,
  User,
} from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'
import type { ReviewFocus } from '../../../../shared/types'
import { usePrReviewStore } from '../../store/pr-review-store'
import { DiffFileTree } from './DiffFileTree'
import { DiffPane } from './DiffPane'
import { PostActions } from './PostActions'
import { PrFilesChanged } from './PrFilesChanged'
import { ReviewHistory } from './ReviewHistory'
import { ReviewModal } from './ReviewModal'
import { ReviewProgress } from './ReviewProgress'

const COLLAPSED_HEIGHT = 96 // ~6 lines of text

function PrBody({ body }: { body: string }) {
  const contentRef = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [needsTruncation, setNeedsTruncation] = useState(false)

  // Re-measure whenever body changes — useLayoutEffect ensures we measure
  // after React commits the new DOM but before the browser paints
  // biome-ignore lint/correctness/useExhaustiveDependencies: body drives content height changes
  useLayoutEffect(() => {
    if (contentRef.current) {
      setNeedsTruncation(contentRef.current.scrollHeight > COLLAPSED_HEIGHT + 8)
    }
  }, [body])

  return (
    <div className="relative rounded-lg bg-base-surface/60">
      <div
        ref={contentRef}
        className={`prose prose-invert prose-xs max-w-none overflow-hidden prose-img:rounded prose-blockquote:border-base-border p-3 prose-a:text-info prose-blockquote:text-base-text-muted prose-code:text-base-text prose-headings:text-base-text prose-strong:text-base-text text-base-text-secondary text-xs leading-relaxed prose-a:no-underline hover:prose-a:underline ${!expanded && needsTruncation ? 'pr-body-collapsed' : ''}`}
        style={!expanded && needsTruncation ? { maxHeight: COLLAPSED_HEIGHT } : undefined}
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, rehypeSanitize]}>
          {body}
        </ReactMarkdown>
      </div>
      {needsTruncation && (
        <>
          {!expanded && (
            <div className="pointer-events-none absolute right-0 bottom-7 left-0 h-8 bg-linear-to-t from-base-surface/60 to-transparent" />
          )}
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="flex w-full cursor-pointer items-center justify-center gap-1 rounded-b-lg py-1 text-base-text-muted text-xs transition-colors hover:text-base-text"
          >
            {expanded ? (
              <>
                Show less <ChevronUp size={12} />
              </>
            ) : (
              <>
                Read more <ChevronDown size={12} />
              </>
            )}
          </button>
        </>
      )}
    </div>
  )
}

function splitDiffByFile(fullDiff: string): Map<string, string> {
  const map = new Map<string, string>()
  const chunks = fullDiff.split(/^(?=diff --git )/m)
  for (const chunk of chunks) {
    if (!chunk.startsWith('diff --git ')) continue
    const headerMatch = chunk.match(/^diff --git a\/(.+?) b\/(.+)/)
    if (!headerMatch) continue
    map.set(headerMatch[2], chunk)
  }
  return map
}

export function PrDetail() {
  const {
    selectedPr,
    prDetail,
    prDetailLoading,
    prDetailError,
    activeReview,
    activeFindings,
    selectedFindingIds,
    startReview,
    stopReview,
    toggleFinding,
    postFinding,
    selectPr,
  } = usePrReviewStore()
  const [showReviewModal, setShowReviewModal] = useState(false)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [treeWidth, setTreeWidth] = useState(220)
  const resizing = useRef(false)

  // Reset file selection when review or PR changes
  useEffect(() => {
    setSelectedFile(null)
  }, [])

  const onResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      resizing.current = true
      const startX = e.clientX
      const startWidth = treeWidth

      const onMove = (ev: MouseEvent) => {
        if (!resizing.current) return
        const newWidth = Math.max(140, Math.min(500, startWidth + ev.clientX - startX))
        setTreeWidth(newWidth)
      }
      const onUp = () => {
        resizing.current = false
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    },
    [treeWidth],
  )

  const fileDiffs = useMemo(
    () => (prDetail?.diff ? splitDiffByFile(prDetail.diff) : new Map<string, string>()),
    [prDetail?.diff],
  )

  if (!selectedPr) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-base-text-faint">
        <GitPullRequest size={32} strokeWidth={1.5} />
        <span className="text-sm">Select a PR to review</span>
      </div>
    )
  }

  if (prDetailLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 size={16} className="animate-spin text-base-text-muted" />
      </div>
    )
  }

  if (prDetailError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
        <AlertTriangle size={28} className="text-warning" />
        <span className="font-medium text-base-text text-sm">Failed to load PR details</span>
        <span className="max-w-md text-base-text-muted text-xs leading-relaxed">
          {prDetailError}
        </span>
        <button
          type="button"
          onClick={() => selectedPr && selectPr(selectedPr)}
          className="mt-1 rounded-md bg-base-raised px-3 py-1.5 text-base-text text-xs ring-1 ring-base-border transition-colors hover:bg-base-surface"
        >
          Retry
        </button>
      </div>
    )
  }

  const pr = prDetail ?? selectedPr
  const isRunning = activeReview?.status === 'running'
  const isDone = activeReview?.status === 'done'
  const PrIcon = pr.isDraft ? GitPullRequestDraft : GitPullRequest

  const handlePostFinding = (finding: (typeof activeFindings)[number]) => {
    if (!selectedPr) return
    postFinding(finding, selectedPr.repo.fullName, selectedPr.number)
  }

  const handleStartReview = (focus: ReviewFocus[]) => {
    if (!selectedPr?.repo) return
    startReview(selectedPr.repo, selectedPr, focus)
  }

  return (
    <div className="flex h-full flex-col">
      {/* PR Header with review button */}
      <div className="border-base-border-subtle border-b bg-base-bg/50 px-5 py-3">
        <div className="flex items-start gap-3">
          <PrIcon
            size={18}
            className={`mt-0.5 shrink-0 ${pr.isDraft ? 'text-base-text-muted' : 'text-emerald-500'}`}
          />
          <div className="min-w-0 flex-1">
            <div className="mb-0.5 truncate font-mono text-[11px] text-base-text-muted">
              {pr.repo.fullName}
            </div>
            <div className="flex items-baseline gap-2">
              <h2 className="font-semibold text-base-text text-sm">{pr.title}</h2>
              <span className="shrink-0 text-base-text-faint text-xs">#{pr.number}</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-base-text-muted">
              <span className="flex items-center gap-1">
                <User size={10} /> {pr.author}
              </span>
              <span className="flex items-center gap-1 font-mono">
                <GitBranch size={10} />
                <span className="text-base-text-secondary">{pr.headBranch}</span>
                <span className="text-base-text-faint">&rarr;</span>
                <span>{pr.baseBranch}</span>
              </span>
              <span className="flex items-center gap-1.5 font-mono tabular-nums">
                <span className="text-emerald-500">+{pr.additions}</span>
                <span className="text-error">-{pr.deletions}</span>
              </span>
              <a
                href={pr.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 transition-colors hover:text-base-text"
                onClick={(e) => {
                  e.preventDefault()
                  window.open(pr.url, '_blank')
                }}
              >
                <ExternalLink size={10} /> GitHub
              </a>
            </div>
          </div>

          {/* Review button — right side of header */}
          {!isRunning && (
            <button
              type="button"
              onClick={() => setShowReviewModal(true)}
              className="flex shrink-0 items-center gap-1.5 rounded-lg bg-base-text px-3.5 py-1.5 font-semibold text-[12px] text-base-bg transition-colors hover:bg-white"
            >
              {isDone ? <RotateCw size={12} /> : <Play size={12} />}
              {isDone ? 'Re-run' : 'Review'}
            </button>
          )}
          {isRunning && (
            <span className="flex shrink-0 items-center gap-1.5 rounded-lg border border-base-border px-3 py-1.5 text-[11px] text-base-text-secondary">
              <Loader2 size={11} className="animate-spin" />
              Reviewing...
            </span>
          )}
        </div>
      </div>

      {/* Pre-review state */}
      {!isDone && (
        <div className="flex min-h-0 flex-1 flex-col">
          {/* Collapsible top section */}
          {!isRunning && (
            <div className="space-y-4 overflow-y-auto px-5 py-4">
              {prDetail?.body && <PrBody body={prDetail.body} />}

              {prDetail?.files && prDetail.files.length > 0 && (
                <PrFilesChanged files={prDetail.files} diff={prDetail.diff} />
              )}

              <ReviewHistory />
            </div>
          )}

          {/* Streaming progress fills remaining height */}
          {isRunning && activeReview && (
            <>
              <div className="px-5 py-2">
                <ReviewHistory />
              </div>
              <div className="min-h-0 flex-1 px-5 pb-4">
                <ReviewProgress
                  reviewId={activeReview.id}
                  onStop={() => stopReview(activeReview.id)}
                  isLive
                />
              </div>
            </>
          )}
        </div>
      )}

      {/* Post-review: two-pane diff viewer with inline findings */}
      {isDone && prDetail && (
        <div className="flex min-h-0 flex-1 flex-col">
          {/* Review history bar */}
          <div className="border-base-border-subtle border-b px-3 py-1.5">
            <ReviewHistory />
          </div>

          {/* Two-pane layout */}
          <div className="flex min-h-0 flex-1">
            <div className="shrink-0" style={{ width: treeWidth }}>
              <DiffFileTree
                files={prDetail.files}
                findings={activeFindings}
                selectedFile={selectedFile}
                onSelectFile={setSelectedFile}
              />
            </div>
            {/* Resize handle */}
            {/* biome-ignore lint/a11y/noStaticElementInteractions: mouse-only resize handle */}
            <div
              onMouseDown={onResizeStart}
              className="group relative w-0 shrink-0 cursor-col-resize"
            >
              <div className="absolute inset-y-0 -left-px w-0.75 transition-colors group-hover:bg-base-text-faint group-active:bg-base-text-muted" />
            </div>
            <div className="min-w-0 flex-1">
              <DiffPane
                selectedFile={selectedFile}
                files={prDetail.files}
                fileDiffs={fileDiffs}
                findings={activeFindings}
                selectedFindingIds={selectedFindingIds}
                onToggleFinding={toggleFinding}
                onPostFinding={handlePostFinding}
              />
            </div>
          </div>
        </div>
      )}

      {/* Post actions footer */}
      {isDone && selectedPr && (
        <PostActions repoFullName={selectedPr.repo.fullName} prNumber={selectedPr.number} />
      )}

      {/* Review modal */}
      {showReviewModal && (
        <ReviewModal
          onStart={handleStartReview}
          onClose={() => setShowReviewModal(false)}
          isRerun={isDone}
        />
      )}
    </div>
  )
}
