import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { log } from '../shared/logger'
import type { ReviewFinding, ReviewFindingStatusInRun } from '../shared/types'
import { getDb } from './db'

const logger = log.child('pr-revalidation')
const REVALIDATION_CONCURRENCY = 4
const REVALIDATION_TIMEOUT_MS = 60_000
const CODE_WINDOW_LINES = 30

/** A thread that needs revalidation: prior issue identity plus its last observed instance. */
export type ThreadCandidate = {
  threadId: string
  seriesId: string
  canonicalTitle: string
  lastFile: string | null
  lastLine: number | null
  domain: string | null
  /** The most recent stored finding row for this thread (used as the prior observation). */
  prior: PriorFindingRow
}

type PriorFindingRow = {
  id: string
  title: string
  description: string
  severity: string
  impact: string
  likelihood: string
  confidence: string
  action: string
  file: string | null
  line: number | null
  domain: string | null
  posted: number
  postedAt: number | null
  suggestionBody: string | null
  suggestionStartLine: number | null
  suggestionEndLine: number | null
}

export type RevalidationVerdict = 'still_applies' | 'resolved' | 'uncertain'

export type RevalidationOutcome = {
  threadId: string
  verdict: RevalidationVerdict
  reasoning: string
  updatedTitle: string | null
  updatedDescription: string | null
  updatedLine: number | null
  /** Synthetic finding instance to persist for this run. */
  finding: ReviewFinding
}

export type RevalidationSessionRunner = (input: {
  cwd: string
  prompt: string
  signal?: AbortSignal
}) => Promise<string>

export type RevalidationInput = {
  reviewId: string
  seriesId: string
  /** Working directory containing the PR head checkout (worktree). */
  repoCwd: string
  /** Files touched by the incremental delta. */
  touchedFiles: Set<string>
  /** Runs a Claude session and returns the assistant text (streamed accumulated). */
  runSession: RevalidationSessionRunner
  /** Override default concurrency in tests. */
  concurrency?: number
}

/** Look up active threads whose anchor file is in the touched set. */
export function selectThreadsToRevalidate(
  reviewId: string,
  seriesId: string,
  touchedFiles: Set<string>,
): ThreadCandidate[] {
  if (touchedFiles.size === 0) return []
  const db = getDb()
  const threadRows = db
    .prepare(
      `SELECT id, series_id, canonical_title, status, last_file, last_line, domain, last_seen_review_id
       FROM pr_review_threads
       WHERE series_id = ? AND status IN ('persisting', 'needs_revalidation', 'new')
         AND last_seen_review_id != ?`,
    )
    .all(seriesId, reviewId) as Array<Record<string, unknown>>

  const findingStmt = db.prepare(
    `SELECT id, title, description, severity, impact, likelihood, confidence, action,
            file, line, domain, posted, posted_at, suggestion_body, suggestion_start_line, suggestion_end_line
     FROM pr_review_findings
     WHERE thread_id = ? AND review_id = ?
     ORDER BY rowid DESC LIMIT 1`,
  )

  const candidates: ThreadCandidate[] = []
  for (const row of threadRows) {
    const lastFile = (row.last_file as string) ?? null
    if (!lastFile || !touchedFiles.has(lastFile)) continue
    const priorRow = findingStmt.get(row.id, row.last_seen_review_id) as
      | Record<string, unknown>
      | undefined
    if (!priorRow) continue
    candidates.push({
      threadId: row.id as string,
      seriesId: row.series_id as string,
      canonicalTitle: row.canonical_title as string,
      lastFile,
      lastLine: typeof row.last_line === 'number' ? row.last_line : null,
      domain: (row.domain as string) ?? null,
      prior: {
        id: priorRow.id as string,
        title: priorRow.title as string,
        description: priorRow.description as string,
        severity: priorRow.severity as string,
        impact: priorRow.impact as string,
        likelihood: priorRow.likelihood as string,
        confidence: priorRow.confidence as string,
        action: priorRow.action as string,
        file: (priorRow.file as string) ?? null,
        line: typeof priorRow.line === 'number' ? priorRow.line : null,
        domain: (priorRow.domain as string) ?? null,
        posted: (priorRow.posted as number) ?? 0,
        postedAt: typeof priorRow.posted_at === 'number' ? priorRow.posted_at : null,
        suggestionBody: (priorRow.suggestion_body as string) ?? null,
        suggestionStartLine:
          typeof priorRow.suggestion_start_line === 'number'
            ? priorRow.suggestion_start_line
            : null,
        suggestionEndLine:
          typeof priorRow.suggestion_end_line === 'number' ? priorRow.suggestion_end_line : null,
      },
    })
  }
  return candidates
}

async function readCodeWindow(repoCwd: string, file: string, line: number | null): Promise<string> {
  const path = isAbsolute(file) ? file : join(repoCwd, file)
  const text = await readFile(path, 'utf8').catch(() => null)
  if (!text) return '(file not readable)'
  const lines = text.split('\n')
  if (line === null) {
    return lines.slice(0, 80).join('\n')
  }
  const half = Math.floor(CODE_WINDOW_LINES / 2)
  const start = Math.max(0, line - 1 - half)
  const end = Math.min(lines.length, line - 1 + half)
  const window: string[] = []
  for (let i = start; i < end; i++) {
    const lineNo = i + 1
    const marker = lineNo === line ? '>' : ' '
    window.push(`${marker} ${String(lineNo).padStart(4)} | ${lines[i]}`)
  }
  return window.join('\n')
}

function buildRevalidationPrompt(candidate: ThreadCandidate, codeWindow: string): string {
  return [
    'You are revalidating a previously-flagged code review finding against the current state of the file.',
    '',
    '## Prior Finding',
    `- **Title:** ${candidate.prior.title}`,
    `- **File:** ${candidate.prior.file ?? '(unknown)'}${candidate.prior.line ? `:${candidate.prior.line}` : ''}`,
    `- **Severity:** ${candidate.prior.severity}`,
    `- **Domain:** ${candidate.prior.domain ?? candidate.domain ?? 'unknown'}`,
    '',
    '### Description',
    candidate.prior.description,
    '',
    '## Current Code',
    '',
    '```',
    codeWindow,
    '```',
    '',
    '## Your Task',
    '',
    'Decide one of these verdicts:',
    '- `still_applies`: the issue is present at this anchor as described.',
    '- `resolved`: the issue has been addressed; the prior concern no longer applies here.',
    '- `uncertain`: you cannot confirm either way from the code shown.',
    '',
    'Return your verdict as a single fenced JSON block (and nothing else) using this shape:',
    '',
    '```revalidation',
    '{',
    '  "verdict": "still_applies" | "resolved" | "uncertain",',
    '  "reasoning": "one or two sentences",',
    '  "updatedTitle": "(optional) refreshed title if line/intent changed",',
    '  "updatedDescription": "(optional) refreshed description if context changed",',
    '  "updatedLine": (optional) integer line number if the anchor moved',
    '}',
    '```',
    '',
    'Be conservative: prefer `uncertain` over guessing. Do not invent new issues.',
  ].join('\n')
}

function parseVerdict(text: string): {
  verdict: RevalidationVerdict
  reasoning: string
  updatedTitle: string | null
  updatedDescription: string | null
  updatedLine: number | null
} {
  const fence = text.match(/```revalidation\s*([\s\S]*?)```/)
  const candidate = fence?.[1] ?? text
  const arrayStart = candidate.indexOf('{')
  const arrayEnd = candidate.lastIndexOf('}')
  const jsonStr =
    arrayStart >= 0 && arrayEnd > arrayStart ? candidate.slice(arrayStart, arrayEnd + 1) : ''
  const fallback = {
    verdict: 'uncertain' as RevalidationVerdict,
    reasoning: 'Unable to parse verdict from agent response.',
    updatedTitle: null,
    updatedDescription: null,
    updatedLine: null,
  }
  if (!jsonStr) return fallback
  try {
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>
    const raw = String(parsed.verdict ?? '').toLowerCase()
    const verdict: RevalidationVerdict =
      raw === 'still_applies' || raw === 'resolved' ? raw : 'uncertain'
    const updatedLine =
      typeof parsed.updatedLine === 'number' && Number.isFinite(parsed.updatedLine)
        ? Math.trunc(parsed.updatedLine)
        : null
    return {
      verdict,
      reasoning: String(parsed.reasoning ?? ''),
      updatedTitle:
        typeof parsed.updatedTitle === 'string' && parsed.updatedTitle.trim().length > 0
          ? parsed.updatedTitle.trim()
          : null,
      updatedDescription:
        typeof parsed.updatedDescription === 'string' && parsed.updatedDescription.trim().length > 0
          ? parsed.updatedDescription.trim()
          : null,
      updatedLine,
    }
  } catch {
    return fallback
  }
}

function statusFromVerdict(verdict: RevalidationVerdict): ReviewFindingStatusInRun {
  if (verdict === 'still_applies') return 'persisting'
  if (verdict === 'resolved') return 'resolved'
  return 'needs_revalidation'
}

function priorToFinding(candidate: ThreadCandidate): ReviewFinding {
  const p = candidate.prior
  const severity = (['blocker', 'high', 'medium', 'low'] as const).includes(
    p.severity as 'blocker' | 'high' | 'medium' | 'low',
  )
    ? (p.severity as 'blocker' | 'high' | 'medium' | 'low')
    : 'medium'
  return {
    id: randomUUID(),
    file: p.file ?? '',
    line: p.line,
    severity,
    risk: {
      impact: (p.impact as 'critical' | 'high' | 'medium' | 'low') ?? 'medium',
      likelihood: (p.likelihood as 'likely' | 'possible' | 'edge-case' | 'unknown') ?? 'possible',
      confidence: (p.confidence as 'high' | 'medium' | 'low') ?? 'medium',
      action: (p.action as 'must-fix' | 'should-fix' | 'consider' | 'optional') ?? 'consider',
    },
    title: p.title,
    description: p.description,
    domain: (p.domain as ReviewFinding['domain']) ?? (candidate.domain as ReviewFinding['domain']),
    posted: Boolean(p.posted),
    postUrl: null,
    threadId: candidate.threadId,
    statusInRun: 'needs_revalidation',
    carriedForward: true,
    sourceReviewId: null,
    suggestion:
      p.suggestionBody && p.suggestionStartLine != null && p.suggestionEndLine != null
        ? {
            body: p.suggestionBody,
            startLine: p.suggestionStartLine,
            endLine: p.suggestionEndLine,
          }
        : undefined,
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  const timeout = new Promise<never>((_, reject) => {
    const t = setTimeout(() => reject(new Error(`Timed out after ${ms}ms: ${label}`)), ms)
    t.unref?.()
  })
  return Promise.race([promise, timeout])
}

async function runWithLimit<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  const queue = [...items]
  const workers: Promise<void>[] = []
  const worker = async (): Promise<void> => {
    while (true) {
      const item = queue.shift()
      if (!item) return
      await fn(item)
    }
  }
  for (let i = 0; i < Math.min(limit, items.length); i++) {
    workers.push(worker())
  }
  await Promise.all(workers)
}

export async function runRevalidationPass(
  input: RevalidationInput,
): Promise<RevalidationOutcome[]> {
  const candidates = selectThreadsToRevalidate(input.reviewId, input.seriesId, input.touchedFiles)
  if (candidates.length === 0) return []

  logger.info(
    `Revalidating ${candidates.length} thread(s) in touched files (review=${input.reviewId})`,
  )

  const outcomes: RevalidationOutcome[] = []
  const concurrency = Math.max(1, input.concurrency ?? REVALIDATION_CONCURRENCY)

  await runWithLimit(candidates, concurrency, async (candidate) => {
    const file = candidate.lastFile ?? candidate.prior.file ?? ''
    const codeWindow = await readCodeWindow(input.repoCwd, file, candidate.lastLine).catch(
      () => '(failed to read file)',
    )
    const prompt = buildRevalidationPrompt(candidate, codeWindow)

    let verdictData = {
      verdict: 'uncertain' as RevalidationVerdict,
      reasoning: '',
      updatedTitle: null as string | null,
      updatedDescription: null as string | null,
      updatedLine: null as number | null,
    }
    try {
      const text = await withTimeout(
        input.runSession({ cwd: input.repoCwd, prompt }),
        REVALIDATION_TIMEOUT_MS,
        `revalidate ${candidate.threadId}`,
      )
      verdictData = parseVerdict(text)
    } catch (err) {
      logger.warn(
        `Revalidation failed for thread ${candidate.threadId}, marking as needs_revalidation:`,
        err,
      )
    }

    const finding = priorToFinding(candidate)
    finding.statusInRun = statusFromVerdict(verdictData.verdict)
    if (verdictData.updatedTitle) finding.title = verdictData.updatedTitle
    if (verdictData.updatedDescription) finding.description = verdictData.updatedDescription
    if (verdictData.updatedLine !== null) finding.line = verdictData.updatedLine

    outcomes.push({
      threadId: candidate.threadId,
      verdict: verdictData.verdict,
      reasoning: verdictData.reasoning,
      updatedTitle: verdictData.updatedTitle,
      updatedDescription: verdictData.updatedDescription,
      updatedLine: verdictData.updatedLine,
      finding,
    })
  })

  return outcomes
}
