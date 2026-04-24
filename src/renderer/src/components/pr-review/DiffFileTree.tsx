import { ChevronDown, ChevronRight, Eye, FileText, FolderOpen } from 'lucide-react'
import { useState } from 'react'
import type { ReviewFinding } from '../../../../shared/types'
import { filePathMatches } from '../../lib/diff-utils'
import { usePrReviewStore } from '../../store/pr-review-store'

type FileEntry = {
  path: string
  additions: number
  deletions: number
}

type Props = {
  files: FileEntry[]
  findings: ReviewFinding[]
  selectedFile: string | null
  onSelectFile: (path: string | null) => void
}

type DirNode = {
  name: string
  fullPath: string
  files: FileEntry[]
  dirs: Map<string, DirNode>
}

function buildTree(files: FileEntry[]): DirNode {
  const root: DirNode = { name: '', fullPath: '', files: [], dirs: new Map() }
  for (const file of files) {
    const parts = file.path.split('/')
    let node = root
    for (let i = 0; i < parts.length - 1; i++) {
      const dirName = parts[i]
      if (!node.dirs.has(dirName)) {
        const parentPath = node.fullPath ? `${node.fullPath}/${dirName}` : dirName
        node.dirs.set(dirName, { name: dirName, fullPath: parentPath, files: [], dirs: new Map() })
      }
      node = node.dirs.get(dirName) as DirNode
    }
    node.files.push(file)
  }
  return root
}

function collapseTree(node: DirNode): DirNode {
  const collapsedDirs = new Map<string, DirNode>()
  for (const [, dir] of node.dirs) {
    let current = dir
    let label = current.name
    while (current.files.length === 0 && current.dirs.size === 1) {
      const child = [...current.dirs.values()][0]
      label = `${label}/${child.name}`
      current = child
    }
    const collapsed = collapseTree(current)
    collapsed.name = label
    collapsedDirs.set(label, collapsed)
  }
  return { ...node, dirs: collapsedDirs }
}

const SEVERITY_ORDER = ['blocker', 'high', 'medium', 'low'] as const

function findingCountsBySeverity(
  findings: ReviewFinding[],
  filePath: string,
): { severity: string; count: number }[] {
  const fileFindings = findings.filter((f) => f.file && filePathMatches(f.file, filePath))
  if (fileFindings.length === 0) return []
  const counts = new Map<string, number>()
  for (const f of fileFindings) {
    counts.set(f.severity, (counts.get(f.severity) || 0) + 1)
  }
  return SEVERITY_ORDER.filter((s) => counts.has(s)).map((s) => ({
    severity: s,
    count: counts.get(s) ?? 0,
  }))
}

/** Collect all file paths in a directory subtree */
function collectPaths(node: DirNode): string[] {
  const paths: string[] = node.files.map((f) => f.path)
  for (const dir of node.dirs.values()) {
    paths.push(...collectPaths(dir))
  }
  return paths
}

/** Count total findings that match any file in a directory subtree */
function countDirFindings(findings: ReviewFinding[], node: DirNode): number {
  const paths = collectPaths(node)
  return findings.filter((f) => f.file && paths.some((p) => filePathMatches(f.file, p))).length
}

const SEVERITY_COLORS: Record<string, string> = {
  blocker: 'bg-[var(--color-error)] text-base-text',
  high: 'bg-[var(--color-risk-high)] text-base-text',
  medium: 'bg-[var(--color-risk-medium)] text-base-text',
  low: 'bg-[var(--color-base-text-faint)] text-base-text',
}

export function DiffFileTree({ files, findings, selectedFile, onSelectFile }: Props) {
  const { findingsViewMode, setFindingsViewMode } = usePrReviewStore()
  const tree = collapseTree(buildTree(files))
  const generalFindings = findings.filter((f) => !f.file)

  return (
    <div className="flex h-full flex-col overflow-y-auto border-base-border-subtle border-r bg-base-bg/50">
      {/* Segmented control */}
      <div className="flex border-base-border-subtle/50 border-b p-1.5">
        <button
          type="button"
          onClick={() => setFindingsViewMode('files')}
          className={`flex-1 rounded-md px-2 py-1 text-center font-medium text-[10px] transition-colors ${
            findingsViewMode === 'files'
              ? 'bg-base-raised text-base-text'
              : 'text-base-text-muted hover:text-base-text'
          }`}
        >
          Files
        </button>
        <button
          type="button"
          onClick={() => setFindingsViewMode('all-issues')}
          className={`flex-1 rounded-md px-2 py-1 text-center font-medium text-[10px] transition-colors ${
            findingsViewMode === 'all-issues'
              ? 'bg-base-raised text-base-text'
              : 'text-base-text-muted hover:text-base-text'
          }`}
        >
          All Issues
          {findings.length > 0 && <span className="ml-1 tabular-nums">({findings.length})</span>}
        </button>
      </div>

      {findingsViewMode === 'files' && (
        <>
          {/* Overview entry */}
          <button
            type="button"
            onClick={() => onSelectFile(null)}
            className={`flex items-center gap-2 border-base-border-subtle/50 border-b px-3 py-2 text-left text-xs transition-colors ${
              selectedFile === null
                ? 'bg-base-raised/60 text-base-text'
                : 'text-base-text-secondary hover:bg-base-raised/30'
            }`}
          >
            <Eye size={12} className="shrink-0 text-base-text-muted" />
            <span className="flex-1">Overview</span>
            {generalFindings.length > 0 && (
              <span className="rounded-full bg-base-text-faint px-1.5 py-0.5 font-medium text-[10px] text-base-text tabular-nums">
                {generalFindings.length}
              </span>
            )}
          </button>

          {/* File tree */}
          <div className="flex-1 overflow-y-auto py-1">
            <DirContent
              node={tree}
              findings={findings}
              selectedFile={selectedFile}
              onSelectFile={onSelectFile}
              depth={0}
            />
          </div>
        </>
      )}
    </div>
  )
}

function DirContent({
  node,
  findings,
  selectedFile,
  onSelectFile,
  depth,
}: {
  node: DirNode
  findings: ReviewFinding[]
  selectedFile: string | null
  onSelectFile: (path: string | null) => void
  depth: number
}) {
  return (
    <>
      {[...node.dirs.values()]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((dir) => (
          <DirEntry
            key={dir.fullPath}
            dir={dir}
            findings={findings}
            selectedFile={selectedFile}
            onSelectFile={onSelectFile}
            depth={depth}
          />
        ))}
      {node.files
        .sort((a, b) => a.path.localeCompare(b.path))
        .map((file) => {
          const fileName = file.path.split('/').pop() || file.path
          const severityCounts = findingCountsBySeverity(findings, file.path)
          return (
            <button
              type="button"
              key={file.path}
              onClick={() => onSelectFile(file.path)}
              className={`flex w-full items-center gap-1.5 py-1 pr-2 text-left text-xs transition-colors ${
                selectedFile === file.path
                  ? 'bg-base-raised/60 text-base-text'
                  : 'text-base-text-secondary hover:bg-base-raised/30 hover:text-base-text'
              }`}
              style={{ paddingLeft: `${(depth + 1) * 12 + 8}px` }}
            >
              <FileText size={11} className="shrink-0 text-base-text-faint" />
              <span className="min-w-0 flex-1 truncate font-mono">{fileName}</span>
              {severityCounts.length > 0 && (
                <span className="flex items-center gap-0.5">
                  {severityCounts.map(({ severity, count }) => (
                    <span
                      key={severity}
                      className={`rounded-full px-1.5 py-0.5 font-medium text-[10px] tabular-nums ${SEVERITY_COLORS[severity] || SEVERITY_COLORS.low}`}
                    >
                      {count}
                    </span>
                  ))}
                </span>
              )}
              <span className="shrink-0 font-mono text-[10px] tabular-nums">
                <span className="text-emerald-600">+{file.additions}</span>{' '}
                <span className="text-error">-{file.deletions}</span>
              </span>
            </button>
          )
        })}
    </>
  )
}

function DirEntry({
  dir,
  findings,
  selectedFile,
  onSelectFile,
  depth,
}: {
  dir: DirNode
  findings: ReviewFinding[]
  selectedFile: string | null
  onSelectFile: (path: string | null) => void
  depth: number
}) {
  const [expanded, setExpanded] = useState(true)
  const Chevron = expanded ? ChevronDown : ChevronRight
  const dirCount = countDirFindings(findings, dir)

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-1.5 py-1 pr-2 text-left text-base-text-muted text-xs transition-colors hover:text-base-text"
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        <Chevron size={10} className="shrink-0" />
        <FolderOpen size={11} className="shrink-0 text-base-text-faint" />
        <span className="min-w-0 flex-1 truncate font-mono">{dir.name}</span>
        {dirCount > 0 && (
          <span className="shrink-0 rounded-full bg-base-text-faint/60 px-1.5 py-0.5 font-medium text-[10px] text-base-text tabular-nums">
            {dirCount}
          </span>
        )}
      </button>
      {expanded && (
        <DirContent
          node={dir}
          findings={findings}
          selectedFile={selectedFile}
          onSelectFile={onSelectFile}
          depth={depth + 1}
        />
      )}
    </div>
  )
}
