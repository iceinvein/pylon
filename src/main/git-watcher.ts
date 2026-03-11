import { type FSWatcher, watch } from 'node:fs'
import path from 'node:path'
import { BrowserWindow } from 'electron'
import { IPC } from '../shared/ipc-channels'
import { log } from '../shared/logger'
import type { GitBranchStatus } from '../shared/types'

const logger = log.child('git-watcher')

const POLL_INTERVAL_MS = 30_000

type WatcherState = {
  cwd: string
  fsWatcher: FSWatcher | null
  pollTimer: ReturnType<typeof setInterval> | null
  lastStatus: GitBranchStatus | null
}

const watchers = new Map<string, WatcherState>()

function getWindow(): BrowserWindow | null {
  const windows = BrowserWindow.getAllWindows()
  return windows[0] ?? null
}

function pushStatus(cwd: string, status: GitBranchStatus): void {
  const win = getWindow()
  if (win && !win.isDestroyed()) {
    win.webContents.send(IPC.GIT_STATUS_CHANGED, { cwd, status })
  }
}

async function checkAndPush(cwd: string, state: WatcherState): Promise<void> {
  try {
    const { getBranchStatus } = await import('./git-status')
    const status = await getBranchStatus(cwd)

    const prev = state.lastStatus
    const changed =
      !prev ||
      prev.branch !== status.branch ||
      prev.ahead !== status.ahead ||
      prev.behind !== status.behind ||
      prev.hasUpstream !== status.hasUpstream

    if (changed) {
      state.lastStatus = status
      pushStatus(cwd, status)
    }
  } catch (err) {
    logger.warn(`Failed to check git status for ${cwd}:`, err)
  }
}

function startFsWatch(cwd: string, state: WatcherState): void {
  const gitHeadPath = path.join(cwd, '.git', 'HEAD')
  try {
    state.fsWatcher = watch(gitHeadPath, { persistent: false }, () => {
      // .git/HEAD changed — branch switch or commit on detached HEAD
      checkAndPush(cwd, state)
    })
    state.fsWatcher.on('error', () => {
      // .git/HEAD doesn't exist or became inaccessible — not a git repo
      state.fsWatcher?.close()
      state.fsWatcher = null
    })
  } catch {
    // Not a git repo or no .git/HEAD — skip fs watching, polling will still work
  }
}

export function watchCwd(cwd: string): void {
  // Already watching this cwd
  if (watchers.has(cwd)) return

  const state: WatcherState = {
    cwd,
    fsWatcher: null,
    pollTimer: null,
    lastStatus: null,
  }

  watchers.set(cwd, state)

  // Initial check
  checkAndPush(cwd, state)

  // Watch .git/HEAD for branch switches
  startFsWatch(cwd, state)

  // Poll for ahead/behind (requires network — can't be file-watched)
  state.pollTimer = setInterval(() => checkAndPush(cwd, state), POLL_INTERVAL_MS)

  logger.info(`Started watching ${cwd}`)
}

export function unwatchCwd(cwd: string): void {
  const state = watchers.get(cwd)
  if (!state) return

  state.fsWatcher?.close()
  if (state.pollTimer) clearInterval(state.pollTimer)
  watchers.delete(cwd)

  logger.info(`Stopped watching ${cwd}`)
}

export function unwatchAll(): void {
  for (const cwd of [...watchers.keys()]) {
    unwatchCwd(cwd)
  }
}

/** Called when active tab changes — ensures we're watching the right cwd */
export function setActiveCwd(cwd: string): void {
  // Start watching if not already
  if (cwd) {
    watchCwd(cwd)
  }
}
