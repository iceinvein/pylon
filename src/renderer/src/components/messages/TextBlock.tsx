import { useState, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Lightbulb, Copy, Check } from 'lucide-react'

type TextBlockProps = {
  text: string
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

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [code])

  return (
    <div className="group relative my-3 overflow-hidden rounded-lg border border-stone-800 bg-stone-900">
      <div className="flex items-center justify-between border-b border-stone-800/60 bg-stone-900/80 px-3 py-1.5">
        <span className="font-[family-name:var(--font-mono)] text-[11px] text-stone-500">
          {language || 'code'}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-stone-500 transition-colors hover:bg-stone-800 hover:text-stone-300"
        >
          {copied ? <Check size={11} /> : <Copy size={11} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto p-3">
        <code className="font-[family-name:var(--font-mono)] text-xs leading-relaxed text-stone-200">
          {code}
        </code>
      </pre>
    </div>
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

export function TextBlock({ text }: TextBlockProps) {
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
