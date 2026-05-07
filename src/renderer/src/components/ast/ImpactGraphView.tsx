import { useMemo } from 'react'
import type { CodeEntity, ImpactSummary } from '../../../../shared/types'
import { computeImpactLayout } from '../../lib/ast-layout'
import { useAstStore } from '../../store/ast-store'
import { GraphCanvas } from './GraphCanvas'

function entityId(entity: CodeEntity): string {
  return entity.kind === 'file' ? entity.filePath : `${entity.filePath}:${entity.symbolId}`
}

function isSameCodeEntity(a: CodeEntity | null, b: CodeEntity | null): boolean {
  if (a === b) return true
  if (!a || !b || a.kind !== b.kind || a.filePath !== b.filePath) return false
  if (a.kind === 'file' || b.kind === 'file') return true
  return a.symbolId === b.symbolId
}

function entityDetail(entity: CodeEntity): string {
  if (entity.kind === 'symbol') return entity.filePath.split('/').pop() ?? entity.filePath
  const dirIndex = entity.filePath.lastIndexOf('/')
  return dirIndex > 0 ? entity.filePath.slice(0, dirIndex) : entity.filePath
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value
}

function collectEntities(summary: ImpactSummary): Map<string, CodeEntity> {
  const entities = new Map<string, CodeEntity>()
  const add = (entity: CodeEntity) => entities.set(entityId(entity), entity)

  add(summary.selected)
  for (const edge of summary.dependencies) {
    add(edge.source)
    add(edge.target)
  }
  for (const edge of summary.importers) {
    add(edge.source)
    add(edge.target)
  }
  for (const edge of summary.references) {
    add(edge.source)
    add(edge.target)
  }
  for (const entity of summary.likelyTests) {
    add(entity)
  }

  return entities
}

function edgeColor(label?: string): string {
  switch (label) {
    case 'dependency':
      return '#7ee787'
    case 'importer':
      return '#58a6ff'
    case 'reference':
      return '#d2a8ff'
    case 'test':
      return '#ffa657'
    default:
      return '#484f58'
  }
}

export function ImpactGraphView() {
  const selectedEntity = useAstStore((s) => s.selectedEntity)
  const impactSummary = useAstStore((s) => s.impactSummary)
  const setSelectedEntity = useAstStore((s) => s.setSelectedEntity)
  const currentImpactSummary = isSameCodeEntity(impactSummary?.selected ?? null, selectedEntity)
    ? impactSummary
    : null

  const layout = useMemo(
    () => (currentImpactSummary ? computeImpactLayout(currentImpactSummary) : null),
    [currentImpactSummary],
  )

  const nodeMap = useMemo(() => {
    if (!layout) return new Map<string, NonNullable<typeof layout>['nodes'][number]>()
    return new Map(layout.nodes.map((node) => [node.id, node]))
  }, [layout])

  const entityMap = useMemo(
    () =>
      currentImpactSummary ? collectEntities(currentImpactSummary) : new Map<string, CodeEntity>(),
    [currentImpactSummary],
  )

  const selectedId = currentImpactSummary ? entityId(currentImpactSummary.selected) : ''

  if (!currentImpactSummary || !layout) {
    return (
      <section className="flex h-full min-h-0 flex-col border-base-border border-b bg-base-bg">
        <div className="flex h-9 shrink-0 items-center border-base-border border-b px-3">
          <h2 className="font-medium text-base-text text-xs">Impact graph</h2>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <p className="text-base-text-muted text-xs">Select a file or symbol to see impact.</p>
        </div>
      </section>
    )
  }

  return (
    <section className="flex h-full min-h-0 flex-col border-base-border border-b bg-base-bg">
      <div className="flex h-9 shrink-0 items-center justify-between border-base-border border-b px-3">
        <h2 className="font-medium text-base-text text-xs">Impact graph</h2>
        <div className="flex items-center gap-3 text-base-text-muted text-[11px]">
          <span>{currentImpactSummary.dependencies.length} deps</span>
          <span>{currentImpactSummary.importers.length} importers</span>
          <span>{currentImpactSummary.likelyTests.length} tests</span>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <GraphCanvas layoutNodes={layout.nodes} viewportMode="local">
          {layout.edges.map((edge) => {
            const source = nodeMap.get(edge.source)
            const target = nodeMap.get(edge.target)
            if (!source || !target) return null

            const x1 = source.x + source.width / 2
            const y1 = source.y + source.height / 2
            const x2 = target.x + target.width / 2
            const y2 = target.y + target.height / 2
            const dx = x2 - x1
            const dy = y2 - y1
            const curve = Math.min(60, Math.hypot(dx, dy) / 4)
            const path = `M ${x1} ${y1} C ${x1 + curve} ${y1}, ${x2 - curve} ${y2}, ${x2} ${y2}`
            const color = edgeColor(edge.label)

            return (
              <g key={`${edge.source}->${edge.target}:${edge.label ?? ''}`}>
                <path d={path} fill="none" stroke={color} strokeWidth={1.4} opacity={0.65} />
                {edge.label && (
                  <text
                    x={(x1 + x2) / 2}
                    y={(y1 + y2) / 2 - 5}
                    fill={color}
                    fontSize={9}
                    textAnchor="middle"
                    opacity={0.8}
                  >
                    {edge.label}
                  </text>
                )}
              </g>
            )
          })}

          {layout.nodes.map((node) => {
            const entity = entityMap.get(node.id)
            const isSelected = node.id === selectedId
            const isSymbol = entity?.kind === 'symbol'
            const fill = isSelected ? '#0d2d4d' : '#21262d'
            const stroke = isSelected ? '#58a6ff' : isSymbol ? '#d2a8ff' : '#7ee787'
            const label = isSelected ? 'selected' : isSymbol ? 'symbol' : 'file'

            return (
              <g
                key={node.id}
                onClick={() => entity && setSelectedEntity(entity)}
                style={{ cursor: entity ? 'pointer' : 'default' }}
              >
                <rect
                  x={node.x}
                  y={node.y}
                  width={node.width}
                  height={node.height}
                  rx={5}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={isSelected ? 2 : 1}
                />
                <text
                  x={node.x + 8}
                  y={node.y + 13}
                  fill={stroke}
                  fontSize={8}
                  fontWeight={700}
                >
                  {label}
                </text>
                <text
                  x={node.x + 8}
                  y={node.y + 27}
                  fill="#e6edf3"
                  fontSize={11}
                  fontFamily="var(--font-mono, monospace)"
                >
                  {truncate(node.name, isSelected ? 22 : 20)}
                </text>
                {entity && (
                  <title>
                    {node.name}
                    {'\n'}
                    {entityDetail(entity)}
                  </title>
                )}
              </g>
            )
          })}
        </GraphCanvas>
      </div>
    </section>
  )
}
