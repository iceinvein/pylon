import type { ReviewFinding } from '../shared/types'

export type CriticVerdict = 'keep' | 'drop'

export type CriticPartition = {
  // Findings that bypass the critic because they already pass strong filters.
  autoKept: ReviewFinding[]
  // Findings that need the critic to decide keep vs drop.
  candidates: ReviewFinding[]
}

const STRONG_SEVERITIES: ReadonlySet<string> = new Set(['blocker', 'high'])
const STRONG_ACTIONS: ReadonlySet<string> = new Set(['must-fix', 'should-fix'])

/**
 * Split findings into two groups:
 *  - autoKept: severity is blocker/high AND action is must-fix/should-fix AND
 *    the finding is anchored to a real line. The literature evidence is that
 *    multi-pass aggregation gives the largest lift on the medium-confidence
 *    cluster; high-prior findings barely change verdict, so we save the budget.
 *  - candidates: everything else, sent to the critic.
 */
export function partitionForCritic(findings: ReviewFinding[]): CriticPartition {
  const autoKept: ReviewFinding[] = []
  const candidates: ReviewFinding[] = []
  for (const f of findings) {
    const strongSeverity = STRONG_SEVERITIES.has(f.severity)
    const strongAction = STRONG_ACTIONS.has(f.risk.action)
    const anchored = f.line != null && f.file !== ''
    if (strongSeverity && strongAction && anchored) {
      autoKept.push(f)
    } else {
      candidates.push(f)
    }
  }
  return { autoKept, candidates }
}

const CRITIC_SYSTEM_PROMPT = `You are a senior code reviewer auditing a list of candidate review findings produced by other agents on a pull request. Your only job is to keep the findings that a busy reviewer would genuinely thank you for surfacing, and drop the rest. You do not see the diff itself; you only see what the candidate finding claims, its anchor, and its risk fields. Treat each candidate skeptically.

Drop a finding if any of the following hold:
- The description sounds speculative, hedged, or "needs verification" without strong evidence in the title or anchor.
- The finding is a stylistic preference, micro-optimization, or "nice to have" cleanup with no concrete user or maintenance impact.
- The finding is a pre-existing concern not introduced by the PR.
- The finding is a theoretical risk that requires unlikely preconditions, or defense-in-depth on already-defended code.
- The finding belongs to a category the repository's linter already enforces (naming, formatting, unused imports).
- The finding is on a test file or a generated/vendored file unless it materially affects test correctness.
- The finding duplicates another candidate at a similar anchor and is the weaker version.

Keep a finding if it points to a concrete defect on a changed line, with enough specificity that a reviewer could decide to act on it without re-reading the entire PR.

When in doubt, drop. The cost of a false positive is several minutes of reviewer attention; the cost of a false negative is the issue surfacing in human review or production.`

export type CriticPromptParts = {
  systemPrompt: string
  userPrompt: string
}

/**
 * Build the critic prompt from candidate findings. The user prompt is small by
 * design: just the candidate JSON plus an instruction. The diff is intentionally
 * not re-fed; the critic decides based on what each finding claims to be.
 */
export function buildCriticPrompt(candidates: ReviewFinding[]): CriticPromptParts {
  const compact = candidates.map((f) => ({
    id: f.id,
    file: f.file,
    line: f.line,
    severity: f.severity,
    domain: f.domain,
    action: f.risk.action,
    confidence: f.risk.confidence,
    likelihood: f.risk.likelihood,
    impact: f.risk.impact,
    title: f.title,
    description: f.description,
    hasSuggestion: f.suggestion != null,
  }))

  const userPrompt = `For each candidate below, decide whether to keep it or drop it.

Output a JSON array inside a fenced code block tagged \`review-critic\`. Each entry must be:
- \`id\`: the candidate id (string, copied verbatim)
- \`verdict\`: "keep" or "drop"
- \`reason\`: one short sentence (under 18 words) explaining why

Output every candidate exactly once. Do not invent ids. Do not output anything outside the fenced block.

\`\`\`review-critic
[
  { "id": "<copy id from input>", "verdict": "keep", "reason": "concrete null-deref on changed line, anchored, low ambiguity" },
  { "id": "<copy id from input>", "verdict": "drop", "reason": "stylistic preference, no behavioural impact" }
]
\`\`\`

## Candidates
\`\`\`json
${JSON.stringify(compact, null, 2)}
\`\`\``

  return { systemPrompt: CRITIC_SYSTEM_PROMPT, userPrompt }
}

/**
 * Parse the critic's response. Returns a Map from finding id to verdict for the
 * subset of candidates the critic ruled on. Missing or malformed entries are
 * silently skipped; the caller decides how to treat unmatched candidates.
 */
export function parseCriticVerdicts(
  text: string,
  candidateIds: Set<string>,
): Map<string, CriticVerdict> {
  const verdicts = new Map<string, CriticVerdict>()
  if (!text) return verdicts

  const fenceRegex = /`{3,}review-critic\s*\n([\s\S]*?)`{3,}/g
  let block: string | null = null
  let match = fenceRegex.exec(text)
  while (match !== null) {
    block = match[1].trim()
    match = fenceRegex.exec(text)
  }

  // Fallback: try a bare JSON array if no fenced block was emitted.
  if (!block) {
    const bare = text.match(/\[\s*{[\s\S]*}\s*\]/)
    if (bare) block = bare[0]
  }
  if (!block) return verdicts

  let parsed: unknown
  try {
    parsed = JSON.parse(block)
  } catch {
    return verdicts
  }
  if (!Array.isArray(parsed)) return verdicts

  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object') continue
    const row = entry as Record<string, unknown>
    const id = typeof row.id === 'string' ? row.id : null
    const verdict = typeof row.verdict === 'string' ? row.verdict.toLowerCase() : null
    if (!id || !candidateIds.has(id)) continue
    if (verdict === 'keep' || verdict === 'drop') {
      verdicts.set(id, verdict)
    }
  }
  return verdicts
}

/**
 * Combine auto-kept findings with critic-kept candidates. Candidates that the
 * critic did not rule on (e.g. response truncated) default to keep so we never
 * silently lose findings on a transient parse failure.
 */
export function applyCriticVerdicts(
  partition: CriticPartition,
  verdicts: Map<string, CriticVerdict>,
): ReviewFinding[] {
  const kept: ReviewFinding[] = [...partition.autoKept]
  for (const candidate of partition.candidates) {
    const verdict = verdicts.get(candidate.id)
    if (verdict === 'drop') continue
    kept.push(candidate)
  }
  return kept
}
