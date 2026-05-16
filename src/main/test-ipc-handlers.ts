import { ipcMain } from 'electron'
import { IPC } from '../shared/ipc-channels'
import { type EffortLevel, isEffortLevel, type ProjectScan } from '../shared/types'
import { testManager } from './test-manager'

function validAgentEffort(effort: unknown): EffortLevel | undefined {
  return isEffortLevel(effort) ? effort : undefined
}

export function registerTestIpcHandlers(): void {
  ipcMain.handle(
    IPC.TEST_START_EXPLORATION,
    async (
      _e,
      args: {
        cwd: string
        url: string
        goal: string
        mode: string
        requirements?: string
        e2eOutputPath: string
        e2ePathReason?: string
        projectScan?: ProjectScan
        agentModel?: string
        agentEffort?: EffortLevel
      },
    ) => {
      return testManager.startExploration({
        ...args,
        mode: args.mode as 'manual' | 'requirements',
        agentEffort: validAgentEffort(args.agentEffort),
      })
    },
  )

  ipcMain.handle(
    IPC.TEST_START_BATCH,
    async (
      _e,
      args: {
        cwd: string
        goals: string[]
        agentCount: number
        mode: string
        requirements?: string
        e2eOutputPath: string
        e2ePathReason?: string
        customUrl?: string
        autoStartServer: boolean
        projectScan?: ProjectScan
        agentModel?: string
        agentEffort?: EffortLevel
      },
    ) => {
      return testManager.startBatch({
        ...args,
        mode: args.mode as 'manual' | 'requirements',
        agentEffort: validAgentEffort(args.agentEffort),
      })
    },
  )

  ipcMain.handle(IPC.TEST_STOP_EXPLORATION, async (_e, args: { explorationId: string }) => {
    testManager.stopExploration(args.explorationId)
    return true
  })

  ipcMain.handle(IPC.TEST_LIST_EXPLORATIONS, async (_e, args: { cwd: string }) => {
    return testManager.listExplorations(args.cwd)
  })

  ipcMain.handle(IPC.TEST_GET_EXPLORATION, async (_e, args: { explorationId: string }) => {
    return testManager.getExploration(args.explorationId)
  })

  ipcMain.handle(IPC.TEST_DELETE_EXPLORATION, async (_e, args: { explorationId: string }) => {
    testManager.deleteExploration(args.explorationId)
    return true
  })

  ipcMain.handle(IPC.TEST_RESOLVE_E2E_PATH, async (_e, args: { cwd: string }) => {
    return testManager.resolveE2ePath(args.cwd)
  })

  ipcMain.handle(
    IPC.TEST_READ_GENERATED_TEST,
    async (_e, args: { cwd: string; relativePath: string }) => {
      return testManager.readGeneratedTest(args.cwd, args.relativePath)
    },
  )

  ipcMain.handle(IPC.TEST_SCAN_PROJECT, async (_e, args: { cwd: string }) => {
    return testManager.scanProject(args.cwd)
  })

  ipcMain.handle(
    IPC.TEST_SUGGEST_GOALS,
    async (
      _e,
      args: {
        cwd: string
        agentModel?: string
        agentEffort?: EffortLevel
      },
    ) => {
      testManager
        .suggestGoals(args.cwd, args.agentModel, validAgentEffort(args.agentEffort))
        .catch((err) => {
          console.error('suggestGoals failed:', err)
        })
      return true
    },
  )
}
