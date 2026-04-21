import { Check, ChevronDown, Loader2, Search, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GhPrStateFilter, GhPullRequest } from '../../../../shared/types'
import { usePrReviewStore } from '../../store/pr-review-store'
import { PrCard } from './PrCard'

type ProjectFolder = {
  path: string
  lastUsed: number
}

const PR_STATE_OPTIONS: Array<{ value: GhPrStateFilter; label: string; emptyLabel: string }> = [
  { value: 'open', label: 'Open', emptyLabel: 'open PRs' },
  { value: 'closed', label: 'Closed', emptyLabel: 'closed PRs' },
  { value: 'merged', label: 'Merged', emptyLabel: 'merged PRs' },
  { value: 'all', label: 'All', emptyLabel: 'PRs' },
]

export function PrList() {
  const {
    repos,
    reposLoading,
    selectedRepo,
    setSelectedRepo,
    prStateFilter,
    setPrStateFilter,
    prs,
    prsLoading,
    selectedPr,
    selectPr,
    loadRepos,
    loadPrs,
  } = usePrReviewStore()

  const [search, setSearch] = useState('')
  const [repoMenuOpen, setRepoMenuOpen] = useState(false)
  const [projects, setProjects] = useState<ProjectFolder[]>([])
  const repoMenuRef = useRef<HTMLDivElement>(null)

  const refreshProjects = useCallback(async () => {
    try {
      const nextProjects = await window.api.listProjects()
      setProjects(nextProjects)
    } catch {
      setProjects([])
    }
  }, [])

  useEffect(() => {
    loadRepos()
  }, [loadRepos])

  useEffect(() => {
    if (repoMenuOpen) refreshProjects()
  }, [repoMenuOpen, refreshProjects])

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

  const filteredPrs = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return prs
    return prs.filter(
      (pr) =>
        pr.title.toLowerCase().includes(query) ||
        String(pr.number).includes(query) ||
        pr.repo.fullName.toLowerCase().includes(query),
    )
  }, [prs, search])

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
  const selectedStateOption =
    PR_STATE_OPTIONS.find((option) => option.value === prStateFilter) ?? PR_STATE_OPTIONS[0]
  const emptyPrsMessage = search.trim()
    ? `No ${selectedStateOption.emptyLabel} match your filter.`
    : `No ${selectedStateOption.emptyLabel} found.`
  const repoByProjectPath = useMemo(
    () => new Map(repos.map((repo) => [repo.projectPath, repo])),
    [repos],
  )

  async function handleAddProject() {
    const path = await window.api.openFolder()
    if (!path) return
    await window.api.addProject(path)
    await Promise.all([refreshProjects(), loadRepos()])
  }

  async function handleRemoveProject(e: React.MouseEvent, projectPath: string) {
    e.stopPropagation()
    await window.api.removeProject(projectPath)
    await Promise.all([refreshProjects(), loadRepos()])
  }

  return (
    <div className="flex h-full flex-col border-base-border-subtle border-r">
      <div className="border-base-border-subtle border-b p-3">
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
                className="absolute top-full right-0 left-0 z-50 mt-1 overflow-hidden rounded-lg border border-base-border bg-base-surface shadow-xl"
              >
                <div className="max-h-72 overflow-y-auto py-1">
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
                  {projects.map((project) => {
                    const repo = repoByProjectPath.get(project.path)
                    const isSelected = repo ? selectedRepo === repo.fullName : false
                    return (
                      <div
                        key={project.path}
                        className="group flex items-start gap-2 px-2.5 py-1.5 transition-colors hover:bg-base-raised"
                      >
                        <button
                          type="button"
                          disabled={!repo}
                          onClick={() => {
                            if (!repo) return
                            setSelectedRepo(repo.fullName)
                            setRepoMenuOpen(false)
                          }}
                          className="flex min-w-0 flex-1 items-start gap-2 text-left text-xs disabled:cursor-default"
                        >
                          <span
                            className={`mt-0.5 h-3 w-3 shrink-0 ${isSelected ? '' : 'opacity-0'}`}
                          >
                            {isSelected && <Check size={12} className="text-base-text" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span
                              className={`block truncate ${
                                repo
                                  ? isSelected
                                    ? 'text-base-text'
                                    : 'text-base-text-secondary'
                                  : 'text-base-text-faint'
                              }`}
                            >
                              {repo?.fullName ?? project.path.split('/').pop()}
                            </span>
                            <span className="block truncate text-[10px] text-base-text-faint">
                              {project.path}
                            </span>
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleRemoveProject(e, project.path)}
                          title="Remove project folder"
                          className="rounded p-0.5 text-base-text-faint opacity-0 transition-all hover:bg-base-raised hover:text-base-text group-hover:opacity-100"
                        >
                          <X size={11} />
                        </button>
                      </div>
                    )
                  })}
                  <button
                    type="button"
                    onClick={handleAddProject}
                    className="mt-1 flex w-full items-center px-2.5 py-1.5 text-left text-[10px] text-base-text-secondary transition-colors hover:bg-base-raised hover:text-base-text"
                  >
                    Add project folder...
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="mt-2 grid grid-cols-4 rounded-md bg-base-raised p-0.5 ring-1 ring-base-border">
          {PR_STATE_OPTIONS.map((option) => {
            const selected = option.value === prStateFilter
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={selected}
                onClick={() => setPrStateFilter(option.value)}
                className={`rounded px-1.5 py-1 font-medium text-[11px] transition-colors ${
                  selected
                    ? 'bg-base-bg text-base-text shadow-sm'
                    : 'text-base-text-muted hover:text-base-text'
                }`}
              >
                {option.label}
              </button>
            )
          })}
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
              : emptyPrsMessage}
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
