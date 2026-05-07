import { createHash } from 'node:crypto'
import type {
  AstNode,
  CodeEntity,
  ImpactConfidence,
  ImpactEdge,
  ImpactIndex,
  ImpactPath,
  ImpactSummary,
  ImportEdge,
  RepoGraph,
} from '../shared/types'

function fileEntity(filePath: string): CodeEntity {
  return { kind: 'file', filePath }
}

function symbolEntity(node: AstNode): CodeEntity {
  return {
    kind: 'symbol',
    filePath: node.filePath,
    symbolId: node.id,
    symbolName: node.name,
    symbolType: node.type,
    startLine: node.startLine,
    endLine: node.endLine,
  }
}

function entityKey(entity: CodeEntity): string {
  if (entity.kind === 'file') {
    return `file:${entity.filePath}`
  }
  return `symbol:${entity.filePath}:${entity.symbolId}:${entity.symbolName}:${entity.startLine}:${entity.endLine}`
}

function collectSymbols(nodes: AstNode[], symbols: CodeEntity[] = []): CodeEntity[] {
  for (const node of nodes) {
    symbols.push(symbolEntity(node))
    collectSymbols(node.children, symbols)
  }
  return symbols
}

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b))
}

function ensureFileMaps(files: string[]): {
  dependenciesByFile: Record<string, string[]>
  importersByFile: Record<string, string[]>
  importEdgesByTargetFile: Record<string, ImportEdge[]>
} {
  const dependenciesByFile: Record<string, string[]> = {}
  const importersByFile: Record<string, string[]> = {}
  const importEdgesByTargetFile: Record<string, ImportEdge[]> = {}

  for (const filePath of files) {
    dependenciesByFile[filePath] = []
    importersByFile[filePath] = []
    importEdgesByTargetFile[filePath] = []
  }

  return { dependenciesByFile, importersByFile, importEdgesByTargetFile }
}

function isTestLikePath(filePath: string): boolean {
  const normalized = filePath.toLowerCase().replaceAll('\\', '/')
  const basename = normalized.split('/').at(-1) ?? normalized

  return (
    normalized.includes('/__tests__/') ||
    normalized.includes('/test/') ||
    normalized.includes('/tests/') ||
    basename.includes('.test.') ||
    basename.includes('.spec.') ||
    basename.endsWith('_test.go') ||
    basename.endsWith('_test.py') ||
    basename.startsWith('test_')
  )
}

function edgeEvidence(source: string, target: string): string {
  return `${source} imports ${target}`
}

function impactEdge(
  kind: ImpactEdge['kind'],
  source: CodeEntity,
  target: CodeEntity,
  evidence: string,
  confidence: ImpactConfidence = 'high',
): ImpactEdge {
  return { kind, source, target, confidence, evidence }
}

function pathFor(id: string, label: string, entities: CodeEntity[]): ImpactPath {
  return { id, label, entities, confidence: 'high' }
}

export function computeSnapshotHash(graph: RepoGraph): string {
  const rows = graph.files
    .map((file) => `${file.filePath}\0${file.lastModified}`)
    .sort((a, b) => a.localeCompare(b))

  return createHash('sha256').update(rows.join('\n')).digest('hex')
}

export function buildImpactIndex(graph: RepoGraph, generatedAt = Date.now()): ImpactIndex {
  const files = graph.files.map((file) => file.filePath).sort((a, b) => a.localeCompare(b))
  const { dependenciesByFile, importersByFile, importEdgesByTargetFile } = ensureFileMaps(files)

  for (const edge of graph.edges) {
    dependenciesByFile[edge.source] ??= []
    importersByFile[edge.target] ??= []
    importEdgesByTargetFile[edge.target] ??= []
    dependenciesByFile[edge.source].push(edge.target)
    importersByFile[edge.target].push(edge.source)
    importEdgesByTargetFile[edge.target].push(edge)
  }

  for (const filePath of Object.keys(dependenciesByFile)) {
    dependenciesByFile[filePath] = sortedUnique(dependenciesByFile[filePath])
  }
  for (const filePath of Object.keys(importersByFile)) {
    importersByFile[filePath] = sortedUnique(importersByFile[filePath])
  }
  for (const filePath of Object.keys(importEdgesByTargetFile)) {
    importEdgesByTargetFile[filePath] = importEdgesByTargetFile[filePath]
      .slice()
      .sort((a, b) => {
        const sourceCompare = a.source.localeCompare(b.source)
        if (sourceCompare !== 0) {
          return sourceCompare
        }
        return a.target.localeCompare(b.target)
      })
  }

  const likelyTestsByFile: Record<string, string[]> = {}
  for (const filePath of files) {
    likelyTestsByFile[filePath] = (importersByFile[filePath] ?? []).filter(isTestLikePath)
  }

  const entities = graph.files
    .slice()
    .sort((a, b) => a.filePath.localeCompare(b.filePath))
    .flatMap((file) => [
      fileEntity(file.filePath),
      ...collectSymbols(file.declarations).sort((a, b) => entityKey(a).localeCompare(entityKey(b))),
    ])

  const index: ImpactIndex = {
    generatedAt,
    snapshotHash: computeSnapshotHash(graph),
    entities,
    dependenciesByFile,
    importersByFile,
    likelyTestsByFile,
    importEdgesByTargetFile,
  }

  return index
}

export function getImpactSummary(
  index: ImpactIndex,
  selected: CodeEntity,
  currentSnapshotHash = index.snapshotHash,
): ImpactSummary {
  const importerSources = importerSourcePaths(index, selected)
  const symbolImportersUnavailable =
    selected.kind === 'symbol' && !(index as Partial<ImpactIndex>).importEdgesByTargetFile
  const dependencies = (index.dependenciesByFile[selected.filePath] ?? []).map((targetPath) =>
    impactEdge('import', selected, fileEntity(targetPath), edgeEvidence(selected.filePath, targetPath)),
  )
  const importers = importerSources.map((sourcePath) =>
    impactEdge(
      'reverse-import',
      fileEntity(sourcePath),
      selected,
      edgeEvidence(sourcePath, selected.filePath),
    ),
  )
  const likelyTests = importerSources.filter(isTestLikePath).map(fileEntity)
  const paths = [
    ...dependencies.map((edge) =>
      pathFor(
        `dependency:${entityKey(selected)}:${edge.target.filePath}`,
        `${selected.filePath} imports ${edge.target.filePath}`,
        [selected, edge.target],
      ),
    ),
    ...importers.map((edge) =>
      pathFor(
        `importer:${edge.source.filePath}:${entityKey(selected)}`,
        `${edge.source.filePath} imports ${selected.filePath}`,
        [edge.source, selected],
      ),
    ),
  ]

  return {
    selected,
    dependencies,
    importers,
    references: [],
    likelyTests,
    paths,
    notes: impactNotes(selected, symbolImportersUnavailable),
    generatedAt: index.generatedAt,
    stale: currentSnapshotHash !== index.snapshotHash,
  }
}

export function searchImpactEntities(
  index: ImpactIndex,
  query: string,
  limit = 30,
): CodeEntity[] {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) {
    return []
  }
  if (limit <= 0) {
    return []
  }

  return index.entities
    .map((entity) => ({ entity, score: searchScore(entity, normalizedQuery) }))
    .filter((result) => result.score > 0)
    .sort((a, b) => {
      if (a.score !== b.score) {
        return b.score - a.score
      }
      return entityKey(a.entity).localeCompare(entityKey(b.entity))
    })
    .slice(0, limit)
    .map((result) => result.entity)
}

function searchScore(entity: CodeEntity, query: string): number {
  const path = entity.filePath.toLowerCase()
  const basename = path.split('/').at(-1) ?? path

  if (entity.kind === 'symbol') {
    const name = entity.symbolName.toLowerCase()
    if (name === query) {
      return 100
    }
    if (name.startsWith(query)) {
      return 90
    }
    if (camelCaseTokens(entity.symbolName).at(-1)?.startsWith(query)) {
      return 80
    }
  }

  if (basename === query) {
    return 70
  }
  if (basename.startsWith(query)) {
    return 60
  }
  if (basename.includes(query)) {
    return 50
  }
  if (path.includes(query)) {
    return 40
  }

  return 0
}

function importerSourcePaths(index: ImpactIndex, selected: CodeEntity): string[] {
  if (selected.kind === 'file') {
    return index.importersByFile[selected.filePath] ?? []
  }

  const importEdges = (index as Partial<ImpactIndex>).importEdgesByTargetFile?.[selected.filePath]
  if (!importEdges) {
    return []
  }

  return sortedUnique(
    importEdges
      .filter((edge) => {
        return edge.specifiers.includes(selected.symbolName)
      })
      .map((edge) => edge.source),
  )
}

function camelCaseTokens(value: string): string[] {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[\s._-]+/)
    .map((token) => token.toLowerCase())
    .filter(Boolean)
}

function impactNotes(selected: CodeEntity, symbolImportersUnavailable: boolean): string[] {
  if (selected.kind !== 'symbol') {
    return []
  }

  const notes = ['Symbol impact uses deterministic file-level imports.']
  if (symbolImportersUnavailable) {
    notes.push('Symbol importers unavailable without import-edge metadata.')
  }
  return notes
}
