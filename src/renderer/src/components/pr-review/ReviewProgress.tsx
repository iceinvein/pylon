import { useState, useEffect, useRef, useMemo } from 'react'
import { Loader2, StopCircle, ChevronDown, MessageSquareText, AlertCircle, AlertTriangle, Lightbulb, Info, CheckCircle2, XCircle } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { usePrReviewStore } from '../../store/pr-review-store'

const REVIEW_PHRASES = [
  'Scanning for footguns...',
  'Reading between the lines...',
  'Judging your variable names...',
  'Searching for TODO comments you forgot about...',
  'Checking if you remembered error handling...',
  'Looking for the bugs you swore weren\'t there...',
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
  const [phraseIdx, setPhraseIdx] = useState(() => Math.floor(Math.random() * REVIEW_PHRASES.length))
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
}

const SEVERITY_CONFIG: Record<string, { icon: typeof AlertCircle; color: string; bg: string }> = {
  critical: { icon: AlertCircle, color: 'text-red-400', bg: 'bg-red-500/10' },
  warning: { icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-500/10' },
  suggestion: { icon: Lightbulb, color: 'text-blue-400', bg: 'bg-blue-500/10' },
  nitpick: { icon: Info, color: 'text-stone-400', bg: 'bg-stone-500/10' },
}

/** Extract partially-streamed findings from raw text as it arrives */
function extractStreamFindings(text: string): { findings: StreamFinding[]; preamble: string } {
  // Find the review-findings fence (variable backtick count)
  const fenceMatch = text.match(/`{3,}review-findings/)
  if (!fenceMatch || fenceMatch.index === undefined) {
    return { findings: [], preamble: text }
  }

  const preamble = text.slice(0, fenceMatch.index).trim()
  const jsonStart = text.indexOf('\n', fenceMatch.index) + 1
  let jsonText = text.slice(jsonStart)

  // Remove closing fence if present
  const closingMatch = jsonText.match(/`{3,}/)
  if (closingMatch && closingMatch.index !== undefined) {
    jsonText = jsonText.slice(0, closingMatch.index)
  }

  jsonText = jsonText.trim()

  // First, try parsing as a complete JSON array
  const findings: StreamFinding[] = []
  try {
    const parsed = JSON.parse(jsonText)
    if (Array.isArray(parsed)) {
      for (const obj of parsed) {
        findings.push({
          file: String(obj.file || ''),
          line: obj.line != null ? Number(obj.line) : null,
          severity: String(obj.severity || 'suggestion'),
          title: String(obj.title || ''),
          description: String(obj.description || ''),
        })
      }
      return { findings, preamble }
    }
  } catch {
    // Incomplete array — extract individual objects by balanced brace matching
  }

  // Extract individual JSON objects by tracking brace depth (handles braces in strings)
  let i = 0
  while (i < jsonText.length) {
    if (jsonText[i] !== '{') { i++; continue }
    let depth = 0
    let inString = false
    let escaped = false
    let j = i
    for (; j < jsonText.length; j++) {
      const ch = jsonText[j]
      if (escaped) { escaped = false; continue }
      if (ch === '\\' && inString) { escaped = true; continue }
      if (ch === '"') { inString = !inString; continue }
      if (inString) continue
      if (ch === '{') depth++
      else if (ch === '}') { depth--; if (depth === 0) break }
    }
    if (depth === 0 && j < jsonText.length) {
      const objStr = jsonText.slice(i, j + 1)
      try {
        const obj = JSON.parse(objStr)
        if (obj.file || obj.title) {
          findings.push({
            file: String(obj.file || ''),
            line: obj.line != null ? Number(obj.line) : null,
            severity: String(obj.severity || 'suggestion'),
            title: String(obj.title || ''),
            description: String(obj.description || ''),
          })
        }
      } catch { /* incomplete object, skip */ }
      i = j + 1
    } else {
      break // unclosed brace — still streaming
    }
  }

  return { findings, preamble }
}

export function ReviewProgress({ reviewId: _reviewId, onStop, isLive = true }: Props) {
  const streamingText = usePrReviewStore((s) => s.reviewStreamingText)
  const agentProgress = usePrReviewStore((s) => s.agentProgress)
  const [expanded, setExpanded] = useState(isLive)
  const scrollRef = useRef<HTMLDivElement>(null)

  const { findings, preamble } = useMemo(
    () => extractStreamFindings(streamingText),
    [streamingText]
  )

  useEffect(() => {
    if (isLive && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [streamingText, isLive])

  if (!streamingText) {
    if (!isLive) return null
    return (
      <div className="flex items-center gap-3 rounded-lg border border-stone-800 bg-stone-900/40 px-4 py-3">
        <Loader2 size={14} className="flex-shrink-0 animate-spin text-stone-400" />
        <span className="text-xs"><ReviewStatusMessage /></span>
        {onStop && (
          <button
            onClick={onStop}
            className="ml-auto flex flex-shrink-0 items-center gap-1.5 rounded border border-stone-700 px-2 py-1 text-xs text-stone-400 transition-colors hover:border-stone-600 hover:text-stone-300"
          >
            <StopCircle size={10} />
            Stop
          </button>
        )}
      </div>
    )
  }

  const findingCount = agentProgress.length > 0
    ? agentProgress.reduce((sum, a) => sum + a.findingsCount, 0)
    : findings.length

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-stone-800 bg-stone-900/40">
      {/* Header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-xs transition-colors hover:bg-stone-800/40"
      >
        {isLive ? (
          <Loader2 size={12} className="flex-shrink-0 animate-spin text-stone-400" />
        ) : (
          <MessageSquareText size={12} className="flex-shrink-0 text-stone-500" />
        )}
        <span className="font-medium text-stone-300">
          {isLive ? 'Reviewing...' : 'Review Output'}
        </span>
        {findingCount > 0 && (
          <span className="rounded-full bg-stone-800 px-2 py-0.5 text-[10px] tabular-nums text-stone-400">
            {findingCount} finding{findingCount !== 1 ? 's' : ''}
          </span>
        )}
        <div className="flex-1" />
        {isLive && onStop && (
          <button
            onClick={(e) => { e.stopPropagation(); onStop() }}
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

      {agentProgress.length > 1 && (
        <div className="flex flex-wrap gap-2 border-t border-stone-800 px-3 py-2">
          {agentProgress.map((agent) => (
            <div
              key={agent.agentId}
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium ${
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
              className="min-h-0 flex-1 overflow-y-auto border-t border-stone-800"
            >
              {preamble && (
                <div className="border-b border-stone-800/50 px-4 py-3 text-xs leading-relaxed text-stone-500">
                  {preamble}
                </div>
              )}

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
                            <span className="text-xs font-medium text-stone-200">{f.title}</span>
                          </div>
                          {f.file && (
                            <div className="mt-0.5 font-[family-name:var(--font-mono)] text-[11px] text-stone-500">
                              {f.file}{f.line ? `:${f.line}` : ''}
                            </div>
                          )}
                          {f.description && (
                            <p className="mt-1 text-xs leading-relaxed text-stone-400">{f.description}</p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {isLive && findings.length === 0 && !preamble && (
                <div className="flex items-center gap-2 px-4 py-3 text-xs">
                  <Loader2 size={10} className="flex-shrink-0 animate-spin text-stone-500" />
                  <ReviewStatusMessage />
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
