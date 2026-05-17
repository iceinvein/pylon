export type GoalSuggestionContext = {
  kind: 'goal-suggestion'
  callbackToken: string
  explorationId: string
}

export function createGoalSuggestionContext(callbackToken: string): GoalSuggestionContext {
  return {
    kind: 'goal-suggestion',
    callbackToken,
    explorationId: `goal-suggestion:${callbackToken}`,
  }
}

export function isReportGoalsToolName(toolName: string): boolean {
  return toolName === 'report_goals' || toolName.endsWith('__report_goals')
}
