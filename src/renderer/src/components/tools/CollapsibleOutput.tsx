import { Check, ChevronDown, ChevronRight, Copy } from 'lucide-react'
import { useCallback, useState } from 'react'
import { ansiToHtml, hasAnsiCodes } from '../../lib/ansi'

type CollapsibleOutputProps = {
  text: string
  maxPreviewLines?: number
  maxExpandedHeight?: string
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: intentional ANSI escape matching
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

  const displayText =
    !expanded && needsTruncation ? lines.slice(0, maxPreviewLines).join('\n') : text

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text.replace(ANSI_STRIP, ''))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [text])

  return (
    <div className="mt-1.5">
      <div className="relative">
        <button
          type="button"
          onClick={handleCopy}
          className="absolute top-1.5 right-2 z-10 flex items-center gap-1 rounded px-1.5 py-0.5 text-base-text-muted text-xs transition-colors hover:bg-base-border hover:text-base-text"
        >
          {copied ? <Check size={11} /> : <Copy size={11} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
        <div
          className="overflow-x-auto rounded bg-base-raised/60 px-3 py-2 font-mono text-base-text text-xs leading-relaxed"
          style={
            expanded && needsTruncation
              ? { maxHeight: maxExpandedHeight, overflowY: 'auto' }
              : undefined
          }
        >
          {isAnsi ? (
            <pre
              className="whitespace-pre-wrap"
              // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized HTML from ansi-to-html (escapeXML: true)
              dangerouslySetInnerHTML={{ __html: ansiToHtml(displayText) }}
            />
          ) : (
            <pre className="whitespace-pre-wrap">{displayText}</pre>
          )}
        </div>
      </div>
      {needsTruncation && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 flex items-center gap-1 text-base-text-muted text-xs transition-colors hover:text-base-text"
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {expanded ? 'Collapse' : `Show all (${totalLines} lines)`}
        </button>
      )}
    </div>
  )
}
