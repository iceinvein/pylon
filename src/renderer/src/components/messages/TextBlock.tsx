import { useState, useCallback, memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Lightbulb, Copy, Check } from 'lucide-react'
import { useShiki } from '../../hooks/use-shiki'
import { hasAnsiCodes, ansiToHtml } from '../../lib/ansi'

type TextBlockProps = {
  text: string
  isStreaming?: boolean
}

type Segment =
  | { kind: 'markdown'; text: string }
  | { kind: 'insight'; text: string }

const INSIGHT_OPEN = /`[★☆✦●]\s*Insight\s*[─━─\-]+`/
const INSIGHT_CLOSE = /`[─━─\-]+`/

function parseSegments(text: string): Segment[] {
  const lines = text.split('\n')
  const segments: Segment[] = []
  let buf: string[] = []
  let inInsight = false

  for (const line of lines) {
    if (!inInsight && INSIGHT_OPEN.test(line)) {
      if (buf.length > 0) {
        segments.push({ kind: 'markdown', text: buf.join('\n') })
        buf = []
      }
      inInsight = true
      continue
    }

    if (inInsight && INSIGHT_CLOSE.test(line) && !INSIGHT_OPEN.test(line)) {
      segments.push({ kind: 'insight', text: buf.join('\n').trim() })
      buf = []
      inInsight = false
      continue
    }

    buf.push(line)
  }

  if (buf.length > 0) {
    if (inInsight) {
      segments.push({ kind: 'insight', text: buf.join('\n').trim() })
    } else {
      segments.push({ kind: 'markdown', text: buf.join('\n') })
    }
  }

  return segments
}

const proseClasses = [
  'prose prose-invert prose-sm max-w-none',
  'prose-p:text-stone-200 prose-li:text-stone-200',
  'prose-headings:text-stone-100 prose-strong:text-stone-100',
  'prose-a:text-amber-400 prose-a:no-underline hover:prose-a:underline',
  'prose-pre:bg-transparent prose-pre:border-0 prose-pre:p-0 prose-pre:m-0',
  'prose-code:text-amber-300 prose-code:bg-stone-800 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:font-[family-name:var(--font-mono)]',
  'prose-code:before:content-none prose-code:after:content-none',
  'prose-table:border-collapse',
  'prose-th:border prose-th:border-stone-700 prose-th:bg-stone-800/50 prose-th:px-3 prose-th:py-1.5 prose-th:text-stone-200',
  'prose-td:border prose-td:border-stone-800 prose-td:px-3 prose-td:py-1.5 prose-td:text-stone-300',
  'prose-blockquote:border-stone-600 prose-blockquote:text-stone-400',
  'prose-hr:border-stone-800',
].join(' ')

function CodeBlock({ className, children }: { className?: string; children?: React.ReactNode }) {
  const [copied, setCopied] = useState(false)
  const language = className?.replace('language-', '') ?? ''
  const code = String(children).replace(/\n$/, '')
  const isAnsi = hasAnsiCodes(code)
  const highlightedHtml = useShiki(isAnsi ? '' : code, isAnsi ? '' : language)

  const handleCopy = useCallback(() => {
    // Strip ANSI codes for clean clipboard text
    // eslint-disable-next-line no-control-regex
    navigator.clipboard.writeText(code.replace(/\x1b\[[0-9;]*m/g, ''))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [code])

  const label = isAnsi ? 'output' : language || 'code'

  return (
    <div className="group relative my-3 overflow-hidden rounded-lg border border-stone-800 bg-stone-900">
      <div className="flex items-center justify-between border-b border-stone-800/60 bg-stone-900/80 px-3 py-1.5">
        <span className="font-[family-name:var(--font-mono)] text-[11px] text-stone-500">
          {label}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-stone-500 transition-colors hover:bg-stone-800 hover:text-stone-300"
        >
          {copied ? <Check size={11} /> : <Copy size={11} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      {isAnsi ? (
        <AnsiOutput code={code} />
      ) : highlightedHtml ? (
        <SyntaxOutput html={highlightedHtml} />
      ) : (
        <pre className="overflow-x-auto p-3">
          <code className="font-[family-name:var(--font-mono)] text-xs leading-relaxed text-stone-200">
            {code}
          </code>
        </pre>
      )}
    </div>
  )
}

/** Renders ANSI escape codes as colored HTML. Safe: ansi-to-html is initialized with escapeXML: true. */
function AnsiOutput({ code }: { code: string }) {
  const html = ansiToHtml(code)
  return (
    <pre
      className="overflow-x-auto p-3 font-[family-name:var(--font-mono)] text-xs leading-relaxed text-stone-300"
      // Safe: ansi-to-html escapes XML entities before wrapping in <span> color tags
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

/** Renders Shiki's pre-escaped HTML output. Safe: Shiki HTML-escapes all code tokens internally. */
function SyntaxOutput({ html }: { html: string }) {
  return (
    <div
      className="shiki-wrapper overflow-x-auto p-3 font-[family-name:var(--font-mono)] text-xs leading-relaxed [&_pre]:!bg-transparent [&_code]:!bg-transparent"
      // Safe: html is produced by Shiki's tokenizer which HTML-escapes all code content
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

const markdownComponents: React.ComponentProps<typeof ReactMarkdown>['components'] = {
  code({ className, children, ...props }) {
    const isInline = !className
    if (isInline) {
      return (
        <code className="rounded bg-stone-800 px-1.5 py-0.5 font-[family-name:var(--font-mono)] text-xs text-amber-300" {...props}>
          {children}
        </code>
      )
    }
    return <CodeBlock className={className}>{children}</CodeBlock>
  },
  pre({ children }) {
    return <>{children}</>
  },
}

function MarkdownContent({ text }: { text: string }) {
  return (
    <div className={proseClasses}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {text}
      </ReactMarkdown>
    </div>
  )
}

function InsightCard({ text }: { text: string }) {
  return (
    <div className="my-3 rounded-lg border border-amber-800/40 bg-amber-950/15 px-4 py-3">
      <div className="mb-2 flex items-center gap-2">
        <Lightbulb size={14} className="text-amber-400" />
        <span className="text-xs font-semibold tracking-wide text-amber-400 uppercase">Insight</span>
      </div>
      <div className={proseClasses + ' prose-p:text-stone-300 prose-li:text-stone-300 prose-strong:text-amber-200'}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {text}
        </ReactMarkdown>
      </div>
    </div>
  )
}

const SettledMarkdown = memo(function SettledMarkdown({ text }: { text: string }) {
  const segments = parseSegments(text)
  return (
    <>
      {segments.map((seg, i) =>
        seg.kind === 'insight' ? (
          <InsightCard key={i} text={seg.text} />
        ) : (
          <MarkdownContent key={i} text={seg.text} />
        )
      )}
    </>
  )
})

export function TextBlock({ text, isStreaming }: TextBlockProps) {
  if (isStreaming) {
    const splitIdx = text.lastIndexOf('\n\n')
    const settled = splitIdx > 0 ? text.slice(0, splitIdx) : ''
    const tail = splitIdx > 0 ? text.slice(splitIdx) : text

    return (
      <>
        {settled && <SettledMarkdown text={settled} />}
        <div className="prose prose-invert prose-sm max-w-none prose-p:text-stone-200">
          <span className="whitespace-pre-wrap text-stone-200">{tail}</span>
        </div>
      </>
    )
  }

  const segments = parseSegments(text)

  return (
    <>
      {segments.map((seg, i) =>
        seg.kind === 'insight' ? (
          <InsightCard key={i} text={seg.text} />
        ) : (
          <MarkdownContent key={i} text={seg.text} />
        )
      )}
    </>
  )
}
