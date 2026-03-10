import { useState } from 'react'
import { FileText, FolderOpen, ChevronRight, ChevronDown, Eye } from 'lucide-react'
import type { ReviewFinding } from '../../../../shared/types'

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
      node = node.dirs.get(dirName)!
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

const SEVERITY_ORDER = ['critical', 'warning', 'suggestion', 'nitpick'] as const

function findingCountsBySeverity(findings: ReviewFinding[], filePath: string): { severity: string; count: number }[] {
  const fileFindings = findings.filter((f) =>
    f.file === filePath || filePath.endsWith(f.file) || f.file.endsWith(filePath)
  )
  if (fileFindings.length === 0) return []
  const counts = new Map<string, number>()
  for (const f of fileFindings) {
    counts.set(f.severity, (counts.get(f.severity) || 0) + 1)
  }
  return SEVERITY_ORDER.filter((s) => counts.has(s)).map((s) => ({ severity: s, count: counts.get(s)! }))
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-500 text-white',
  warning: 'bg-amber-500/80 text-white',
  suggestion: 'bg-blue-500/80 text-white',
  nitpick: 'bg-stone-600 text-white',
}

export function DiffFileTree({ files, findings, selectedFile, onSelectFile }: Props) {
  const tree = collapseTree(buildTree(files))
  const generalFindings = findings.filter((f) => !f.file)

  return (
    <div className="flex h-full flex-col overflow-y-auto border-r border-stone-800 bg-stone-950/50">
      {/* Overview entry */}
      <button
        onClick={() => onSelectFile(null)}
        className={`flex items-center gap-2 border-b border-stone-800/50 px-3 py-2 text-left text-[11px] transition-colors ${
          selectedFile === null ? 'bg-stone-800/60 text-stone-200' : 'text-stone-400 hover:bg-stone-800/30'
        }`}
      >
        <Eye size={12} className="flex-shrink-0 text-stone-500" />
        <span className="flex-1">Overview</span>
        {generalFindings.length > 0 && (
          <span className="rounded-full bg-stone-600 px-1.5 py-0.5 text-[9px] font-medium tabular-nums text-white">
            {generalFindings.length}
          </span>
        )}
      </button>

      {/* File tree */}
      <div className="flex-1 overflow-y-auto py-1">
        <DirContent node={tree} findings={findings} selectedFile={selectedFile} onSelectFile={onSelectFile} depth={0} />
      </div>
    </div>
  )
}

function DirContent({ node, findings, selectedFile, onSelectFile, depth }: {
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
          <DirEntry key={dir.fullPath} dir={dir} findings={findings} selectedFile={selectedFile} onSelectFile={onSelectFile} depth={depth} />
        ))}
      {node.files
        .sort((a, b) => a.path.localeCompare(b.path))
        .map((file) => {
          const fileName = file.path.split('/').pop() || file.path
          const severityCounts = findingCountsBySeverity(findings, file.path)
          return (
            <button
              key={file.path}
              onClick={() => onSelectFile(file.path)}
              className={`flex w-full items-center gap-1.5 py-1 pr-2 text-left text-[11px] transition-colors ${
                selectedFile === file.path
                  ? 'bg-stone-800/60 text-stone-200'
                  : 'text-stone-400 hover:bg-stone-800/30 hover:text-stone-300'
              }`}
              style={{ paddingLeft: `${(depth + 1) * 12 + 8}px` }}
            >
              <FileText size={11} className="flex-shrink-0 text-stone-600" />
              <span className="min-w-0 flex-1 truncate font-[family-name:var(--font-mono)]">{fileName}</span>
              {severityCounts.length > 0 && (
                <span className="flex items-center gap-0.5">
                  {severityCounts.map(({ severity, count }) => (
                    <span key={severity} className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium tabular-nums ${SEVERITY_COLORS[severity] || SEVERITY_COLORS.nitpick}`}>
                      {count}
                    </span>
                  ))}
                </span>
              )}
              <span className="flex-shrink-0 font-[family-name:var(--font-mono)] tabular-nums text-[10px]">
                <span className="text-emerald-600">+{file.additions}</span>{' '}
                <span className="text-red-600">-{file.deletions}</span>
              </span>
            </button>
          )
        })}
    </>
  )
}

function DirEntry({ dir, findings, selectedFile, onSelectFile, depth }: {
  dir: DirNode
  findings: ReviewFinding[]
  selectedFile: string | null
  onSelectFile: (path: string | null) => void
  depth: number
}) {
  const [expanded, setExpanded] = useState(true)
  const Chevron = expanded ? ChevronDown : ChevronRight

  return (
    <div>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-1.5 py-1 pr-2 text-left text-[11px] text-stone-500 transition-colors hover:text-stone-300"
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        <Chevron size={10} className="flex-shrink-0" />
        <FolderOpen size={11} className="flex-shrink-0 text-stone-600" />
        <span className="truncate font-[family-name:var(--font-mono)]">{dir.name}</span>
      </button>
      {expanded && (
        <DirContent node={dir} findings={findings} selectedFile={selectedFile} onSelectFile={onSelectFile} depth={depth + 1} />
      )}
    </div>
  )
}
