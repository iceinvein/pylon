import { useCallback, useEffect, useRef, useState } from 'react'
import type { AstNode } from '../../../../shared/types'

type CodePanelProps = {
  selectedFile: string | null
  fileAst: AstNode[] | null
  selectedNodeId: string | null
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
  const [lines, setLines] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Resolve the selected node's line range
  const selectedNode = fileAst && selectedNodeId ? findNodeById(fileAst, selectedNodeId) : null
  const startLine = selectedNode?.startLine ?? -1
  const endLine = selectedNode?.endLine ?? -1

  // Load file content when selectedFile changes
  useEffect(() => {
    if (!selectedFile) {
      setLines([])
      return
    }

    let cancelled = false
    setLoading(true)

    window.api
      .readFileBase64(selectedFile)
      .then((b64) => {
        if (cancelled) return
        const text = atob(b64)
        setLines(text.split('\n'))
      })
      .catch(() => {
        if (!cancelled) setLines([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [selectedFile])

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
    <div ref={containerRef} className="h-full overflow-auto font-mono text-xs">
      <table className="w-full border-collapse">
        <tbody>
          {lines.map((line, i) => {
            const lineNum = i + 1
            const isHighlighted = lineNum >= startLine && lineNum <= endLine

            return (
              <tr key={lineNum} data-line={lineNum} className={isHighlighted ? 'bg-accent/15' : ''}>
                <td className="select-none pr-3 text-right align-top text-base-text-muted/50">
                  {lineNum}
                </td>
                <td className="whitespace-pre text-base-text">{line}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
