import { useState, useEffect, useRef } from 'react'
import { Search, Loader2, ChevronDown, Check } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { usePrReviewStore } from '../../store/pr-review-store'
import { PrCard } from './PrCard'

export function PrList() {
  const {
    repos, reposLoading, selectedRepo, setSelectedRepo,
    prs, prsLoading, selectedPr, selectPr, loadRepos, loadPrs,
  } = usePrReviewStore()

  const [search, setSearch] = useState('')
  const [repoMenuOpen, setRepoMenuOpen] = useState(false)
  const repoMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadRepos()
  }, [])

  useEffect(() => {
    if (repos.length > 0) {
      loadPrs(selectedRepo ?? undefined)
    }
  }, [repos])

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
    ? prs.filter((pr) =>
        pr.title.toLowerCase().includes(search.toLowerCase()) ||
        String(pr.number).includes(search)
      )
    : prs

  const selectedLabel = selectedRepo
    ? repos.find((r) => r.fullName === selectedRepo)?.fullName ?? selectedRepo
    : 'All repos'

  return (
    <div className="flex h-full flex-col border-r border-stone-800">
      <div className="border-b border-stone-800 p-3">
        {/* Repo filter dropdown */}
        <div ref={repoMenuRef} className="relative">
          <button
            onClick={() => setRepoMenuOpen((v) => !v)}
            className="flex w-full items-center justify-between rounded-md bg-stone-800 px-2.5 py-1.5 text-xs text-stone-300 ring-1 ring-stone-700 transition-colors hover:ring-stone-600"
          >
            <span className="truncate">{selectedLabel}</span>
            <ChevronDown size={12} className={`ml-1.5 flex-shrink-0 text-stone-500 transition-transform ${repoMenuOpen ? 'rotate-180' : ''}`} />
          </button>
          <AnimatePresence>
            {repoMenuOpen && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.12 }}
                className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-lg border border-stone-700 bg-stone-900 py-1 shadow-xl"
              >
                <button
                  onClick={() => { setSelectedRepo(null); setRepoMenuOpen(false) }}
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-stone-800"
                >
                  <span className={`h-3 w-3 flex-shrink-0 ${!selectedRepo ? '' : 'opacity-0'}`}>
                    {!selectedRepo && <Check size={12} className="text-stone-300" />}
                  </span>
                  <span className={!selectedRepo ? 'text-stone-200' : 'text-stone-400'}>All repos</span>
                </button>
                {repos.map((r) => {
                  const isSelected = selectedRepo === r.fullName
                  return (
                    <button
                      key={r.fullName}
                      onClick={() => { setSelectedRepo(r.fullName); setRepoMenuOpen(false) }}
                      className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-stone-800"
                    >
                      <span className={`h-3 w-3 flex-shrink-0 ${isSelected ? '' : 'opacity-0'}`}>
                        {isSelected && <Check size={12} className="text-stone-300" />}
                      </span>
                      <span className={`truncate ${isSelected ? 'text-stone-200' : 'text-stone-400'}`}>{r.fullName}</span>
                    </button>
                  )
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="relative mt-2">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter PRs..."
            className="w-full rounded-md bg-stone-800 py-1.5 pl-8 pr-3 text-xs text-stone-300 placeholder-stone-600 outline-none ring-1 ring-stone-700 focus:ring-stone-500"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {(prsLoading || reposLoading) ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={16} className="animate-spin text-stone-500" />
          </div>
        ) : filteredPrs.length === 0 ? (
          <div className="py-8 text-center text-xs text-stone-500">
            {repos.length === 0
              ? 'No GitHub projects found. Add a project first.'
              : 'No open PRs found.'}
          </div>
        ) : (
          <div className="space-y-1">
            {filteredPrs.map((pr) => (
              <PrCard
                key={`${pr.repo.fullName}#${pr.number}`}
                pr={pr}
                selected={selectedPr?.number === pr.number && selectedPr?.repo.fullName === pr.repo.fullName}
                onClick={() => selectPr(pr)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
