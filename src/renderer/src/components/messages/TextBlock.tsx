import { Check, Copy, Lightbulb } from 'lucide-react'
import { memo, useCallback, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useShiki } from '../../hooks/use-shiki'
import { ansiToHtml, hasAnsiCodes } from '../../lib/ansi'
import { PrCreatedCard } from '../pr-raise/PrCreatedCard'

type TextBlockProps = {
  text: string
  isStreaming?: boolean
}

type Segment = { kind: 'markdown'; text: string } | { kind: 'insight'; text: string }

const INSIGHT_OPEN = /`[★☆✦●]\s*Insight\s*[─━─-]+`/
const INSIGHT_CLOSE = /`[─━─-]+`/

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
  'prose-p:text-[var(--color-base-text)] prose-li:text-[var(--color-base-text)]',
  'prose-headings:text-[var(--color-base-text)] prose-strong:text-[var(--color-base-text)]',
  'prose-a:text-[var(--color-warning)] prose-a:no-underline hover:prose-a:underline',
  'prose-pre:bg-transparent prose-pre:border-0 prose-pre:p-0 prose-pre:m-0',
  'prose-code:text-[var(--color-accent-text)] prose-code:bg-[var(--color-base-raised)] prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:font-[family-name:var(--font-mono)]',
  'prose-code:before:content-none prose-code:after:content-none',
  'prose-table:border-collapse',
  'prose-th:border prose-th:border-[var(--color-base-border)] prose-th:bg-[var(--color-base-raised)]/50 prose-th:px-3 prose-th:py-1.5 prose-th:text-[var(--color-base-text)]',
  'prose-td:border prose-td:border-[var(--color-base-border-subtle)] prose-td:px-3 prose-td:py-1.5 prose-td:text-[var(--color-base-text)]',
  'prose-blockquote:border-[var(--color-base-border)] prose-blockquote:text-[var(--color-base-text-secondary)]',
  'prose-hr:border-[var(--color-base-border-subtle)]',
].join(' ')

function CodeBlock({ className, children }: { className?: string; children?: React.ReactNode }) {
  const [copied, setCopied] = useState(false)
  const language = className?.replace('language-', '') ?? ''
  const code = String(children).replace(/\n$/, '')
  const isAnsi = hasAnsiCodes(code)
  const highlightedHtml = useShiki(isAnsi ? '' : code, isAnsi ? '' : language)

  const handleCopy = useCallback(() => {
    // Strip ANSI codes for clean clipboard text
    // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional ANSI escape matching
    navigator.clipboard.writeText(code.replace(/\x1b\[[0-9;]*m/g, ''))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [code])

  const label = isAnsi ? 'output' : language || 'code'

  return (
    <div className="group relative my-3 overflow-hidden rounded-lg border border-[var(--color-base-border-subtle)] bg-[var(--color-base-surface)]">
      <div className="flex items-center justify-between border-[var(--color-base-border-subtle)]/60 border-b bg-[var(--color-base-surface)]/80 px-3 py-1.5">
        <span className="font-[family-name:var(--font-mono)] text-[11px] text-[var(--color-base-text-muted)]">
          {label}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-[var(--color-base-text-muted)] transition-colors hover:bg-[var(--color-base-raised)] hover:text-[var(--color-base-text)]"
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
          <code className="font-[family-name:var(--font-mono)] text-[var(--color-base-text)] text-xs leading-relaxed">
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
      className="overflow-x-auto p-3 font-[family-name:var(--font-mono)] text-[var(--color-base-text)] text-xs leading-relaxed"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized HTML from ansi-to-html (escapeXML: true)
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

/** Renders Shiki's pre-escaped HTML output. Safe: Shiki HTML-escapes all code tokens internally. */
function SyntaxOutput({ html }: { html: string }) {
  return (
    <div
      className="shiki-wrapper [&_pre]:!bg-transparent [&_code]:!bg-transparent overflow-x-auto p-3 font-[family-name:var(--font-mono)] text-xs leading-relaxed"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized HTML from Shiki tokenizer (HTML-escapes all code)
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

const markdownComponents: React.ComponentProps<typeof ReactMarkdown>['components'] = {
  code({ className, children, ...props }) {
    const isInline = !className && !String(children).includes('\n')
    if (isInline) {
      return (
        <code
          className="rounded bg-[var(--color-base-raised)] px-1.5 py-0.5 font-[family-name:var(--font-mono)] text-[var(--color-accent-text)] text-xs"
          {...props}
        >
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
    <div className="my-3 overflow-hidden rounded-lg border border-[var(--color-special)]/25 bg-gradient-to-br from-[var(--color-special)]/10 to-[var(--color-base-surface)]/80">
      <div className="border-[var(--color-special)]/30 border-l-2 px-4 py-3">
        <div className="mb-2 flex items-center gap-2">
          <Lightbulb size={14} className="text-[var(--color-special)]" />
          <span className="font-semibold text-[var(--color-special)] text-xs uppercase tracking-wide">
            Insight
          </span>
        </div>
        <div
          className={
            proseClasses +
            'prose-li:text-[var(--color-base-text)] prose-p:text-[var(--color-base-text)] prose-strong:text-[var(--color-special)]'
          }
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {text}
          </ReactMarkdown>
        </div>
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
        ),
      )}
    </>
  )
})

export function TextBlock({ text, isStreaming }: TextBlockProps) {
  if (typeof text === 'string' && text.startsWith('__PR_CREATED__')) {
    try {
      const data = JSON.parse(text.replace('__PR_CREATED__', ''))
      return (
        <PrCreatedCard
          prNumber={data.prNumber}
          title={data.title}
          url={data.url}
          baseBranch={data.baseBranch}
          headBranch={data.headBranch}
          stats={data.stats}
        />
      )
    } catch {
      /* fall through to normal rendering */
    }
  }

  if (isStreaming) {
    const splitIdx = text.lastIndexOf('\n\n')
    const settled = splitIdx > 0 ? text.slice(0, splitIdx) : ''
    const tail = splitIdx > 0 ? text.slice(splitIdx) : text

    return (
      <>
        {settled && <SettledMarkdown text={settled} />}
        <div className="prose prose-invert prose-sm max-w-none prose-p:text-[var(--color-base-text)]">
          <span className="whitespace-pre-wrap text-[var(--color-base-text)]">{tail}</span>
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
        ),
      )}
    </>
  )
}
