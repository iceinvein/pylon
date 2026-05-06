import { describe, expect, test } from 'bun:test'
import type { ReviewFinding } from '../../shared/types'
import {
  applyPeerReviewChanges,
  buildPeerReviewDiffExcerpt,
  buildPeerReviewPrompt,
  parsePeerReviewChanges,
} from '../pr-review-peer-review'

function finding(overrides: Partial<ReviewFinding> & { id: string }): ReviewFinding {
  return {
    id: overrides.id,
    file: overrides.file ?? 'src/app.ts',
    line: overrides.line === undefined ? 12 : overrides.line,
    severity: overrides.severity ?? 'medium',
    risk: overrides.risk ?? {
      impact: 'medium',
      likelihood: 'possible',
      confidence: 'medium',
      action: 'consider',
    },
    title: overrides.title ?? 'Stale state can be used',
    description: overrides.description ?? 'Observation: State may be stale.',
    domain: overrides.domain ?? 'bugs',
    posted: false,
    postUrl: null,
    threadId: null,
    statusInRun: 'new',
    carriedForward: false,
    sourceReviewId: null,
    suggestion: overrides.suggestion,
    mergedFrom: overrides.mergedFrom,
  }
}

const diff = `diff --git a/src/app.ts b/src/app.ts
index 111..222 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -9,6 +9,7 @@ export function run() {
 const current = getState()
+save(current)
 return current
 }
diff --git a/src/other.ts b/src/other.ts
index 111..222 100644
--- a/src/other.ts
+++ b/src/other.ts
@@ -30,6 +30,7 @@ export function other() {
 const x = 1
+return x
 }`

describe('buildPeerReviewDiffExcerpt', () => {
  test('includes only hunks that match existing finding anchors', () => {
    const excerpt = buildPeerReviewDiffExcerpt(diff, [finding({ id: 'f1', line: 10 })])
    expect(excerpt).toContain('src/app.ts:9-12')
    expect(excerpt).toContain('save(current)')
    expect(excerpt).not.toContain('src/other.ts')
  })

  test('returns an empty marker when there is no review to audit', () => {
    expect(buildPeerReviewDiffExcerpt(diff, [])).toBe('(no matching diff hunks)')
  })
})

describe('buildPeerReviewPrompt', () => {
  test('forbids broad PR review and cosmetic rewrites', () => {
    const { systemPrompt, userPrompt } = buildPeerReviewPrompt({
      primaryProvider: 'claude',
      peerProvider: 'codex',
      detail: {
        title: 'PR',
        author: 'dev',
        headBranch: 'feature',
        baseBranch: 'main',
        body: '',
        files: [{ path: 'src/app.ts', additions: 1, deletions: 0 }],
        diff,
      },
      findings: [finding({ id: 'f1' })],
    })

    expect(systemPrompt).toContain('Do not run a broad PR review')
    expect(systemPrompt).toContain('Do not rewrite for tone')
    expect(systemPrompt).toContain('If nothing needs changing, return an empty array')
    expect(userPrompt).toContain('Do not include unchanged findings')
    expect(userPrompt).toContain('review-peer-review')
  })
})

describe('parsePeerReviewChanges', () => {
  test('parses explicit updates and ignores unknown finding ids', () => {
    const changes = parsePeerReviewChanges(
      '```review-peer-review\n' +
        JSON.stringify([
          {
            type: 'update',
            id: 'f1',
            reason: 'risk was overstated',
            fields: {
              severity: 'low',
              risk: {
                impact: 'low',
                likelihood: 'edge-case',
                confidence: 'high',
                action: 'optional',
              },
            },
          },
          {
            type: 'update',
            id: 'missing',
            reason: 'unknown',
            fields: { title: 'Ignore me' },
          },
        ]) +
        '\n```',
      new Set(['f1']),
    )

    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({
      type: 'update',
      id: 'f1',
      reason: 'risk was overstated',
      fields: {
        severity: 'low',
        risk: {
          impact: 'low',
          likelihood: 'edge-case',
          confidence: 'high',
          action: 'optional',
        },
      },
    })
  })

  test('parses additions only when required finding fields are present', () => {
    const changes = parsePeerReviewChanges(
      '```review-peer-review\n' +
        JSON.stringify([
          {
            type: 'add',
            reason: 'adjacent issue visible while checking the finding',
            finding: {
              file: 'src/app.ts',
              line: 10,
              severity: 'high',
              risk: {
                impact: 'high',
                likelihood: 'possible',
                confidence: 'high',
                action: 'should-fix',
              },
              domain: 'bugs',
              title: 'Missing await',
              description: 'Observation: The promise is not awaited.',
            },
          },
          { type: 'add', reason: 'bad', finding: { file: 'src/app.ts' } },
        ]) +
        '\n```',
      new Set(['f1']),
    )

    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({
      type: 'add',
      reason: 'adjacent issue visible while checking the finding',
      finding: { file: 'src/app.ts', line: 10, domain: 'bugs', title: 'Missing await' },
    })
  })
})

describe('applyPeerReviewChanges', () => {
  test('applies updates without rewriting unchanged findings', () => {
    const base = finding({ id: 'f1', severity: 'medium' })
    const result = applyPeerReviewChanges(
      [base],
      [
        {
          type: 'update',
          id: 'f1',
          reason: 'anchor should point to the write',
          fields: { line: 10, title: 'Write uses stale state' },
        },
      ],
    )

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('f1')
    expect(result[0].line).toBe(10)
    expect(result[0].title).toBe('Write uses stale state')
    expect(result[0].description).toBe(base.description)
    expect(result[0].mergedFrom).toEqual([
      { domain: 'peer-review', title: 'anchor should point to the write' },
    ])
  })

  test('adds new findings with peer-review provenance', () => {
    const result = applyPeerReviewChanges(
      [finding({ id: 'f1' })],
      [
        {
          type: 'add',
          reason: 'adjacent missed issue',
          finding: {
            file: 'src/app.ts',
            line: 11,
            severity: 'high',
            risk: {
              impact: 'high',
              likelihood: 'possible',
              confidence: 'high',
              action: 'should-fix',
            },
            domain: 'bugs',
            title: 'Missing await',
            description: 'Observation: The promise is not awaited.',
          },
        },
      ],
    )

    expect(result).toHaveLength(2)
    expect(result[1]).toMatchObject({
      file: 'src/app.ts',
      line: 11,
      severity: 'high',
      title: 'Missing await',
      domain: 'bugs',
      mergedFrom: [{ domain: 'peer-review', title: 'adjacent missed issue' }],
      statusInRun: 'new',
    })
  })
})
