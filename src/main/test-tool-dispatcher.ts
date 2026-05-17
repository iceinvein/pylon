import type { BrowserWindow } from 'electron'
import {
  createReportFindingTool,
  createReportGoalsTool,
  createSavePlaywrightTestTool,
} from './test-tools'

export type RegisteredTestingExploration = {
  callbackToken: string
  explorationId: string
  cwd: string
  e2eOutputPath: string
  window: BrowserWindow | null
  onToolExecute?: (toolName: string, args: Record<string, unknown>) => void
}

export function createTestingToolMap(exploration: RegisteredTestingExploration) {
  const tools = [
    createReportFindingTool({
      explorationId: exploration.explorationId,
      cwd: exploration.cwd,
      e2eOutputPath: exploration.e2eOutputPath,
      window: exploration.window,
    }),
    createSavePlaywrightTestTool({
      explorationId: exploration.explorationId,
      cwd: exploration.cwd,
      e2eOutputPath: exploration.e2eOutputPath,
      window: exploration.window,
    }),
    createReportGoalsTool({
      cwd: exploration.cwd,
      window: exploration.window,
    }),
  ]

  return new Map(tools.map((tool) => [tool.name, tool]))
}
