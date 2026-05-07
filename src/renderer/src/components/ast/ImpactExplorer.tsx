import { FileCode2, Search } from 'lucide-react'
import { useCallback, useMemo, useRef } from 'react'
import type { CodeEntity } from '../../../../shared/types'
import { useAstStore } from '../../store/ast-store'

function entityKey(entity: CodeEntity): string {
  return entity.kind === 'file' ? `file:${entity.filePath}` : `symbol:${entity.symbolId}`
}

function entityLabel(entity: CodeEntity): string {
  if (entity.kind === 'symbol') return entity.symbolName
  return entity.filePath.split('/').pop() ?? entity.filePath
}

function entityDetail(entity: CodeEntity): string {
  if (entity.kind === 'symbol') {
    return `${entity.symbolType} · ${entity.filePath}:${entity.startLine}`
  }
  return entity.filePath
}

function isSameEntity(a: CodeEntity | null, b: CodeEntity): boolean {
  if (!a || a.kind !== b.kind || a.filePath !== b.filePath) return false
  return a.kind === 'file' || b.kind === 'file' || a.symbolId === b.symbolId
}

export function ImpactExplorer() {
  const scope = useAstStore((s) => s.scope)
  const repoGraph = useAstStore((s) => s.repoGraph)
  const searchQuery = useAstStore((s) => s.searchQuery)
  const entitySearchResults = useAstStore((s) => s.entitySearchResults)
  const selectedEntity = useAstStore((s) => s.selectedEntity)
  const setSearchQuery = useAstStore((s) => s.setSearchQuery)
  const setEntitySearchResults = useAstStore((s) => s.setEntitySearchResults)
  const setSelectedEntity = useAstStore((s) => s.setSelectedEntity)
  const searchRequestRef = useRef(0)

  const fileEntities = useMemo<CodeEntity[]>(() => {
    return (repoGraph?.files ?? []).map((file) => ({
      kind: 'file',
      filePath: file.filePath,
    }))
  }, [repoGraph])

  const visibleEntities = searchQuery.trim() ? entitySearchResults : fileEntities

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchQuery(value)
      const requestId = searchRequestRef.current + 1
      searchRequestRef.current = requestId

      const query = value.trim()
      if (!query || !scope) {
        setEntitySearchResults([])
        return
      }

      window.api
        .searchEntities(scope, query)
        .then((results) => {
          if (searchRequestRef.current === requestId) {
            setEntitySearchResults(results)
          }
        })
        .catch(() => {
          if (searchRequestRef.current === requestId) {
            setEntitySearchResults([])
          }
        })
    },
    [scope, setSearchQuery, setEntitySearchResults],
  )

  const handleSelectEntity = useCallback(
    (entity: CodeEntity) => {
      setSelectedEntity(entity)
    },
    [setSelectedEntity],
  )

  return (
    <aside className="flex h-full min-h-0 w-65 shrink-0 flex-col border-base-border border-r bg-base-surface">
      <div className="border-base-border border-b px-3 py-2">
        <div className="mb-2 flex items-center gap-1.5">
          <FileCode2 size={13} className="text-base-text-muted" />
          <span className="font-medium text-base-text text-xs">Impact Explorer</span>
        </div>
        <label className="flex h-7 items-center gap-1.5 rounded-md border border-base-border bg-base-bg px-2">
          <Search size={12} className="shrink-0 text-base-text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search files and symbols..."
            className="min-w-0 flex-1 bg-transparent text-base-text text-xs placeholder:text-base-text-muted focus:outline-none"
          />
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {visibleEntities.length === 0 ? (
          <div className="px-3 py-6 text-center text-base-text-muted text-xs">
            {searchQuery.trim() ? 'No matching entities' : 'No files indexed'}
          </div>
        ) : (
          <ul className="flex flex-col">
            {visibleEntities.map((entity) => {
              const selected = isSameEntity(selectedEntity, entity)
              return (
                <li key={entityKey(entity)}>
                  <button
                    type="button"
                    onClick={() => handleSelectEntity(entity)}
                    className={`flex w-full items-start gap-2 px-3 py-1.5 text-left transition-colors ${
                      selected
                        ? 'bg-base-raised text-base-text'
                        : 'text-base-text-secondary hover:bg-base-raised/60 hover:text-base-text'
                    }`}
                    title={entityDetail(entity)}
                  >
                    <FileCode2
                      size={13}
                      className={`mt-0.5 shrink-0 ${
                        entity.kind === 'symbol' ? 'text-special-text' : 'text-base-text-muted'
                      }`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-xs">
                        {entityLabel(entity)}
                      </span>
                      <span className="block truncate text-[10px] text-base-text-muted">
                        {entityDetail(entity)}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </aside>
  )
}
