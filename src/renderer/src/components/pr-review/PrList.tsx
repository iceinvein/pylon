import { useState, useEffect } from 'react'
import { Search, Loader2 } from 'lucide-react'
import { usePrReviewStore } from '../../store/pr-review-store'
import { PrCard } from './PrCard'

export function PrList() {
  const {
    repos, reposLoading, selectedRepo, setSelectedRepo,
    prs, prsLoading, selectedPr, selectPr, loadRepos, loadPrs,
  } = usePrReviewStore()

  const [search, setSearch] = useState('')

  useEffect(() => {
    loadRepos()
  }, [])

  useEffect(() => {
    if (repos.length > 0) {
      loadPrs(selectedRepo ?? undefined)
    }
  }, [repos])

  const filteredPrs = search
    ? prs.filter((pr) =>
        pr.title.toLowerCase().includes(search.toLowerCase()) ||
        String(pr.number).includes(search)
      )
    : prs

  return (
    <div className="flex h-full flex-col border-r border-stone-800">
      <div className="border-b border-stone-800 p-3">
        <select
          value={selectedRepo ?? '__all__'}
          onChange={(e) => setSelectedRepo(e.target.value === '__all__' ? null : e.target.value)}
          className="w-full rounded-md bg-stone-800 px-2.5 py-1.5 text-xs text-stone-300 outline-none ring-1 ring-stone-700 focus:ring-stone-500"
        >
          <option value="__all__">All repos</option>
          {repos.map((r) => (
            <option key={r.fullName} value={r.fullName}>
              {r.fullName}
            </option>
          ))}
        </select>

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
