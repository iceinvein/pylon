import { describe, expect, test } from 'bun:test'
import { createGoalSuggestionContext, isReportGoalsToolName } from '../test-goal-session'

describe('test goal session helpers', () => {
  test('creates explicit goal suggestion exploration context', () => {
    const ctx = createGoalSuggestionContext('token-1')
    expect(ctx.explorationId).toBe('goal-suggestion:token-1')
    expect(ctx.kind).toBe('goal-suggestion')
    expect(ctx.callbackToken).toBe('token-1')
  })

  test('matches direct and namespaced report_goals tools only', () => {
    expect(isReportGoalsToolName('report_goals')).toBe(true)
    expect(isReportGoalsToolName('pylon-testing__report_goals')).toBe(true)
    expect(isReportGoalsToolName('report_finding')).toBe(false)
  })
})
