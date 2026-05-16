import { ipcMain } from 'electron'
import { IPC } from '../shared/ipc-channels'
import { testManager } from './test-manager'

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
        projectScan?: import('../shared/types').ProjectScan
        agentModel?: string
        agentEffort?: import('../shared/types').EffortLevel
      },
    ) => {
      return testManager.startExploration({ ...args, mode: args.mode as 'manual' | 'requirements' })
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
        projectScan?: import('../shared/types').ProjectScan
        agentModel?: string
        agentEffort?: import('../shared/types').EffortLevel
      },
    ) => {
      return testManager.startBatch({
        ...args,
        mode: args.mode as 'manual' | 'requirements',
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
        agentEffort?: import('../shared/types').EffortLevel
      },
    ) => {
      const suggestGoals = testManager.suggestGoals as (
        cwd: string,
        agentModel?: string,
        agentEffort?: import('../shared/types').EffortLevel,
      ) => Promise<void>
      suggestGoals(args.cwd, args.agentModel, args.agentEffort).catch((err) => {
        console.error('suggestGoals failed:', err)
      })
      return true
    },
  )
}
