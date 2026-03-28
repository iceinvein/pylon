import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  type BundledLanguage,
  createHighlighter,
  createJavaScriptRegexEngine,
  type Highlighter,
} from 'shiki'
import type { AstNode } from '../../../../shared/types'

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
  const containerRef = useRef<HTMLDivElement>(null)

  const selectedNode = fileAst && selectedNodeId ? findNodeById(fileAst, selectedNodeId) : null
  const startLine = selectedNode?.startLine ?? -1
  const endLine = selectedNode?.endLine ?? -1

  const lang = useMemo(() => (selectedFile ? extToLang(selectedFile) : 'text'), [selectedFile])

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
          <span className="ml-auto text-[10px] text-accent-text/70">
            L{startLine}–{endLine}
          </span>
        )}
      </div>

      {/* Code body */}
      <div ref={containerRef} className="flex-1 overflow-auto bg-[#121212]">
        <table className="w-full border-collapse font-mono text-[13px] leading-[1.65]">
          <tbody>
            {tokenizedLines.map((lineTokens, i) => {
              const lineNum = i + 1
              const isHighlighted = lineNum >= startLine && lineNum <= endLine

              return (
                <tr
                  key={lineNum}
                  data-line={lineNum}
                  className={isHighlighted ? 'bg-accent/10' : ''}
                >
                  <td
                    className={`w-12 select-none border-r pr-3 text-right align-top ${
                      isHighlighted
                        ? 'border-accent/30 text-accent-text/60'
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
