import { ChevronDown, ChevronRight, Package } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  type BundledLanguage,
  createHighlighter,
  createJavaScriptRegexEngine,
  type Highlighter,
} from 'shiki'
import type { AstNode } from '../../../../shared/types'
import { useAstStore } from '../../store/ast-store'

type CodePanelProps = {
  selectedFile: string | null
  fileAst: AstNode[] | null
  selectedNodeId: string | null
}

// ── Shiki singleton (shared with use-shiki.ts via module-level cache) ──

let hlPromise: Promise<Highlighter> | null = null
let hlInstance: Highlighter | null = null

function getHighlighter(): Promise<Highlighter> {
  if (!hlPromise) {
    hlPromise = createHighlighter({
      themes: ['vitesse-dark'],
      langs: [
        'typescript',
        'javascript',
        'tsx',
        'jsx',
        'json',
        'html',
        'css',
        'python',
        'bash',
        'shell',
        'markdown',
        'yaml',
        'toml',
        'sql',
        'rust',
        'go',
        'c',
        'cpp',
        'java',
        'ruby',
        'swift',
        'kotlin',
      ],
      engine: createJavaScriptRegexEngine(),
    })
    hlPromise.then((h) => {
      hlInstance = h
    })
  }
  return hlPromise
}

// Start loading eagerly
getHighlighter()

/** Map file extension to Shiki language ID */
function extToLang(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'tsx',
    js: 'javascript',
    jsx: 'jsx',
    json: 'json',
    html: 'html',
    css: 'css',
    py: 'python',
    sh: 'bash',
    md: 'markdown',
    yml: 'yaml',
    yaml: 'yaml',
    toml: 'toml',
    sql: 'sql',
    rs: 'rust',
    go: 'go',
    c: 'c',
    cpp: 'cpp',
    h: 'c',
    hpp: 'cpp',
    java: 'java',
    rb: 'ruby',
    swift: 'swift',
    kt: 'kotlin',
  }
  return map[ext] ?? 'text'
}

type TokenSpan = {
  content: string
  color: string
}

function findNodeById(nodes: AstNode[], id: string): AstNode | null {
  for (const node of nodes) {
    if (node.id === id) return node
    const found = findNodeById(node.children, id)
    if (found) return found
  }
  return null
}

export function CodePanel({ selectedFile, fileAst, selectedNodeId }: CodePanelProps) {
  const [rawCode, setRawCode] = useState('')
  const [tokenizedLines, setTokenizedLines] = useState<TokenSpan[][]>([])
  const [loading, setLoading] = useState(false)
  const [depsExpanded, setDepsExpanded] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const repoGraph = useAstStore((s) => s.repoGraph)

  const selectedNode = fileAst && selectedNodeId ? findNodeById(fileAst, selectedNodeId) : null
  const startLine = selectedNode?.startLine ?? -1
  const endLine = selectedNode?.endLine ?? -1

  const lang = useMemo(() => (selectedFile ? extToLang(selectedFile) : 'text'), [selectedFile])

  // Compute external dependencies: imports whose target wasn't resolved to a file in the graph
  const externalDeps = useMemo(() => {
    if (!selectedFile || !repoGraph) return []
    const fileNode = repoGraph.files.find((f) => f.filePath === selectedFile)
    if (!fileNode) return []
    const resolvedTargets = new Set(
      repoGraph.edges.filter((e) => e.source === selectedFile).map((e) => e.target),
    )
    return fileNode.imports
      .filter((imp) => !resolvedTargets.has(imp.target))
      .map((imp) => ({ name: imp.target, specifiers: imp.specifiers }))
  }, [selectedFile, repoGraph])

  // Load file content when selectedFile changes
  useEffect(() => {
    if (!selectedFile) {
      setRawCode('')
      setTokenizedLines([])
      return
    }

    let cancelled = false
    setLoading(true)

    window.api
      .readFileBase64(selectedFile)
      .then((b64) => {
        if (cancelled) return
        const text = atob(b64)
        setRawCode(text)
      })
      .catch(() => {
        if (!cancelled) {
          setRawCode('')
          setTokenizedLines([])
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [selectedFile])

  // Tokenize with Shiki when code or language changes
  useEffect(() => {
    if (!rawCode) {
      setTokenizedLines([])
      return
    }

    let cancelled = false

    const doTokenize = (h: Highlighter) => {
      if (cancelled) return
      const resolvedLang = (
        h.getLoadedLanguages().includes(lang) ? lang : 'text'
      ) as BundledLanguage
      const { tokens } = h.codeToTokens(rawCode, {
        lang: resolvedLang,
        theme: 'vitesse-dark',
      })

      // Convert to simple spans — no innerHTML needed
      const lines = tokens.map((lineTokens) =>
        lineTokens.map((token) => ({
          content: token.content,
          color: token.color ?? '#dbd7caee',
        })),
      )

      setTokenizedLines(lines)
    }

    if (hlInstance) {
      doTokenize(hlInstance)
    } else {
      getHighlighter().then((h) => doTokenize(h))
    }

    return () => {
      cancelled = true
    }
  }, [rawCode, lang])

  // Scroll to highlighted range when it changes
  const scrollToRange = useCallback(() => {
    if (!containerRef.current || startLine < 1) return
    const el = containerRef.current.querySelector(`[data-line="${startLine}"]`)
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }, [startLine])

  useEffect(() => {
    scrollToRange()
  }, [scrollToRange])

  if (!selectedFile) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-base-text-muted text-sm">Click a file node to view source</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-base-text-muted text-sm">Loading...</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* File header */}
      <div className="flex h-8 shrink-0 items-center border-base-border-subtle border-b px-3">
        <span className="truncate font-mono text-base-text-muted text-xs">
          {selectedFile.split('/').pop()}
        </span>
        <span className="ml-1 text-[10px] text-base-text-muted/50">{lang}</span>
        {startLine > 0 && (
          <span className="ml-auto text-[10px] text-base-text-muted">
            L{startLine}–{endLine}
          </span>
        )}
      </div>

      {/* External Dependencies */}
      {externalDeps.length > 0 && (
        <div className="border-base-border-subtle border-b">
          <button
            type="button"
            onClick={() => setDepsExpanded((prev) => !prev)}
            className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left"
          >
            {depsExpanded ? (
              <ChevronDown size={12} className="text-base-text-muted" />
            ) : (
              <ChevronRight size={12} className="text-base-text-muted" />
            )}
            <span className="text-base-text-muted text-xs">
              External Dependencies ({externalDeps.length})
            </span>
          </button>
          {depsExpanded && (
            <div className="flex flex-wrap gap-x-3 gap-y-1 px-3 pb-2">
              {externalDeps.map((dep) => (
                <div key={dep.name} className="flex items-center gap-1">
                  <Package size={10} className="shrink-0 text-base-text-muted/50" />
                  <span className="text-base-text-muted text-xs">{dep.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Code body */}
      <div ref={containerRef} className="flex-1 overflow-auto bg-[#121212]">
        <table className="w-full border-collapse font-mono text-sm leading-[1.65]">
          <tbody>
            {tokenizedLines.map((lineTokens, i) => {
              const lineNum = i + 1
              const isHighlighted = lineNum >= startLine && lineNum <= endLine

              return (
                <tr
                  key={lineNum}
                  data-line={lineNum}
                  className={isHighlighted ? 'bg-base-raised/60' : ''}
                >
                  <td
                    className={`w-12 select-none border-r pr-3 text-right align-top ${
                      isHighlighted
                        ? 'border-base-border-subtle text-base-text-muted'
                        : 'border-transparent text-base-text-muted/30'
                    }`}
                  >
                    {lineNum}
                  </td>
                  <td className="whitespace-pre pl-4">
                    {lineTokens.length > 0 ? (
                      lineTokens.map((token, j) => (
                        <span key={j} style={{ color: token.color }}>
                          {token.content}
                        </span>
                      ))
                    ) : (
                      <span>&nbsp;</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
