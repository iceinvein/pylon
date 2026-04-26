import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Info,
  Lightbulb,
  Loader2,
  MessageSquareText,
  StopCircle,
  XCircle,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { usePrReviewStore } from '../../store/pr-review-store'

const REVIEW_PHRASES = [
  'Scanning for footguns...',
  'Reading between the lines...',
  'Judging your variable names...',
  'Searching for TODO comments you forgot about...',
  'Checking if you remembered error handling...',
  "Looking for the bugs you swore weren't there...",
  'Tracing data flows like a detective...',
  'Counting the layers of abstraction...',
  'Evaluating your life choices... I mean, code choices...',
  'Inspecting every semicolon with suspicion...',
  'Running the code in my head...',
  'Consulting the OWASP top 10...',
  'Mentally fuzzing your inputs...',
  'Checking for off-by-one errors... or was it off-by-two...',
  'Reviewing like my reputation depends on it...',
  'Squinting at that regex...',
  'Wondering why this function is 200 lines long...',
  'Stress-testing edge cases in my imagination...',
  'Looking for secrets you accidentally committed...',
  'Asking myself "but what if the list is empty?"...',
]

function ReviewStatusMessage() {
  const [phraseIdx, setPhraseIdx] = useState(() =>
    Math.floor(Math.random() * REVIEW_PHRASES.length),
  )
  const [charIdx, setCharIdx] = useState(0)
  const phrase = REVIEW_PHRASES[phraseIdx]

  useEffect(() => {
    if (charIdx < phrase.length) {
      const id = setTimeout(() => setCharIdx((c) => c + 1), 30)
      return () => clearTimeout(id)
    }
    const id = setTimeout(() => {
      setPhraseIdx((i) => (i + 1) % REVIEW_PHRASES.length)
      setCharIdx(0)
    }, 2500)
    return () => clearTimeout(id)
  }, [charIdx, phrase.length])

  return (
    <span className="text-base-text-muted">
      {phrase.slice(0, charIdx)}
      <span className="inline-block h-3 w-0.75 animate-pulse rounded-sm bg-base-text-faint align-text-bottom" />
    </span>
  )
}

type Props = {
  reviewId: string
  onStop?: () => void
  isLive?: boolean
}

type StreamFinding = {
  file: string
  line: number | null
  severity: string
  title: string
  description: string
  domain: string | null
}

const SEVERITY_CONFIG: Record<string, { icon: typeof AlertCircle; color: string; bg: string }> = {
  blocker: {
    icon: AlertCircle,
    color: 'text-[var(--color-error)]',
    bg: 'bg-[var(--color-error)]/10',
  },
  high: {
    icon: AlertTriangle,
    color: 'text-[var(--color-risk-high)]',
    bg: 'bg-[var(--color-risk-high)]/12',
  },
  medium: {
    icon: Lightbulb,
    color: 'text-[var(--color-risk-medium)]',
    bg: 'bg-[var(--color-risk-medium)]/10',
  },
  low: {
    icon: Info,
    color: 'text-[var(--color-base-text-secondary)]',
    bg: 'bg-[var(--color-base-text-muted)]/10',
  },
}

const DOMAIN_LABELS: Record<string, string> = {
  security: 'Security',
  bugs: 'Bugs',
  performance: 'Perf',
  'code-smells': 'Smells',
  style: 'Style',
  architecture: 'Arch',
  ux: 'UX',
}

/** Parse a single review-findings JSON block (complete or partial) */
function parseFindingsBlock(text: string): StreamFinding[] {
  const findings: StreamFinding[] = []

  // Try complete JSON array first
  try {
    const parsed = JSON.parse(text)
    if (Array.isArray(parsed)) {
      for (const obj of parsed) {
        findings.push({
          file: String(obj.file || ''),
          line: obj.line != null ? Number(obj.line) : null,
          severity: String(obj.severity || 'medium'),
          title: String(obj.title || ''),
          description: String(obj.description || ''),
          domain: null,
        })
      }
      return findings
    }
  } catch {
    // Incomplete — extract individual objects by balanced brace matching
  }

  let i = 0
  while (i < text.length) {
    if (text[i] !== '{') {
      i++
      continue
    }
    let depth = 0
    let inString = false
    let escaped = false
    let j = i
    for (; j < text.length; j++) {
      const ch = text[j]
      if (escaped) {
        escaped = false
        continue
      }
      if (ch === '\\' && inString) {
        escaped = true
        continue
      }
      if (ch === '"') {
        inString = !inString
        continue
      }
      if (inString) continue
      if (ch === '{') depth++
      else if (ch === '}') {
        depth--
        if (depth === 0) break
      }
    }
    if (depth === 0 && j < text.length) {
      const objStr = text.slice(i, j + 1)
      try {
        const obj = JSON.parse(objStr)
        if (obj.file || obj.title) {
          findings.push({
            file: String(obj.file || ''),
            line: obj.line != null ? Number(obj.line) : null,
            severity: String(obj.severity || 'medium'),
            title: String(obj.title || ''),
            description: String(obj.description || ''),
            domain: null,
          })
        }
      } catch {
        /* incomplete object, skip */
      }
      i = j + 1
    } else {
      break
    }
  }
  return findings
}

/**
 * Extract findings from combined streaming text that may contain
 * multiple review-findings blocks (one per agent, separated by ---).
 */
function extractStreamFindings(text: string): { findings: StreamFinding[]; preamble: string } {
  const findings: StreamFinding[] = []
  let preamble = ''

  // Find ALL review-findings fences using a global regex
  const fenceRegex = /`{3,}review-findings\s*\n/g
  let match: RegExpExecArray | null = fenceRegex.exec(text)
  let firstFenceIdx = -1

  while (match !== null) {
    if (firstFenceIdx === -1) firstFenceIdx = match.index

    const jsonStart = match.index + match[0].length
    const rest = text.slice(jsonStart)

    // Find closing fence
    const closingMatch = rest.match(/`{3,}/)
    const jsonText =
      closingMatch && closingMatch.index !== undefined
        ? rest.slice(0, closingMatch.index).trim()
        : rest.trim()

    findings.push(...parseFindingsBlock(jsonText))
    match = fenceRegex.exec(text)
  }

  if (firstFenceIdx > 0) {
    preamble = text.slice(0, firstFenceIdx).trim()
  } else if (findings.length === 0) {
    preamble = text
  }

  return { findings, preamble }
}

export function ReviewProgress({ reviewId: _reviewId, onStop, isLive = true }: Props) {
  const streamingText = usePrReviewStore((s) => s.reviewStreamingText)
  const agentProgress = usePrReviewStore((s) => s.agentProgress)
  const contextPhase = usePrReviewStore((s) => s.contextPhase)
  const [expanded, setExpanded] = useState(isLive)
  const scrollRef = useRef<HTMLDivElement>(null)

  const { findings } = useMemo(() => extractStreamFindings(streamingText), [streamingText])

  useEffect(() => {
    if (isLive && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [isLive])

  if (!streamingText && !agentProgress.length) {
    if (!isLive) return null
  }

  const findingCount =
    agentProgress.length > 0
      ? agentProgress.reduce((sum, a) => sum + a.findingsCount, 0)
      : findings.length

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-base-border-subtle bg-base-surface/40">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-xs transition-colors hover:bg-base-raised/40"
      >
        {isLive ? (
          <Loader2 size={12} className="shrink-0 animate-spin text-base-text-secondary" />
        ) : (
          <MessageSquareText size={12} className="shrink-0 text-base-text-muted" />
        )}
        <span className="min-w-0 truncate font-medium text-base-text">
          {isLive ? <ReviewStatusMessage /> : 'Review Output'}
        </span>
        {findingCount > 0 && (
          <span className="rounded-full bg-base-raised px-2 py-0.5 text-[10px] text-base-text-secondary tabular-nums">
            {findingCount} finding{findingCount !== 1 ? 's' : ''}
          </span>
        )}
        {contextPhase === 'building' && (
          <span className="text-[10px] text-base-text-muted">Building code context...</span>
        )}
        <div className="flex-1" />
        {isLive && onStop && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onStop()
            }}
            className="flex items-center gap-1 rounded border border-base-border px-2 py-0.5 text-base-text-secondary transition-colors hover:border-error hover:bg-error/30 hover:text-error"
          >
            <StopCircle size={10} />
            Stop
          </button>
        )}
        <ChevronDown
          size={12}
          className={`shrink-0 text-base-text-muted transition-transform duration-150 ${expanded ? '' : '-rotate-90'}`}
        />
      </button>

      {/* Agent progress pills */}
      {agentProgress.length > 1 && (
        <div className="flex flex-wrap gap-2 border-base-border-subtle border-t px-3 py-2">
          {agentProgress.map((agent) => (
            <div
              key={agent.agentId}
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium text-[10px] ${
                agent.status === 'done'
                  ? 'bg-emerald-500/10 text-emerald-400'
                  : agent.status === 'error'
                    ? 'bg-error/10 text-error'
                    : agent.status === 'running'
                      ? 'bg-base-raised text-base-text'
                      : 'bg-base-raised/50 text-base-text-muted'
              }`}
            >
              {agent.status === 'running' && <Loader2 size={9} className="animate-spin" />}
              {agent.status === 'done' && <CheckCircle2 size={9} />}
              {agent.status === 'error' && <XCircle size={9} />}
              <span>{DOMAIN_LABELS[agent.agentId] ?? agent.agentId}</span>
              {agent.status === 'running' && agent.totalChunks != null && agent.totalChunks > 1 && (
                <span className="tabular-nums opacity-70">
                  {agent.currentChunk}/{agent.totalChunks}
                </span>
              )}
              {agent.status === 'done' && agent.findingsCount > 0 && (
                <span className="tabular-nums">{agent.findingsCount}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Content */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            <div
              ref={scrollRef}
              className="min-h-0 flex-1 overflow-y-auto border-base-border-subtle border-t"
            >
              {/* Streamed findings as they arrive */}
              {findings.length > 0 && (
                <div className="space-y-px">
                  {findings.map((f, i) => {
                    const config = SEVERITY_CONFIG[f.severity] ?? SEVERITY_CONFIG.medium
                    const Icon = config.icon
                    return (
                      <div key={i} className={`flex gap-3 px-4 py-3 ${config.bg}`}>
                        <Icon size={14} className={`mt-0.5 shrink-0 ${config.color}`} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2">
                            <span className="font-medium text-base-text text-xs">{f.title}</span>
                            {f.domain && (
                              <span className="rounded bg-base-raised px-1.5 py-0.5 font-medium text-[10px] text-base-text-muted uppercase tracking-wider">
                                {DOMAIN_LABELS[f.domain] ?? f.domain}
                              </span>
                            )}
                          </div>
                          {f.file && (
                            <div className="mt-0.5 font-mono text-base-text-muted text-xs">
                              {f.file}
                              {f.line ? `:${f.line}` : ''}
                            </div>
                          )}
                          {f.description && (
                            <p className="mt-1 text-base-text-secondary text-xs leading-relaxed">
                              {f.description}
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Empty state while waiting for findings */}
              {isLive && findings.length === 0 && (
                <div className="flex items-center justify-center py-8 text-base-text-faint text-xs">
                  Waiting for findings...
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
