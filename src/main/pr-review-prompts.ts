/**
 * Pure prompt-building helpers for PR review agents.
 *
 * Extracted out of pr-review-manager so prompt structure can be unit-tested
 * (tools section ordering, imperative trigger language, per-tool triggers).
 */

import type { ReviewFocus } from '../shared/types'

export type PromptDetail = {
  title: string
  author: string
  headBranch: string
  baseBranch: string
  body: string
  files: ReadonlyArray<{ path: string; additions: number; deletions: number }>
}

export type PromptChunk = {
  diff: string
  files: string[]
}

export type FirstChunkInput = {
  focus: ReviewFocus
  detail: PromptDetail
  chunk: PromptChunk
  chunkIndex: number
  totalChunks: number
  skippedFiles: string[]
  specialistPrompt: string
}

export type ContinuationInput = {
  focus: ReviewFocus
  chunk: PromptChunk
  chunkIndex: number
  totalChunks: number
}

export function buildPrReviewFirstChunkPrompt(input: FirstChunkInput): string {
  const { focus, detail, chunk, chunkIndex, totalChunks, skippedFiles, specialistPrompt } = input
  const isMultiChunk = totalChunks > 1
  const chunkHeader = isMultiChunk
    ? `\n\n> **Chunk ${chunkIndex + 1} of ${totalChunks}** — this chunk contains: ${chunk.files.join(', ')}\n`
    : ''
  const skippedNote =
    skippedFiles.length > 0
      ? `\n\n## Skipped Files (excluded from review)\n${skippedFiles.map((f) => `- ${f}`).join('\n')}\n`
      : ''

  return `You are reviewing a GitHub pull request as a **${focus}** specialist.

## Specialist Instructions
${specialistPrompt}

## PR Information
- **Title:** ${detail.title}
- **Author:** ${detail.author}
- **Branch:** ${detail.headBranch} -> ${detail.baseBranch}
- **Files changed:** ${detail.files.length}

## PR Description
${detail.body || '(no description)'}

## Review Scope
- Report only issues introduced or materially worsened by this PR.
- Use surrounding code to validate changed-code impact, not to review unrelated pre-existing code.
- Prefer no finding over a speculative finding. If a concern depends on context you cannot verify from the bundle, **call \`find_references\`, \`get_definition\`, or \`search_code\` (see Tools section below) to verify before dropping it**.
- Avoid duplicate findings from other focus areas. Stay within your specialist role.
- Anchor findings to a changed RIGHT-side diff line whenever possible. If the root cause is a pre-existing line, anchor to the changed line that makes the issue reachable and explain that relationship.
- Do not report pre-existing issues unless the PR clearly makes them worse or newly exposes them.
- Do not report findings that your own reasoning describes as harmless, negligible, or "no action needed".
- Treat "needs verification" findings as lower-confidence: use severity "low" or "medium" unless the diff shows a clearly plausible high-impact path.

## Changed Files
${detail.files.map((f) => `- ${f.path} (+${f.additions} -${f.deletions})`).join('\n')}
${skippedNote}
## Pre-computed Code Context

Before analysing the diff, run this tool call first:

\`\`\`
Read .pylon/pr-context.json
\`\`\`

That file contains:
- Every symbol changed by this PR with its full definition
- References (callers) of each changed symbol across the codebase, capped at 20 per symbol with \`referencesTotal\` reporting the real count
- Tests that cover each changed symbol
- A \`notes\` array with caveats (timeouts, truncations, heuristic-mode warnings)

If the file is missing or errors, proceed with diff-only review and rely on the code-intelligence tools below.

## Tools: Code Intelligence (use these to resolve uncertainty before dropping findings)

The MCP server \`code-intelligence\` is wired into this session. Treat these as the way out when the bundle alone cannot prove or disprove a concern. **Drop findings only after the tools also fail to confirm.**

- Call \`find_references\` when a symbol in the bundle has \`referencesTruncated: true\`, OR when \`referencesTotal\` is 0 and you need to confirm the symbol is genuinely unused before flagging dead code.
- Call \`get_definition\` when the diff calls a symbol that is not in the bundle and you cannot tell from the diff alone whether the contract is being broken.
- Call \`search_code\` when you suspect a pattern (regex, error message, config key, sibling caller) that is not in the bundle.
- Call \`get_call_hierarchy\` when you need to know whether a changed function sits on a hot path or behind a guard, and the bundle's reference list does not include the upstream callers you need.
- Call \`trace_data_flow\` when a finding hinges on whether user-controlled or untrusted data reaches a sink, and the diff alone does not show the full path.

If a tool call errors, note that in your reasoning and fall back to diff-only review for that finding; do not retry indefinitely.
${chunkHeader}
## Diff
\`\`\`diff
${chunk.diff}
\`\`\`

## Output Format
Output your findings as a JSON array inside a fenced code block tagged \`review-findings\`. Each finding should have:
- \`file\`: the file path (string)
- \`line\`: the line number in the new file, or null for general findings (number | null)
- \`severity\`: immediate triage label, one of "blocker", "high", "medium", "low"
- \`risk\`: structured risk details:
  - \`impact\`: one of "critical", "high", "medium", "low"
  - \`likelihood\`: one of "likely", "possible", "edge-case", "unknown"
  - \`confidence\`: one of "high", "medium", "low"
  - \`action\`: one of "must-fix", "should-fix", "consider", "optional"
- \`title\`: short title (string)
- \`description\`: 2-4 short labeled paragraphs using these exact labels when they fit:
  - \`Observation: ...\`
  - \`Why it matters: ...\`
  - \`Suggested direction: ...\` (optional)
  - \`Needs verification: ...\` (optional; only when uncertainty is real)
  Keep each paragraph to one idea. Do not write one long wall-of-text paragraph.
- \`suggestion\`: optional exact replacement snippet when you can confidently propose code, shaped as:
  - \`body\`: replacement code only, with no markdown fences
  - \`startLine\`: first changed RIGHT-side line to replace
  - \`endLine\`: last changed RIGHT-side line to replace
  Omit \`suggestion\` if you are not confident, if the fix depends on unseen context, or if the replacement is not fully contained in changed lines.

\`\`\`review-findings
[
  {
    "file": "src/main.ts",
    "line": 42,
    "severity": "high",
    "risk": { "impact": "high", "likelihood": "possible", "confidence": "medium", "action": "should-fix" },
    "title": "Potential null dereference",
    "description": "Observation: The variable can still be null when this branch runs.\\n\\nWhy it matters: That turns a recoverable edge case into a runtime exception on a normal user path.\\n\\nSuggested direction: Guard the null case before dereferencing.",
    "suggestion": {
      "body": "if (!value) return\\nconsume(value)",
      "startLine": 42,
      "endLine": 43
    }
  }
]
\`\`\`

## Risk Calibration
Severity is the headline triage label; risk explains why.
- blocker: must-fix before merge; critical or high impact, realistically reachable, and medium/high confidence
- high: should-fix before merge; meaningful impact or likely regression
- medium: non-blocking but worth considering; limited impact, edge-case reachability, or moderate uncertainty
- low: optional cleanup; minimal risk

Risk fields - pick from concrete observations in the diff, do not default to the middle:
- \`impact\`: blast radius if the issue triggers.
  - critical: data loss, auth bypass, prod outage, irreversible user-facing failure
  - high: broken core workflow, leaked secret, severe correctness regression
  - medium: degraded UX or perf in a real path; recoverable correctness bug
  - low: cosmetic, log noise, single-edge-case quirk
- \`likelihood\`: how often the buggy path actually runs.
  - likely: every call to this changed code, or every common input
  - possible: requires a specific but plausible input or environment
  - edge-case: only under unusual config, race, or rare branch
  - unknown: can't tell from the diff alone
- \`confidence\`: how sure you are this finding is real, not a misread.
  - high: you can point at the exact lines and trace the failure
  - medium: pattern is suspicious but at least one premise needs checking
  - low: speculative - prefer dropping the finding over emitting it
- \`action\`:
  - must-fix: ship-blocker; reviewer should reject without this fixed
  - should-fix: meaningful enough to delay merge; reviewer should push back
  - consider: nice signal, reviewer can defer
  - optional: pure preference; rarely worth emitting

If \`confidence\` is "low", first try to raise it by calling the code-intelligence tools above. If the tools cannot confirm, drop the finding instead of submitting it. If \`action\` would be "optional", drop the finding.

## Volume Budget
- Output **at most 6 findings per chunk**, ranked by material risk. If you have more candidates, keep only the most material; do not pad the list.
- Do not produce parallel findings that boil down to the same defect. Pick the clearest version.
- One concrete defect beats three vague observations.

## Final Quality Gate
Before emitting the JSON block, silently remove any finding that fails one of these checks:
- The issue is not introduced or materially worsened by this PR.
- The finding is mostly stylistic preference, micro-optimization, or "nice to have" cleanup without a concrete maintenance or user impact.
- The finding duplicates another issue on the same file and line; keep the clearest version and mention other affected focus areas only if needed.
- The description says the behavior is harmless, negligible, pre-existing, or requires verification but the severity is still high/blocker.
- The line number is outside the diff hunk and can be re-anchored to a changed line that triggers the issue.
- \`risk.confidence\` is "low" or \`risk.action\` is "optional".

## Anti-examples (do NOT emit)
These illustrate the kind of low-signal finding that creates triage burden without surfacing real risk. Do not produce findings shaped like these:
- "Inline arrow function allocates a new closure on every render" (micro-optimization on cold path)
- "Magic number used for layout, consider extracting a constant" (style preference)
- "Function name could be more descriptive" (style, not correctness)
- "Potential issue if input is null, but the caller probably guards it, needs verification" (low confidence, speculation - call \`find_references\` to verify, then drop if still unconfirmed)
- "Pre-existing in both branches but worth flagging" (not introduced by PR)
- "Could add a comment explaining why" (documentation preference, not a defect)

Also do NOT flag any of these categories. They consistently waste reviewer attention without changing the merge decision:
- **Theoretical risks requiring unlikely preconditions.** If the failure path needs a specific configuration, an unusual deployment, or a sequence of events that nothing in the diff makes plausible, drop it.
- **Defense-in-depth on already-defended code.** If the changed code already validates input, checks a bound, or holds a lock, do not propose adding a redundant check "just in case." A real second-line defense requires a concrete first-line bypass.
- **Style or formatting issues that the repo's linter would catch.** Unused imports, naming conventions, indentation, ordering of class members, missing semicolons. Assume Biome / ESLint / Prettier / equivalent already runs in CI.
- **Findings on test files unless they affect test correctness.** A test that asserts the wrong thing, masks a regression, or leaks state is fair game. Test-file style, naming, or "could add another assertion" is not.
- **Findings on generated files, lock files, vendored directories, minified assets, or files containing \`@generated\` markers.** These are produced by tooling and reviewing them as if they were hand-written is noise.
- **Deprecation reminders for APIs that the PR is not introducing or modifying.**
- **"Consider extracting this into a helper" when the duplication is two call sites.** Three or more before suggesting an abstraction.

After your analysis, output ONLY the review-findings block.`
}

export function buildPrReviewContinuationPrompt(input: ContinuationInput): string {
  const { focus, chunk, chunkIndex, totalChunks } = input
  return `Here are additional files to review (chunk ${chunkIndex + 1} of ${totalChunks}). Continue applying your **${focus}** review criteria.

Keep these invariants:
- Report only issues introduced or materially worsened by this PR.
- Stay within your specialist role and avoid duplicate findings from other focus areas.
- Prefer no finding over a speculative finding; call code-intelligence tools (\`find_references\`, \`get_definition\`, \`search_code\`, \`get_call_hierarchy\`, \`trace_data_flow\`) to verify uncertain findings before dropping them.
- Anchor findings to changed RIGHT-side diff lines where possible; do not report harmless, negligible, pre-existing, or "no action needed" concerns.
- Use low/medium severity for "needs verification" findings unless the diff shows a clearly plausible high-impact path.
- Apply the same risk rubric (impact / likelihood / confidence / action) and the same anti-examples from the first chunk. Drop low-confidence and optional-action findings.
- Output **at most 6 findings for this chunk**, ranked by material risk.
- Output only the \`review-findings\` fenced JSON block.

## Files in this chunk
${chunk.files.map((f) => `- ${f}`).join('\n')}

## Diff
\`\`\`diff
${chunk.diff}
\`\`\`

Output findings in the same \`review-findings\` format.`
}

export type McpToolUseTally = {
  attempts: number
  errors: number
  byTool: Record<string, number>
}

const MCP_PREFIX = 'mcp__code-intelligence__'

export function countMcpToolUses(messages: ReadonlyArray<unknown>): McpToolUseTally {
  const tally: McpToolUseTally = { attempts: 0, errors: 0, byTool: {} }
  const mcpToolUseIds = new Set<string>()

  for (const raw of messages) {
    const msg = raw as { type?: string; message?: { content?: unknown } } | null
    if (!msg || typeof msg !== 'object') continue
    const content = msg.message?.content
    if (!Array.isArray(content)) continue

    for (const block of content) {
      const b = block as {
        type?: string
        name?: string
        id?: string
        tool_use_id?: string
        is_error?: boolean
      } | null
      if (!b || typeof b !== 'object') continue

      if (b.type === 'tool_use' && typeof b.name === 'string' && b.name.startsWith(MCP_PREFIX)) {
        const tool = b.name.slice(MCP_PREFIX.length)
        tally.attempts += 1
        tally.byTool[tool] = (tally.byTool[tool] ?? 0) + 1
        if (typeof b.id === 'string') mcpToolUseIds.add(b.id)
      } else if (
        b.type === 'tool_result' &&
        b.is_error === true &&
        typeof b.tool_use_id === 'string' &&
        mcpToolUseIds.has(b.tool_use_id)
      ) {
        tally.errors += 1
      }
    }
  }

  return tally
}
