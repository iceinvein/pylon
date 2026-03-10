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
    <span className="text-stone-500">
      {phrase.slice(0, charIdx)}
      <span className="inline-block h-3 w-[3px] animate-pulse rounded-sm bg-stone-600 align-text-bottom" />
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
  critical: { icon: AlertCircle, color: 'text-red-400', bg: 'bg-red-500/10' },
  warning: { icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-500/10' },
  suggestion: { icon: Lightbulb, color: 'text-blue-400', bg: 'bg-blue-500/10' },
  nitpick: { icon: Info, color: 'text-stone-400', bg: 'bg-stone-500/10' },
}

const DOMAIN_LABELS: Record<string, string> = {
  security: 'Security',
  bugs: 'Bugs',
  performance: 'Perf',
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
          severity: String(obj.severity || 'suggestion'),
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
            severity: String(obj.severity || 'suggestion'),
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
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-stone-800 bg-stone-900/40">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-xs transition-colors hover:bg-stone-800/40"
      >
        {isLive ? (
          <Loader2 size={12} className="flex-shrink-0 animate-spin text-stone-400" />
        ) : (
          <MessageSquareText size={12} className="flex-shrink-0 text-stone-500" />
        )}
        <span className="min-w-0 truncate font-medium text-stone-300">
          {isLive ? <ReviewStatusMessage /> : 'Review Output'}
        </span>
        {findingCount > 0 && (
          <span className="rounded-full bg-stone-800 px-2 py-0.5 text-[10px] text-stone-400 tabular-nums">
            {findingCount} finding{findingCount !== 1 ? 's' : ''}
          </span>
        )}
        <div className="flex-1" />
        {isLive && onStop && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onStop()
            }}
            className="flex items-center gap-1 rounded border border-stone-700 px-2 py-0.5 text-stone-400 transition-colors hover:border-red-800 hover:bg-red-950/30 hover:text-red-400"
          >
            <StopCircle size={10} />
            Stop
          </button>
        )}
        <ChevronDown
          size={12}
          className={`flex-shrink-0 text-stone-500 transition-transform duration-150 ${expanded ? '' : '-rotate-90'}`}
        />
      </button>

      {/* Agent progress pills */}
      {agentProgress.length > 1 && (
        <div className="flex flex-wrap gap-2 border-stone-800 border-t px-3 py-2">
          {agentProgress.map((agent) => (
            <div
              key={agent.agentId}
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium text-[10px] ${
                agent.status === 'done'
                  ? 'bg-emerald-500/10 text-emerald-400'
                  : agent.status === 'error'
                    ? 'bg-red-500/10 text-red-400'
                    : agent.status === 'running'
                      ? 'bg-stone-800 text-stone-300'
                      : 'bg-stone-800/50 text-stone-500'
              }`}
            >
              {agent.status === 'running' && <Loader2 size={9} className="animate-spin" />}
              {agent.status === 'done' && <CheckCircle2 size={9} />}
              {agent.status === 'error' && <XCircle size={9} />}
              <span className="capitalize">{agent.agentId}</span>
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
              className="min-h-0 flex-1 overflow-y-auto border-stone-800 border-t"
            >
              {/* Streamed findings as they arrive */}
              {findings.length > 0 && (
                <div className="space-y-px">
                  {findings.map((f, i) => {
                    const config = SEVERITY_CONFIG[f.severity] ?? SEVERITY_CONFIG.suggestion
                    const Icon = config.icon
                    return (
                      <div key={i} className={`flex gap-3 px-4 py-3 ${config.bg}`}>
                        <Icon size={14} className={`mt-0.5 flex-shrink-0 ${config.color}`} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2">
                            <span className="font-medium text-stone-200 text-xs">{f.title}</span>
                            {f.domain && (
                              <span className="rounded bg-stone-800 px-1.5 py-0.5 font-medium text-[9px] text-stone-500 uppercase tracking-wider">
                                {DOMAIN_LABELS[f.domain] ?? f.domain}
                              </span>
                            )}
                          </div>
                          {f.file && (
                            <div className="mt-0.5 font-[family-name:var(--font-mono)] text-[11px] text-stone-500">
                              {f.file}
                              {f.line ? `:${f.line}` : ''}
                            </div>
                          )}
                          {f.description && (
                            <p className="mt-1 text-stone-400 text-xs leading-relaxed">
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
                <div className="flex items-center justify-center py-8 text-stone-600 text-xs">
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
