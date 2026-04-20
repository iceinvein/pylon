import { describe, expect, test } from 'bun:test'
import type { ReviewFinding } from '../../shared/types'
import { buildReviewBody } from '../gh-cli'

const f = (overrides: Partial<ReviewFinding>): ReviewFinding => ({
  id: overrides.id ?? 'id',
  file: overrides.file ?? 'src/x.ts',
  line: overrides.line ?? 1,
  severity: overrides.severity ?? 'suggestion',
  title: overrides.title ?? 'Title',
  description: overrides.description ?? 'Description',
  domain: overrides.domain ?? null,
  posted: overrides.posted ?? false,
})

describe('buildReviewBody', () => {
  test('no findings renders clean verdict with sha', () => {
    const body = buildReviewBody([], 'abcdef1234567')
    expect(body).toContain('## Pylon Review')
    expect(body).toContain('✅ **No issues found.**')
    expect(body).toContain('Reviewed at `abcdef1`')
    expect(body).not.toContain('Severity breakdown')
    expect(body).not.toContain('Top findings')
    expect(body.endsWith('*Reviewed by Pylon.*')).toBe(true)
  })

  test('no findings with empty sha omits the reviewed-at fragment', () => {
    const body = buildReviewBody([], '')
    expect(body).not.toContain('Reviewed at')
  })

  test('critical findings produce blocking verdict and top-findings section', () => {
    const findings = [
      f({ id: '1', severity: 'critical', title: 'Null deref', file: 'a.ts', line: 10 }),
      f({ id: '2', severity: 'critical', title: 'SQLi', file: 'b.ts', line: 20 }),
      f({ id: '3', severity: 'warning', title: 'Race', file: 'c.ts', line: 30 }),
      f({ id: '4', severity: 'suggestion', title: 'Naming', file: 'd.ts', line: 40 }),
    ]
    const body = buildReviewBody(findings, 'abc1234')
    expect(body).toContain('⚠️ **2 blocking issues** across 4 files.')
    expect(body).toContain('### Top findings')
    expect(body).toContain('🔴 **Null deref** · `a.ts:10`')
    expect(body).toContain('🔴 **SQLi** · `b.ts:20`')
    expect(body).toContain('🟡 **Race** · `c.ts:30`')
    expect(body).toContain('Severity breakdown')
    expect(body).toContain('| 🔴 Critical | 2 |')
    expect(body).toContain('| 🟡 Warning | 1 |')
    expect(body).toContain('| 🔵 Suggestion | 1 |')
    expect(body).not.toContain('| ⚪ Nitpick |')
  })

  test('warning-only produces items-to-review verdict', () => {
    const findings = [f({ severity: 'warning', title: 'W1', file: 'a.ts', line: 1 })]
    const body = buildReviewBody(findings, '')
    expect(body).toContain('⚠️ **1 item to review** across 1 file.')
  })

  test('suggestion-only uses lightweight verdict without top findings', () => {
    const findings = [
      f({ id: '1', severity: 'suggestion', title: 'S1', file: 'a.ts', line: 1 }),
      f({ id: '2', severity: 'nitpick', title: 'N1', file: 'a.ts', line: 2 }),
    ]
    const body = buildReviewBody(findings, '')
    expect(body).toContain('💡 **2 suggestions** across 1 file.')
    expect(body).not.toContain('### Top findings')
  })

  test('general findings render in their own collapsible section', () => {
    const findings = [
      f({ id: '1', severity: 'warning', title: 'Inline', file: 'a.ts', line: 5 }),
      f({ id: '2', severity: 'suggestion', title: 'Convention drift', file: '', line: null }),
    ]
    const body = buildReviewBody(findings, '')
    expect(body).toContain('<summary><b>General notes</b> (1)</summary>')
    expect(body).toContain('**Convention drift.** Description')
  })

  test('footer adapts when there are only general findings', () => {
    const findings = [f({ severity: 'warning', title: 'General', file: '', line: null })]
    const body = buildReviewBody(findings, '')
    expect(body.endsWith('*Reviewed by Pylon.*')).toBe(true)
    expect(body).not.toContain('Resolve or reply on inline threads')
  })

  test('footer mentions inline threads when inline findings exist', () => {
    const findings = [f({ severity: 'warning', title: 'W', file: 'a.ts', line: 1 })]
    const body = buildReviewBody(findings, '')
    expect(body).toContain('Resolve or reply on inline threads to address findings.')
  })

  test('top findings are capped at 3 highest-severity entries', () => {
    const findings = Array.from({ length: 6 }, (_, i) =>
      f({ id: String(i), severity: 'critical', title: `C${i}`, file: 'a.ts', line: i + 1 }),
    )
    const body = buildReviewBody(findings, '')
    const matches = body.match(/🔴 \*\*C\d+\*\*/g) ?? []
    expect(matches.length).toBe(3)
  })

  test('never contains an emdash', () => {
    const findings = [
      f({ severity: 'critical', title: 'Issue', file: 'a.ts', line: 1 }),
      f({ severity: 'warning', title: 'General', file: '', line: null }),
    ]
    const body = buildReviewBody(findings, 'abc1234')
    expect(body).not.toContain('\u2014')
  })
})
