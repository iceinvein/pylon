import { type BrowserWindow, ipcMain } from 'electron'
import type { CommitGroup, ConflictResolution } from '../shared/git-types'
import { IPC } from '../shared/ipc-channels'
import { log } from '../shared/logger'
import {
  analyzeForCommitPlan,
  generateCommitMessage,
  interpretNlCommand,
  resolveConflicts,
} from './git-ai-bridge'
import {
  executeCommitGroup,
  getWorkingTreeStatus,
  stageFiles,
  unstageFiles,
} from './git-commit-service'
import { checkoutBranch, getGitBranches, getGraphLog } from './git-graph-service'
import { continueOperation, getConflictFiles, writeResolvedFile } from './git-ops-service'

const logger = log.child('git-ipc')

let mainWindow: BrowserWindow | null = null

export function setGitWindow(win: BrowserWindow): void {
  mainWindow = win
}

function notifyGraphUpdated(): void {
  mainWindow?.webContents.send(IPC.GIT_GRAPH_UPDATED)
}

export function registerGitIpcHandlers(): void {
  // ── Git Graph ──
  ipcMain.handle(IPC.GIT_GRAPH_GET_LOG, (_e, args: { cwd: string; afterHash?: string }) =>
    getGraphLog(args.cwd, args.afterHash),
  )

  ipcMain.handle(IPC.GIT_GRAPH_GET_BRANCHES, (_e, args: { cwd: string }) =>
    getGitBranches(args.cwd),
  )

  ipcMain.handle(IPC.GIT_GRAPH_CHECKOUT, async (_e, args: { cwd: string; branch: string }) => {
    const result = await checkoutBranch(args.cwd, args.branch)
    if (result.success) notifyGraphUpdated()
    return result
  })

  // ── Git Commit ──
  ipcMain.handle(IPC.GIT_COMMIT_GET_STATUS, (_e, args: { cwd: string }) =>
    getWorkingTreeStatus(args.cwd),
  )

  ipcMain.handle(IPC.GIT_COMMIT_ANALYZE, (_e, args: { cwd: string; sessionId: string }) =>
    analyzeForCommitPlan(args.cwd, args.sessionId),
  )

  ipcMain.handle(IPC.GIT_COMMIT_GENERATE_MSG, (_e, args: { cwd: string; sessionId: string }) =>
    generateCommitMessage(args.cwd, args.sessionId),
  )

  ipcMain.handle(IPC.GIT_COMMIT_EXECUTE, async (_e, args: { cwd: string; group: CommitGroup }) => {
    const result = await executeCommitGroup(args.cwd, args.group)
    if (result.success) notifyGraphUpdated()
    return result
  })

  ipcMain.handle(IPC.GIT_COMMIT_STAGE, (_e, args: { cwd: string; paths: string[] }) =>
    stageFiles(args.cwd, args.paths),
  )

  ipcMain.handle(IPC.GIT_COMMIT_UNSTAGE, (_e, args: { cwd: string; paths: string[] }) =>
    unstageFiles(args.cwd, args.paths),
  )

  // ── Git Ops ──
  ipcMain.handle(
    IPC.GIT_OPS_EXECUTE_NL,
    (_e, args: { cwd: string; sessionId: string; text: string }) =>
      interpretNlCommand(args.cwd, args.sessionId, args.text),
  )

  ipcMain.handle(IPC.GIT_OPS_CONFIRM, async (_e, args: { cwd: string; planId: string }) => {
    logger.info('Confirming plan:', args.planId)
    return { success: true }
  })

  ipcMain.handle(IPC.GIT_OPS_GET_CONFLICTS, (_e, args: { cwd: string }) =>
    getConflictFiles(args.cwd),
  )

  ipcMain.handle(IPC.GIT_OPS_RESOLVE_CONFLICTS, (_e, args: { cwd: string; sessionId: string }) =>
    resolveConflicts(args.cwd, args.sessionId),
  )

  ipcMain.handle(
    IPC.GIT_OPS_APPLY_RESOLUTION,
    async (_e, args: { cwd: string; resolutions: ConflictResolution[] }) => {
      for (const res of args.resolutions) {
        await writeResolvedFile(args.cwd, res.filePath, res.resolvedContent)
      }
      notifyGraphUpdated()
    },
  )

  ipcMain.handle(IPC.GIT_OPS_CONTINUE, async (_e, args: { cwd: string }) => {
    const result = await continueOperation(args.cwd)
    if (result.success) notifyGraphUpdated()
    return result
  })
}
