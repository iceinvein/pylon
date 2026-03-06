import { useState, useCallback } from 'react'
import { ChevronDown, ChevronRight, Copy, Check } from 'lucide-react'
import { hasAnsiCodes, ansiToHtml } from '../../lib/ansi'

type CollapsibleOutputProps = {
  text: string
  maxPreviewLines?: number
  maxExpandedHeight?: string
}

// eslint-disable-next-line no-control-regex
const ANSI_STRIP = /\x1b\[[0-9;]*m/g

export function CollapsibleOutput({
  text,
  maxPreviewLines = 20,
  maxExpandedHeight = '400px',
}: CollapsibleOutputProps) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)

  const lines = text.split('\n')
  const totalLines = lines.length
  const needsTruncation = totalLines > maxPreviewLines
  const isAnsi = hasAnsiCodes(text)

  const displayText = !expanded && needsTruncation
    ? lines.slice(0, maxPreviewLines).join('\n')
    : text

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text.replace(ANSI_STRIP, ''))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [text])

  return (
    <div className="mt-1.5">
      <div className="relative">
        <button
          onClick={handleCopy}
          className="absolute top-1.5 right-2 z-10 flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-stone-500 transition-colors hover:bg-stone-700 hover:text-stone-300"
        >
          {copied ? <Check size={11} /> : <Copy size={11} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
        <div
          className="overflow-x-auto rounded bg-stone-800/60 px-3 py-2 font-[family-name:var(--font-mono)] text-xs leading-relaxed text-stone-300"
          style={expanded && needsTruncation ? { maxHeight: maxExpandedHeight, overflowY: 'auto' } : undefined}
        >
          {isAnsi ? (
            <pre
              className="whitespace-pre-wrap"
              // Safe: ansiToHtml uses escapeXML:true — all text is HTML-escaped before color wrapping
              dangerouslySetInnerHTML={{ __html: ansiToHtml(displayText) }}
            />
          ) : (
            <pre className="whitespace-pre-wrap">{displayText}</pre>
          )}
        </div>
      </div>
      {needsTruncation && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 flex items-center gap-1 text-[11px] text-stone-500 transition-colors hover:text-stone-300"
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {expanded ? 'Collapse' : `Show all (${totalLines} lines)`}
        </button>
      )}
    </div>
  )
}
