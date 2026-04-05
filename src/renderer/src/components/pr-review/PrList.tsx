import { Check, ChevronDown, Loader2, Search } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { GhPullRequest } from '../../../../shared/types'
import { usePrReviewStore } from '../../store/pr-review-store'
import { PrCard } from './PrCard'

export function PrList() {
  const {
    repos,
    reposLoading,
    selectedRepo,
    setSelectedRepo,
    prs,
    prsLoading,
    selectedPr,
    selectPr,
    loadRepos,
    loadPrs,
  } = usePrReviewStore()

  const [search, setSearch] = useState('')
  const [repoMenuOpen, setRepoMenuOpen] = useState(false)
  const repoMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadRepos()
  }, [loadRepos])

  useEffect(() => {
    if (repos.length > 0) {
      loadPrs(selectedRepo ?? undefined)
    }
  }, [repos, loadPrs, selectedRepo])

  // Close menu on click outside
  useEffect(() => {
    if (!repoMenuOpen) return
    function handleClick(e: MouseEvent) {
      if (repoMenuRef.current && !repoMenuRef.current.contains(e.target as Node)) {
        setRepoMenuOpen(false)
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setRepoMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [repoMenuOpen])

  const filteredPrs = search
    ? prs.filter(
        (pr) =>
          pr.title.toLowerCase().includes(search.toLowerCase()) ||
          String(pr.number).includes(search) ||
          pr.repo.fullName.toLowerCase().includes(search.toLowerCase()),
      )
    : prs

  const showingAllRepos = !selectedRepo

  /** Group PRs by repo when viewing all repos, preserving order of first appearance. */
  const groupedPrs = useMemo(() => {
    if (!showingAllRepos) return null
    const groups: Array<{ repoFullName: string; prs: GhPullRequest[] }> = []
    const seen = new Map<string, GhPullRequest[]>()
    for (const pr of filteredPrs) {
      const key = pr.repo.fullName
      const existing = seen.get(key)
      if (existing) {
        existing.push(pr)
      } else {
        const arr = [pr]
        seen.set(key, arr)
        groups.push({ repoFullName: key, prs: arr })
      }
    }
    return groups
  }, [showingAllRepos, filteredPrs])

  const selectedLabel = selectedRepo
    ? (repos.find((r) => r.fullName === selectedRepo)?.fullName ?? selectedRepo)
    : 'All repos'

  return (
    <div className="flex h-full flex-col border-base-border-subtle border-r">
      <div className="border-base-border-subtle border-b p-3">
        {/* Repo filter dropdown */}
        <div ref={repoMenuRef} className="relative">
          <button
            type="button"
            onClick={() => setRepoMenuOpen((v) => !v)}
            className="flex w-full items-center justify-between rounded-md bg-base-raised px-2.5 py-1.5 text-base-text text-xs ring-1 ring-base-border transition-colors hover:ring-base-border"
          >
            <span className="truncate">{selectedLabel}</span>
            <ChevronDown
              size={12}
              className={`ml-1.5 shrink-0 text-base-text-muted transition-transform ${repoMenuOpen ? 'rotate-180' : ''}`}
            />
          </button>
          <AnimatePresence>
            {repoMenuOpen && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.12 }}
                className="absolute top-full right-0 left-0 z-50 mt-1 max-h-60 overflow-y-auto rounded-lg border border-base-border bg-base-surface py-1 shadow-xl"
              >
                <button
                  type="button"
                  onClick={() => {
                    setSelectedRepo(null)
                    setRepoMenuOpen(false)
                  }}
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-base-raised"
                >
                  <span className={`h-3 w-3 shrink-0 ${!selectedRepo ? '' : 'opacity-0'}`}>
                    {!selectedRepo && <Check size={12} className="text-base-text" />}
                  </span>
                  <span className={!selectedRepo ? 'text-base-text' : 'text-base-text-secondary'}>
                    All repos
                  </span>
                </button>
                {repos.map((r) => {
                  const isSelected = selectedRepo === r.fullName
                  return (
                    <button
                      type="button"
                      key={r.fullName}
                      onClick={() => {
                        setSelectedRepo(r.fullName)
                        setRepoMenuOpen(false)
                      }}
                      className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-base-raised"
                    >
                      <span className={`h-3 w-3 shrink-0 ${isSelected ? '' : 'opacity-0'}`}>
                        {isSelected && <Check size={12} className="text-base-text" />}
                      </span>
                      <span
                        className={`truncate ${isSelected ? 'text-base-text' : 'text-base-text-secondary'}`}
                      >
                        {r.fullName}
                      </span>
                    </button>
                  )
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="relative mt-2">
          <Search
            size={13}
            className="absolute top-1/2 left-2.5 -translate-y-1/2 text-base-text-muted"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter PRs..."
            className="w-full rounded-md bg-base-raised py-1.5 pr-3 pl-8 text-base-text text-xs placeholder-base-text-faint outline-none ring-1 ring-base-border focus:ring-accent"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {prsLoading || reposLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={16} className="animate-spin text-base-text-muted" />
          </div>
        ) : filteredPrs.length === 0 ? (
          <div className="py-8 text-center text-base-text-muted text-xs">
            {repos.length === 0
              ? 'No GitHub projects found. Add a project first.'
              : 'No open PRs found.'}
          </div>
        ) : groupedPrs ? (
          <div className="space-y-3">
            {groupedPrs.map((group) => (
              <div key={group.repoFullName}>
                <div className="sticky top-0 z-10 flex items-center gap-2 bg-base-bg/95 px-2 py-1.5 backdrop-blur-sm">
                  <span className="truncate font-mono text-base-text-secondary text-xs">
                    {group.repoFullName}
                  </span>
                  <span className="shrink-0 rounded-full bg-base-border/50 px-1.5 py-px text-[10px] text-base-text-faint tabular-nums">
                    {group.prs.length}
                  </span>
                </div>
                <div className="space-y-1">
                  {group.prs.map((pr) => (
                    <PrCard
                      key={`${pr.repo.fullName}#${pr.number}`}
                      pr={pr}
                      selected={
                        selectedPr?.number === pr.number &&
                        selectedPr?.repo.fullName === pr.repo.fullName
                      }
                      onClick={() => selectPr(pr)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-1">
            {filteredPrs.map((pr) => (
              <PrCard
                key={`${pr.repo.fullName}#${pr.number}`}
                pr={pr}
                selected={
                  selectedPr?.number === pr.number && selectedPr?.repo.fullName === pr.repo.fullName
                }
                onClick={() => selectPr(pr)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
