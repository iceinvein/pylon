import { readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { BrowserWindow, dialog, ipcMain } from 'electron'
import { IPC } from '../shared/ipc-channels'
import { log } from '../shared/logger'
import type {
  AppSettings,
  InstalledPlugin,
  IpcAttachment,
  PermissionMode,
  PermissionResponse,
  PluginManagementData,
  PluginMarketplace,
  QuestionResponse,
} from '../shared/types'
import { getDb } from './db'
import { sessionManager } from './session-manager'
import { worktreeRecipeService } from './worktree-recipe-service'

const logger = log.child('ipc')

const DEFAULT_SETTINGS: AppSettings = {
  defaultModel: 'claude-opus-4-6',
  defaultPermissionMode: 'default',
  theme: 'dark',
}

function getSettings(): AppSettings {
  const db = getDb()
  const rows = db.prepare('SELECT key, value FROM settings').all() as {
    key: string
    value: string
  }[]
  const stored: Record<string, string> = {}
  for (const row of rows) {
    stored[row.key] = row.value
  }
  return {
    defaultModel: stored.defaultModel ?? DEFAULT_SETTINGS.defaultModel,
    defaultPermissionMode:
      (stored.defaultPermissionMode as PermissionMode) ?? DEFAULT_SETTINGS.defaultPermissionMode,
    theme: 'dark',
  }
}

function updateSetting(key: string, value: unknown): void {
  const db = getDb()
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, String(value))
}

// ── Plugin Management ──

const CLAUDE_DIR = path.join(homedir(), '.claude')
const PLUGINS_DIR = path.join(CLAUDE_DIR, 'plugins')
const CLAUDE_SETTINGS_PATH = path.join(CLAUDE_DIR, 'settings.json')

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const content = await readFile(filePath, 'utf-8')
    return JSON.parse(content) as T
  } catch {
    return null
  }
}

type InstalledPluginsFile = {
  version: number
  plugins: Record<
    string,
    Array<{
      scope: 'user' | 'project'
      projectPath?: string
      installPath: string
      version: string
      installedAt: string
      lastUpdated: string
      gitCommitSha?: string
    }>
  >
}

type KnownMarketplacesFile = Record<
  string,
  {
    source: { source: string; repo?: string; url?: string }
    installLocation: string
    lastUpdated: string
  }
>

type ClaudeSettingsFile = {
  enabledPlugins?: Record<string, boolean | string[] | Record<string, unknown>>
  [key: string]: unknown
}

async function loadPluginData(): Promise<PluginManagementData> {
  const [installedData, marketplacesData, settingsData] = await Promise.all([
    readJsonFile<InstalledPluginsFile>(path.join(PLUGINS_DIR, 'installed_plugins.json')),
    readJsonFile<KnownMarketplacesFile>(path.join(PLUGINS_DIR, 'known_marketplaces.json')),
    readJsonFile<ClaudeSettingsFile>(CLAUDE_SETTINGS_PATH),
  ])

  const enabledPlugins = settingsData?.enabledPlugins ?? {}

  const plugins: InstalledPlugin[] = []
  if (installedData?.plugins) {
    for (const [pluginId, installs] of Object.entries(installedData.plugins)) {
      const [name, marketplace] = pluginId.split('@')
      for (const install of installs) {
        plugins.push({
          id: pluginId,
          name,
          marketplace,
          enabled: enabledPlugins[pluginId] === true,
          scope: install.scope,
          projectPath: install.projectPath,
          version: install.version,
          installedAt: install.installedAt,
          lastUpdated: install.lastUpdated,
        })
      }
    }
  }

  const marketplaces: PluginMarketplace[] = []
  if (marketplacesData) {
    for (const [id, mp] of Object.entries(marketplacesData)) {
      marketplaces.push({
        id,
        source: mp.source,
        lastUpdated: mp.lastUpdated,
      })
    }
  }

  return { plugins, marketplaces }
}

async function togglePlugin(pluginId: string, enabled: boolean): Promise<boolean> {
  try {
    const settings = (await readJsonFile<ClaudeSettingsFile>(CLAUDE_SETTINGS_PATH)) ?? {}
    if (!settings.enabledPlugins) {
      settings.enabledPlugins = {}
    }
    settings.enabledPlugins[pluginId] = enabled
    await writeFile(CLAUDE_SETTINGS_PATH, JSON.stringify(settings, null, 4), 'utf-8')
    return true
  } catch (err) {
    logger.error('Failed to toggle plugin:', err)
    return false
  }
}

export function registerIpcHandlers(): void {
  ipcMain.handle(
    IPC.SESSION_CREATE,
    async (_e, args: { cwd: string; model?: string; useWorktree?: boolean }) => {
      return sessionManager.createSession(args.cwd, args.model, args.useWorktree)
    },
  )

  ipcMain.handle(
    IPC.SESSION_SEND,
    async (
      _e,
      args: {
        sessionId: string
        text: string
        attachments?: IpcAttachment[]
      },
    ) => {
      sessionManager
        .sendMessage(args.sessionId, args.text, args.attachments)
        .catch((err) => logger.error('SESSION_SEND failed:', err))
      return true
    },
  )

  ipcMain.handle(IPC.SESSION_STOP, async (_e, args: { sessionId: string }) => {
    await sessionManager.stopSession(args.sessionId)
    return true
  })

  ipcMain.handle(IPC.SESSION_RESUME, async (_e, args: { sessionId: string }) => {
    const success = sessionManager.resumeSession(args.sessionId)
    if (success) {
      const db = getDb()
      const row = db
        .prepare('SELECT title, status FROM sessions WHERE id = ?')
        .get(args.sessionId) as { title: string; status: string } | undefined
      return { success: true, title: row?.title ?? '', status: row?.status ?? 'done' }
    }
    return { success: false, title: '', status: 'done' }
  })

  ipcMain.handle(IPC.SESSION_LIST, async () => {
    return sessionManager.getStoredSessions()
  })

  ipcMain.handle(IPC.SESSION_MESSAGES, async (_e, args: { sessionId: string }) => {
    return sessionManager.getSessionMessages(args.sessionId)
  })

  ipcMain.handle(IPC.SESSION_DELETE, async (_e, args: { sessionId: string }) => {
    await sessionManager.deleteSession(args.sessionId)
    return true
  })

  ipcMain.handle(IPC.FOLDER_OPEN, async () => {
    const window = BrowserWindow.getFocusedWindow()
    if (!window) return null
    const result = await dialog.showOpenDialog(window, {
      properties: ['openDirectory'],
      title: 'Select Project Folder',
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle(IPC.FOLDER_CHECK_GIT_STATUS, async (_e, args: { path: string }) => {
    return sessionManager.checkRepoStatus(args.path)
  })

  ipcMain.handle(IPC.FOLDER_LIST_PROJECTS, async () => {
    return sessionManager.getProjectFolders()
  })

  ipcMain.handle(IPC.FOLDER_ADD_PROJECT, async (_e, args: { path: string }) => {
    sessionManager.addProject(args.path)
    return true
  })

  ipcMain.handle(IPC.FOLDER_REMOVE_PROJECT, async (_e, args: { path: string }) => {
    sessionManager.removeProject(args.path)
    return true
  })

  ipcMain.handle(IPC.FILE_READ_BASE64, async (_e, args: { path: string }) => {
    const buffer = await readFile(args.path)
    return buffer.toString('base64')
  })

  ipcMain.handle(IPC.FILE_READ_PLAN, async (_e, args: { path: string }) => {
    // Security: resolve to canonical path to prevent traversal attacks
    const resolved = path.resolve(args.path)
    const p = resolved.toLowerCase()
    const isInPlansDir = p.includes('/plans/') || p.includes('/specs/')
    const hasPlanSuffix = p.endsWith('-plan.md') || p.endsWith('-design.md')
    if (!(isInPlansDir || hasPlanSuffix) || !p.endsWith('.md')) {
      throw new Error('Not a plan file path')
    }
    const buffer = await readFile(resolved)
    return buffer.toString('utf-8')
  })

  ipcMain.handle(IPC.PERMISSION_RESPONSE, async (_e, response: PermissionResponse) => {
    sessionManager.resolvePermission(response)
    return true
  })

  ipcMain.handle(IPC.QUESTION_RESPONSE, async (_e, response: QuestionResponse) => {
    sessionManager.resolveQuestion(response)
    return true
  })

  ipcMain.handle(IPC.SESSION_SET_MODEL, async (_e, args: { sessionId: string; model: string }) => {
    sessionManager.setModel(args.sessionId, args.model)
    return true
  })

  ipcMain.handle(
    IPC.SESSION_SET_EFFORT,
    async (_e, args: { sessionId: string; effort: string }) => {
      sessionManager.setEffort(args.sessionId, args.effort as import('../shared/types').EffortLevel)
      return true
    },
  )

  ipcMain.handle(
    IPC.SESSION_SET_MODE,
    async (_e, args: { sessionId: string; mode: string }) => {
      sessionManager.setMode(
        args.sessionId,
        args.mode as import('../shared/types').SessionMode,
      )
      return true
    },
  )

  ipcMain.handle(
    IPC.SESSION_PLAN_APPROVAL_RESPONSE,
    async (_e, args: { requestId: string; approved: boolean }) => {
      sessionManager.resolvePlanApproval(args)
      return true
    },
  )

  ipcMain.handle(
    IPC.SESSION_SET_PERMISSION_MODE,
    async (_e, args: { sessionId: string; mode: PermissionMode }) => {
      sessionManager.setPermissionMode(args.sessionId, args.mode)
      return true
    },
  )

  ipcMain.handle(IPC.SESSION_GET_INFO, async (_e, args: { sessionId: string }) => {
    return sessionManager.getSessionInfo(args.sessionId)
  })

  ipcMain.handle(
    IPC.SESSION_FILE_DIFFS,
    async (_e, args: { sessionId: string; filePaths: string[] }) => {
      return sessionManager.getFileDiffs(args.sessionId, args.filePaths)
    },
  )

  ipcMain.handle(
    IPC.SESSION_FILE_STATUSES,
    async (_e, args: { sessionId: string; filePaths: string[] }) => {
      return sessionManager.getFileStatuses(args.sessionId, args.filePaths)
    },
  )

  ipcMain.handle(IPC.PROVIDER_MODELS, async () => {
    const { getAllModels } = await import('./providers')
    return getAllModels()
  })

  ipcMain.handle(IPC.SETTINGS_GET, async () => {
    return getSettings()
  })

  ipcMain.handle(IPC.SETTINGS_UPDATE, async (_e, args: { key: string; value: unknown }) => {
    updateSetting(args.key, args.value)
    return true
  })

  ipcMain.handle(IPC.TABS_GET, async () => {
    const db = getDb()
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('open_tabs') as
      | { value: string }
      | undefined
    if (!row) return null
    try {
      return JSON.parse(row.value)
    } catch {
      return null
    }
  })

  // ── Plugins ──

  ipcMain.handle(IPC.PLUGINS_LIST, async () => {
    return loadPluginData()
  })

  ipcMain.handle(IPC.PLUGINS_TOGGLE, async (_e, args: { pluginId: string; enabled: boolean }) => {
    return togglePlugin(args.pluginId, args.enabled)
  })

  ipcMain.handle(IPC.WORKTREE_MERGE_CLEANUP, async (_e, args: { sessionId: string }) => {
    return sessionManager.mergeAndCleanupWorktree(args.sessionId)
  })

  ipcMain.handle(IPC.WORKTREE_DISCARD_CLEANUP, async (_e, args: { sessionId: string }) => {
    await sessionManager.removeWorktree(args.sessionId)
    return true
  })

  ipcMain.handle(IPC.WORKTREE_INFO, async (_e, args: { sessionId: string }) => {
    return sessionManager.getWorktreeInfo(args.sessionId)
  })

  ipcMain.handle(IPC.WORKTREE_GET_USAGE, async () => {
    const { getWorktreeUsage } = await import('./worktree-cleanup')
    return getWorktreeUsage()
  })

  ipcMain.handle(IPC.WORKTREE_CLEANUP_ALL, async () => {
    const { cleanupAllWorktrees } = await import('./worktree-cleanup')
    return cleanupAllWorktrees()
  })

  // ── Worktree Recipe ──

  ipcMain.handle(IPC.WORKTREE_RECIPE_GET, async (_e, args: { projectPath: string }) => {
    return worktreeRecipeService.getRecipe(args.projectPath)
  })

  ipcMain.handle(
    IPC.WORKTREE_RECIPE_ANALYZE,
    async (_e, args: { projectPath: string; model?: string }) => {
      return worktreeRecipeService.analyzeProject(args.projectPath, args.model)
    },
  )

  ipcMain.handle(IPC.WORKTREE_RECIPE_DELETE, async (_e, args: { projectPath: string }) => {
    worktreeRecipeService.deleteRecipe(args.projectPath)
    return true
  })

  ipcMain.handle(
    IPC.WORKTREE_SETUP_RUN,
    async (
      _e,
      args: {
        sessionId: string
        projectPath: string
        worktreePath: string
        originalPath: string
        stepIds?: string[]
      },
    ) => {
      const recipe = worktreeRecipeService.getRecipe(args.projectPath)
      if (!recipe) throw new Error('No recipe found for project')
      return worktreeRecipeService.executeRecipe(
        args.sessionId,
        recipe,
        args.worktreePath,
        args.originalPath,
        args.stepIds,
      )
    },
  )

  // ── Git Branch Status ──

  ipcMain.handle(IPC.GIT_BRANCH_STATUS, async (_e, args: { cwd: string }) => {
    const { getBranchStatus } = await import('./git-status')
    return getBranchStatus(args.cwd)
  })

  ipcMain.handle(IPC.GIT_FETCH_COMPARE, async (_e, args: { cwd: string }) => {
    const { fetchAndCompare } = await import('./git-status')
    return fetchAndCompare(args.cwd)
  })

  ipcMain.handle(IPC.GIT_PULL, async (_e, args: { cwd: string }) => {
    const { pullBranch } = await import('./git-status')
    return pullBranch(args.cwd)
  })

  ipcMain.handle(IPC.GIT_WATCH, async (_e, args: { cwd: string }) => {
    const { setActiveCwd } = await import('./git-watcher')
    setActiveCwd(args.cwd)
    return true
  })

  ipcMain.handle(IPC.USAGE_STATS, async (_e, args: { period: string }) => {
    const db = getDb()
    const now = Date.now()
    const periodMs: Record<string, number> = {
      '7d': 7 * 86_400_000,
      '30d': 30 * 86_400_000,
      '90d': 90 * 86_400_000,
    }
    const cutoff = args.period === 'all' ? 0 : now - (periodMs[args.period] ?? periodMs['30d'])

    const summary = db
      .prepare(`
      SELECT
        COALESCE(SUM(total_cost_usd), 0) as totalCost,
        COUNT(*) as sessionCount,
        COALESCE(AVG(total_cost_usd), 0) as avgCostPerSession,
        COALESCE(SUM(input_tokens), 0) as totalInput,
        COALESCE(SUM(output_tokens), 0) as totalOutput
      FROM sessions WHERE created_at >= ?
    `)
      .get(cutoff) as {
      totalCost: number
      sessionCount: number
      avgCostPerSession: number
      totalInput: number
      totalOutput: number
    }

    const dailyCosts = db
      .prepare(`
      SELECT
        date(created_at / 1000, 'unixepoch') as day,
        SUM(total_cost_usd) as cost
      FROM sessions WHERE created_at >= ?
      GROUP BY day ORDER BY day
    `)
      .all(cutoff) as Array<{ day: string; cost: number }>

    const costByModel = db
      .prepare(`
      SELECT
        model,
        SUM(total_cost_usd) as cost,
        COUNT(*) as sessions
      FROM sessions WHERE created_at >= ?
      GROUP BY model ORDER BY cost DESC
    `)
      .all(cutoff) as Array<{ model: string; cost: number; sessions: number }>

    const costByProject = db
      .prepare(`
      SELECT
        COALESCE(original_cwd, cwd) as project,
        SUM(total_cost_usd) as cost,
        COUNT(*) as sessions,
        SUM(input_tokens) as inputTokens,
        SUM(output_tokens) as outputTokens
      FROM sessions WHERE created_at >= ?
      GROUP BY project ORDER BY cost DESC
    `)
      .all(cutoff) as Array<{
      project: string
      cost: number
      sessions: number
      inputTokens: number
      outputTokens: number
    }>

    const tokensByDay = db
      .prepare(`
      SELECT
        date(created_at / 1000, 'unixepoch') as day,
        SUM(input_tokens) as input,
        SUM(output_tokens) as output
      FROM sessions WHERE created_at >= ?
      GROUP BY day ORDER BY day
    `)
      .all(cutoff) as Array<{ day: string; input: number; output: number }>

    const topSessions = db
      .prepare(`
      SELECT
        id, title, model, total_cost_usd as cost,
        input_tokens as inputTokens, output_tokens as outputTokens,
        created_at as createdAt
      FROM sessions WHERE created_at >= ? AND total_cost_usd > 0
      ORDER BY total_cost_usd DESC LIMIT 10
    `)
      .all(cutoff) as Array<{
      id: string
      title: string
      model: string
      cost: number
      inputTokens: number
      outputTokens: number
      createdAt: number
    }>

    return { summary, dailyCosts, costByModel, costByProject, tokensByDay, topSessions }
  })
}
