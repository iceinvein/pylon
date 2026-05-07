import { Clipboard, Loader2, Sparkles } from 'lucide-react'
import { useCallback, useMemo } from 'react'
import type { CodeEntity, ImpactEdge, ImpactPath } from '../../../../shared/types'
import { useAstStore } from '../../store/ast-store'

function entityLabel(entity: CodeEntity): string {
  return entity.kind === 'symbol'
    ? entity.symbolName
    : (entity.filePath.split('/').pop() ?? entity.filePath)
}

function entityContext(entity: CodeEntity): string {
  if (entity.kind === 'symbol') {
    return `${entity.symbolType} · ${entity.filePath}:${entity.startLine}-${entity.endLine}`
  }
  return entity.filePath
}

function isSameCodeEntity(a: CodeEntity | null, b: CodeEntity | null): boolean {
  if (a === b) return true
  if (!a || !b || a.kind !== b.kind || a.filePath !== b.filePath) return false
  if (a.kind === 'file' || b.kind === 'file') return true
  return a.symbolId === b.symbolId
}

function entityExplainArgs(entity: CodeEntity): {
  nodeId: string
  filePath: string
  context: string
} {
  if (entity.kind === 'symbol') {
    return { nodeId: entity.symbolId, filePath: entity.filePath, context: entity.symbolName }
  }
  return { nodeId: entity.filePath, filePath: entity.filePath, context: entity.filePath }
}

function createExplainRequestId(): string {
  return `impact-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function edgeEntity(edge: ImpactEdge, selected: CodeEntity): CodeEntity {
  if (edge.source.filePath === selected.filePath) return edge.target
  return edge.source
}

function uniqueConfidence(edges: ImpactEdge[], paths: ImpactPath[]): string {
  const values = new Set<string>()
  for (const edge of edges) values.add(edge.confidence)
  for (const path of paths) values.add(path.confidence)
  return Array.from(values).join(', ')
}

function EntityList({
  title,
  entities,
  onSelect,
}: {
  title: string
  entities: CodeEntity[]
  onSelect: (entity: CodeEntity) => void
}) {
  return (
    <section className="border-base-border border-t px-3 py-2">
      <div className="mb-1.5 flex items-center justify-between">
        <h3 className="font-medium text-[10px] text-base-text-muted uppercase tracking-wider">
          {title}
        </h3>
        <span className="text-[10px] text-base-text-muted">{entities.length}</span>
      </div>
      {entities.length === 0 ? (
        <p className="text-base-text-muted text-xs">None found</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {entities.map((entity) => (
            <li
              key={`${entity.kind}:${entity.filePath}:${entity.kind === 'symbol' ? entity.symbolId : ''}`}
            >
              <button
                type="button"
                onClick={() => onSelect(entity)}
                className="w-full rounded px-2 py-1 text-left transition-colors hover:bg-base-raised"
                title={entityContext(entity)}
              >
                <span className="block truncate font-mono text-base-text text-xs">
                  {entityLabel(entity)}
                </span>
                <span className="block truncate text-[10px] text-base-text-muted">
                  {entityContext(entity)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function ImpactPanel() {
  const selectedEntity = useAstStore((s) => s.selectedEntity)
  const impactSummary = useAstStore((s) => s.impactSummary)
  const impactLoading = useAstStore((s) => s.impactLoading)
  const impactError = useAstStore((s) => s.impactError)
  const explainText = useAstStore((s) => s.explainText)
  const explainLoading = useAstStore((s) => s.explainLoading)
  const setSelectedEntity = useAstStore((s) => s.setSelectedEntity)
  const currentImpactSummary = isSameCodeEntity(impactSummary?.selected ?? null, selectedEntity)
    ? impactSummary
    : null

  const dependencies = useMemo(() => {
    if (!currentImpactSummary || !selectedEntity) return []
    return currentImpactSummary.dependencies.map((edge) => edgeEntity(edge, selectedEntity))
  }, [currentImpactSummary, selectedEntity])

  const importers = useMemo(() => {
    if (!currentImpactSummary || !selectedEntity) return []
    return currentImpactSummary.importers.map((edge) => edgeEntity(edge, selectedEntity))
  }, [currentImpactSummary, selectedEntity])

  const confidence = useMemo(() => {
    if (!currentImpactSummary) return ''
    return uniqueConfidence(
      [
        ...currentImpactSummary.dependencies,
        ...currentImpactSummary.importers,
        ...currentImpactSummary.references,
      ],
      currentImpactSummary.paths,
    )
  }, [currentImpactSummary])

  const handleExplain = useCallback(() => {
    if (!selectedEntity) return
    const args = entityExplainArgs(selectedEntity)
    const requestId = createExplainRequestId()
    useAstStore.getState().setExplain(null, true, requestId)
    window.api.explainAstNode(args.nodeId, args.filePath, args.context, requestId)
  }, [selectedEntity])

  const handleCopy = useCallback(() => {
    if (!selectedEntity || !currentImpactSummary) return
    const lines = [
      `Selected: ${entityLabel(selectedEntity)}`,
      `Path: ${selectedEntity.filePath}`,
      `Dependencies: ${currentImpactSummary.dependencies.length}`,
      `Importers: ${currentImpactSummary.importers.length}`,
      `References: ${currentImpactSummary.references.length}`,
      `Likely tests: ${currentImpactSummary.likelyTests.map(entityLabel).join(', ') || 'none'}`,
      currentImpactSummary.notes.length ? `Notes: ${currentImpactSummary.notes.join(' ')}` : '',
    ].filter(Boolean)
    navigator.clipboard.writeText(lines.join('\n')).catch(() => {})
  }, [currentImpactSummary, selectedEntity])

  if (!selectedEntity) {
    return (
      <aside className="flex h-full min-h-0 w-[320px] shrink-0 flex-col items-center justify-center border-base-border border-l bg-base-surface px-5 text-center">
        <Sparkles size={18} className="mb-2 text-base-text-muted" />
        <p className="text-base-text-muted text-xs">Select a file or symbol to inspect impact</p>
      </aside>
    )
  }

  return (
    <aside className="flex h-full min-h-0 w-[320px] shrink-0 flex-col border-base-border border-l bg-base-surface">
      <div className="border-base-border border-b px-3 py-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="truncate font-medium font-mono text-base-text text-xs">
              {entityLabel(selectedEntity)}
            </h2>
            <p className="truncate text-[10px] text-base-text-muted">
              {entityContext(selectedEntity)}
            </p>
          </div>
          {currentImpactSummary?.stale && (
            <span className="shrink-0 rounded border border-warning/30 px-1.5 py-0.5 text-[10px] text-warning">
              Stale
            </span>
          )}
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleExplain}
            disabled={explainLoading}
            className="flex h-6 items-center gap-1 rounded border border-base-border px-2 text-[10px] text-base-text-muted transition-colors hover:bg-base-raised hover:text-base-text disabled:opacity-50"
          >
            {explainLoading ? (
              <Loader2 size={11} className="animate-spin" />
            ) : (
              <Sparkles size={11} />
            )}
            Explain
          </button>
          <button
            type="button"
            onClick={handleCopy}
            disabled={!currentImpactSummary}
            className="flex h-6 items-center gap-1 rounded border border-base-border px-2 text-[10px] text-base-text-muted transition-colors hover:bg-base-raised hover:text-base-text disabled:opacity-50"
          >
            <Clipboard size={11} />
            Copy
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {impactLoading && (
          <div className="flex items-center gap-2 px-3 py-3 text-base-text-muted text-xs">
            <Loader2 size={13} className="animate-spin" />
            Loading impact...
          </div>
        )}

        {impactError && <div className="px-3 py-3 text-error text-xs">{impactError}</div>}

        {currentImpactSummary && (
          <>
            <div className="grid grid-cols-3 gap-1 px-3 py-2">
              <div className="rounded border border-base-border bg-base-bg px-2 py-1.5">
                <div className="font-mono text-base-text text-sm">
                  {currentImpactSummary.dependencies.length}
                </div>
                <div className="text-[10px] text-base-text-muted">Deps</div>
              </div>
              <div className="rounded border border-base-border bg-base-bg px-2 py-1.5">
                <div className="font-mono text-base-text text-sm">
                  {currentImpactSummary.importers.length}
                </div>
                <div className="text-[10px] text-base-text-muted">Importers</div>
              </div>
              <div className="rounded border border-base-border bg-base-bg px-2 py-1.5">
                <div className="font-mono text-base-text text-sm">
                  {currentImpactSummary.likelyTests.length}
                </div>
                <div className="text-[10px] text-base-text-muted">Tests</div>
              </div>
            </div>

            {confidence && (
              <div className="px-3 pb-2 text-[10px] text-base-text-muted">
                Confidence: {confidence}
              </div>
            )}

            <EntityList title="Dependencies" entities={dependencies} onSelect={setSelectedEntity} />
            <EntityList title="Importers" entities={importers} onSelect={setSelectedEntity} />
            <EntityList
              title="Likely Tests"
              entities={currentImpactSummary.likelyTests}
              onSelect={setSelectedEntity}
            />

            {currentImpactSummary.paths.length > 0 && (
              <section className="border-base-border border-t px-3 py-2">
                <h3 className="mb-1.5 font-medium text-[10px] text-base-text-muted uppercase tracking-wider">
                  Paths
                </h3>
                <ul className="flex flex-col gap-1.5">
                  {currentImpactSummary.paths.map((path) => (
                    <li
                      key={path.id}
                      className="rounded border border-base-border bg-base-bg px-2 py-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-base-text text-xs">{path.label}</span>
                        <span className="shrink-0 text-[10px] text-base-text-muted">
                          {path.confidence}
                        </span>
                      </div>
                      <p className="mt-1 truncate font-mono text-[10px] text-base-text-muted">
                        {path.entities.map(entityLabel).join(' -> ')}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {currentImpactSummary.notes.length > 0 && (
              <section className="border-base-border border-t px-3 py-2">
                <h3 className="mb-1.5 font-medium text-[10px] text-base-text-muted uppercase tracking-wider">
                  Notes
                </h3>
                <ul className="list-disc space-y-1 pl-4 text-base-text-secondary text-xs">
                  {currentImpactSummary.notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </section>
            )}

            {explainText && (
              <section className="border-base-border border-t px-3 py-2">
                <h3 className="mb-1.5 font-medium text-[10px] text-base-text-muted uppercase tracking-wider">
                  Explanation
                </h3>
                <p className="whitespace-pre-wrap text-base-text-secondary text-xs leading-relaxed">
                  {explainText}
                </p>
              </section>
            )}
          </>
        )}
      </div>
    </aside>
  )
}
