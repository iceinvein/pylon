import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { BrowserWindow } from 'electron'
import { IPC } from '../shared/ipc-channels'
import { log } from '../shared/logger'
import type {
  Attachment,
  EffortLevel,
  PermissionMode,
  PermissionResponse,
  QuestionResponse,
  SessionMode,
} from '../shared/types'
import { getDb } from './db'
import { diffService } from './diff-service'
import { gitWorktreeService } from './git-worktree-service'
import { prRaiseService } from './pr-raise-service'
import {
  type AgentSession,
  getProvider,
  getProviderForModel,
  type NormalizedEvent,
  type ProviderId,
} from './providers'
import type { McpServerStdioConfig } from './providers/types'
import { worktreeRecipeService } from './worktree-recipe-service'

const logger = log.child('session-manager')

/**
 * Derive a short title from the user's first message.
 * Cleans up whitespace, strips common prefixes, and caps at ~60 chars on a word boundary.
 */
function deriveTitle(message: string): string {
  // Collapse whitespace and newlines
  let title = message.replace(/\s+/g, ' ').trim()

  // Strip common conversational prefixes
  title = title
    .replace(
      /^(hey,?\s*|hi,?\s*|hello,?\s*|please\s+|can you\s+|could you\s+|i need to\s+|i want to\s+|help me\s+|let's\s+|lets\s+)/i,
      '',
    )
    .trim()

  // Capitalize first letter
  title = title.charAt(0).toUpperCase() + title.slice(1)

  // Truncate to ~60 chars on a word boundary
  if (title.length > 60) {
    title = title
      .slice(0, 60)
      .replace(/\s+\S*$/, '')
      .trim()
  }

  // Strip trailing punctuation
  title = title.replace(/[.,;:!?]+$/, '').trim()

  return title
}

type ActiveSession = {
  id: string
  provider: ProviderId
  sdkSessionId: string | null
  cwd: string
  gitBaselineHash: string | null
  model: string
  permissionMode: PermissionMode
  effort: EffortLevel
  agentSession: AgentSession | null
  abortController: AbortController
  pendingPermissions: Map<
    string,
    {
      resolve: (result: { behavior: 'allow' | 'deny'; message?: string }) => void
    }
  >
  pendingQuestions: Map<
    string,
    {
      resolve: (answers: Record<string, string>) => void
    }
  >
  /** Latest context input tokens from the most recent message_start event.
   *  Includes uncached + cache_read + cache_creation tokens. */
  lastContextInputTokens: number
  mode: SessionMode
  prePlanPermissionMode: PermissionMode | null
  pendingPlanApprovals: Map<
    string,
    {
      resolve: (result: { approved: boolean }) => void
    }
  >
  mcpServers: Record<string, McpServerStdioConfig> | null
}

type IpcAttachment =
  | { type: 'image'; content: string; mediaType: string; name?: string }
  | { type: 'file'; content: string; name?: string }

function normalizeProviderAttachments(attachments?: IpcAttachment[]): Attachment[] | undefined {
  if (!attachments?.length) return undefined

  return attachments.flatMap((att): Attachment[] => {
    if (att.type === 'image') {
      if (!att.content || !att.mediaType) return []
      return [
        {
          type: 'image',
          name: att.name || 'image',
          mediaType: att.mediaType,
          base64: att.content,
          previewUrl: '',
        },
      ]
    }

    if (!att.content) return []
    return [
      {
        type: 'file',
        name: att.name || 'attachment',
        path: '',
        size: 0,
        content: att.content,
      },
    ]
  })
}

export class SessionManager {
  private sessions = new Map<string, ActiveSession>()
  private window: BrowserWindow | null = null
  private messageListeners = new Map<string, Set<(message: unknown) => void>>()
  /** Cached context window sizes per model, learned from SDK result messages.
   *  Pre-loaded from SQLite on construction, written-through on SDK updates. */
  private modelContextWindows = new Map<string, number>()
  /** Cached max output token limits per model, same lifecycle as context windows. */
  private modelMaxOutputTokens = new Map<string, number>()

  constructor() {
    this.loadPersistedModelLimits()
  }

  /** Load previously-persisted context window and max output token sizes from the settings table. */
  private loadPersistedModelLimits(): void {
    try {
      const db = getDb()
      const rows = db
        .prepare(
          "SELECT key, value FROM settings WHERE key LIKE 'context_window:%' OR key LIKE 'max_output_tokens:%'",
        )
        .all() as { key: string; value: string }[]
      for (const row of rows) {
        if (row.key.startsWith('context_window:')) {
          const model = row.key.slice('context_window:'.length)
          const size = Number(row.value)
          if (model && size > 0) this.modelContextWindows.set(model, size)
        } else if (row.key.startsWith('max_output_tokens:')) {
          const model = row.key.slice('max_output_tokens:'.length)
          const size = Number(row.value)
          if (model && size > 0) this.modelMaxOutputTokens.set(model, size)
        }
      }
      if (rows.length > 0) {
        logger.info(`Loaded ${rows.length} persisted model limit(s)`)
      }
    } catch {
      // DB may not be ready yet during early init — that's fine,
      // values will be populated from SDK results on first query.
    }
  }

  /** Persist a context window size to the settings table. */
  private persistContextWindow(model: string, size: number): void {
    try {
      const db = getDb()
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
        `context_window:${model}`,
        String(size),
      )
    } catch {
      // Non-critical — in-memory cache is still valid
    }
  }

  /** Persist a max output tokens value to the settings table. */
  private persistMaxOutputTokens(model: string, size: number): void {
    try {
      const db = getDb()
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
        `max_output_tokens:${model}`,
        String(size),
      )
    } catch {
      // Non-critical — in-memory cache is still valid
    }
  }

  setWindow(window: BrowserWindow): void {
    this.window = window
    worktreeRecipeService.setWindow(window)
  }

  /** Subscribe to raw SDK messages for a specific session. Returns unsubscribe fn. */
  onMessage(sessionId: string, listener: (message: unknown) => void): () => void {
    let set = this.messageListeners.get(sessionId)
    if (!set) {
      set = new Set()
      this.messageListeners.set(sessionId, set)
    }
    set.add(listener)
    return () => {
      set?.delete(listener)
      if (set?.size === 0) this.messageListeners.delete(sessionId)
    }
  }

  private notifyMessageListeners(sessionId: string, message: unknown): void {
    const set = this.messageListeners.get(sessionId)
    if (set) {
      for (const listener of set) {
        try {
          listener(message)
        } catch {
          /* ignore */
        }
      }
    }
  }

  async createSession(
    cwd: string,
    model?: string,
    useWorktree?: boolean,
    source: string = 'user',
    options?: { mcpServers?: Record<string, McpServerStdioConfig> },
  ): Promise<string> {
    const id = randomUUID()
    const now = Date.now()
    const sessionModel = model || 'claude-opus-4-7'
    const provider = getProviderForModel(sessionModel)
    const providerId: ProviderId = provider?.id ?? 'claude'

    let sessionCwd = cwd
    let worktreePath: string | null = null
    let originalCwd: string | null = null
    let worktreeBranch: string | null = null
    let originalBranch: string | null = null

    if (useWorktree) {
      const result = await this.createWorktree(cwd, id)
      sessionCwd = result.worktreePath
      worktreePath = result.worktreePath
      originalCwd = cwd
      worktreeBranch = result.branch
      originalBranch = result.originalBranch
    }

    const db = getDb()
    const settingRow = db
      .prepare("SELECT value FROM settings WHERE key = 'defaultPermissionMode'")
      .get() as { value: string } | undefined
    const initialPermissionMode: PermissionMode = (settingRow?.value as PermissionMode) || 'default'
    const effortRow = db.prepare("SELECT value FROM settings WHERE key = 'defaultEffort'").get() as
      | { value: string }
      | undefined
    const initialEffort: EffortLevel = (effortRow?.value as EffortLevel) || 'high'

    db.prepare(
      'INSERT INTO sessions (id, cwd, status, model, title, created_at, updated_at, worktree_path, original_cwd, worktree_branch, original_branch, source, provider, permission_mode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(
      id,
      sessionCwd,
      'empty',
      sessionModel,
      '',
      now,
      now,
      worktreePath,
      originalCwd,
      worktreeBranch,
      originalBranch,
      source,
      providerId,
      initialPermissionMode,
    )

    this.sessions.set(id, {
      id,
      provider: providerId,
      sdkSessionId: null,
      cwd: sessionCwd,
      gitBaselineHash: null,
      model: sessionModel,
      permissionMode: initialPermissionMode,
      effort: initialEffort,
      agentSession: null,
      abortController: new AbortController(),
      pendingPermissions: new Map(),
      pendingQuestions: new Map(),
      lastContextInputTokens: 0,
      mode: 'normal',
      prePlanPermissionMode: null,
      pendingPlanApprovals: new Map(),
      mcpServers: options?.mcpServers ?? null,
    })

    return id
  }

  async sendMessage(sessionId: string, text: string, attachments?: IpcAttachment[]): Promise<void> {
    if (!this.sessions.has(sessionId)) {
      this.resumeSession(sessionId)
    }
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error(`Session not found: ${sessionId}`)

    this.updateStatus(sessionId, 'starting')

    try {
      // ── Create agent session via provider ──────────────
      const provider = getProvider(session.provider)
      const agentSession = provider.createSession({
        cwd: session.cwd,
        model: session.model,
        effort: session.effort,
        permissionMode: session.permissionMode,
        abortController: session.abortController,
        betas: ['context-1m-2025-08-07'],
        mcpServers: session.mcpServers ?? undefined,
        resumeSessionId: session.sdkSessionId ?? undefined,
        onBeforeToolUse: (toolName) => {
          // Capture git baseline on first file-modifying tool
          if (['Edit', 'Write'].includes(toolName)) {
            this.captureGitBaseline(sessionId).catch(() => {})
          }
        },
        onPermissionRequest: (toolName, input, suggestions) =>
          this.requestPermission(sessionId, toolName, input, suggestions),
        onQuestionRequest: (input) => this.requestQuestion(sessionId, input),
        onPlanApprovalRequest: (input) => this.requestPlanApproval(sessionId, input),
      })
      session.agentSession = agentSession

      // ── Persist user message ───────────────────────────
      // Build user content blocks so the user message survives reload from DB.
      // Attachment processing (temp files, inlining) is now handled by the provider.
      const imageAtts = (attachments ?? []).filter(
        (a): a is Extract<IpcAttachment, { type: 'image' }> =>
          a.type === 'image' && !!a.content && !!a.mediaType,
      )
      const userContent: Array<Record<string, unknown>> = []
      for (const att of imageAtts) {
        userContent.push({
          type: 'image',
          source: { type: 'base64', media_type: att.mediaType, data: att.content },
        })
      }
      if (text) {
        userContent.push({ type: 'text', text })
      }
      this.persistMessage(sessionId, {
        type: 'user',
        content: userContent.length === 1 && userContent[0]?.type === 'text' ? text : userContent,
      })

      this.updateStatus(sessionId, 'running')
      const providerAttachments = normalizeProviderAttachments(attachments)

      // ── Consume normalized event stream ────────────────
      for await (const event of agentSession.send(text, providerAttachments)) {
        this.handleProviderEvent(sessionId, session, text, event)
      }

      this.updateStatus(sessionId, 'done')
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('Session error:', sessionId, errorMessage)
      this.updateStatus(sessionId, 'error')
      this.send(IPC.SESSION_MESSAGE, {
        sessionId,
        message: { type: 'error', error: errorMessage },
      })
    } finally {
      session.agentSession = null
    }
  }

  /**
   * Process a single NormalizedEvent from the provider.
   * raw_passthrough → persist + send to renderer (backward compat)
   * Typed events → session manager bookkeeping (usage, session ID, etc.)
   */
  private handleProviderEvent(
    sessionId: string,
    session: ActiveSession,
    userText: string,
    event: NormalizedEvent,
  ): void {
    switch (event.type) {
      // ── Raw SDK message: forward to renderer unchanged ──
      case 'raw_passthrough':
        if (event.persist) {
          this.persistMessage(sessionId, event.message)
        }
        this.send(IPC.SESSION_MESSAGE, { sessionId, message: event.message })
        this.notifyMessageListeners(sessionId, event.message)
        break

      // ── Session/thread ID assigned ──
      case 'session_init':
        if (event.sessionId) {
          session.sdkSessionId = event.sessionId
          const db = getDb()
          db.prepare('UPDATE sessions SET sdk_session_id = ? WHERE id = ?').run(
            session.sdkSessionId,
            sessionId,
          )
        }
        break

      // ── Context usage tracking ──
      case 'usage_update': {
        const total =
          event.inputTokens + (event.cachedInputTokens ?? 0) + (event.cacheCreationTokens ?? 0)
        if (total > 0) {
          session.lastContextInputTokens = total
        }
        break
      }

      // ── Turn complete: persist cost, usage, context windows ──
      case 'turn_complete': {
        // Cache context window sizes for dynamic token budgeting
        if (event.modelContextWindows) {
          for (const [model, size] of Object.entries(event.modelContextWindows)) {
            const prev = this.modelContextWindows.get(model)
            this.modelContextWindows.set(model, size)
            if (prev !== size) {
              this.persistContextWindow(model, size)
            }
          }
        }

        // Cache max output token limits
        if (event.modelMaxOutputTokens) {
          for (const [model, size] of Object.entries(event.modelMaxOutputTokens)) {
            const prev = this.modelMaxOutputTokens.get(model)
            this.modelMaxOutputTokens.set(model, size)
            if (prev !== size) {
              this.persistMaxOutputTokens(model, size)
            }
          }
        }

        // Persist cost and usage
        if (event.costUsd !== undefined || event.inputTokens > 0 || event.outputTokens > 0) {
          const resolvedContextWindow = this.modelContextWindows.get(session.model) ?? 0
          const resolvedMaxOutput = this.modelMaxOutputTokens.get(session.model) ?? 0

          const db = getDb()
          db.prepare(
            'UPDATE sessions SET total_cost_usd = total_cost_usd + ?, input_tokens = input_tokens + ?, output_tokens = output_tokens + ?, context_window = ?, context_input_tokens = ?, max_output_tokens = ?, updated_at = ? WHERE id = ?',
          ).run(
            event.costUsd || 0,
            event.inputTokens || 0,
            event.outputTokens || 0,
            resolvedContextWindow,
            session.lastContextInputTokens,
            resolvedMaxOutput,
            Date.now(),
            sessionId,
          )
        }

        // Set title after first exchange
        const currentTitle = (
          getDb().prepare('SELECT title FROM sessions WHERE id = ?').get(sessionId) as
            | { title: string }
            | undefined
        )?.title
        if (currentTitle === '') {
          this.setTitleFromMessage(sessionId, userText)
        }
        break
      }

      // Other normalized events are informational — no session-manager action needed.
      // The renderer receives them via raw_passthrough.
    }
  }

  async stopSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) return
    session.abortController.abort()
    session.abortController = new AbortController()
    if (session.agentSession) {
      session.agentSession.stop()
      session.agentSession = null
    }
    this.updateStatus(sessionId, 'done')
  }

  resolvePermission(response: PermissionResponse): void {
    for (const [, session] of this.sessions) {
      const pending = session.pendingPermissions.get(response.requestId)
      if (pending) {
        pending.resolve({ behavior: response.behavior, message: response.message })
        session.pendingPermissions.delete(response.requestId)
        return
      }
    }
  }

  resolveQuestion(response: QuestionResponse): void {
    for (const [sessionId, session] of this.sessions) {
      const pending = session.pendingQuestions.get(response.requestId)
      if (pending) {
        pending.resolve(response.answers)
        session.pendingQuestions.delete(response.requestId)
        this.updateStatus(sessionId, 'running')
        return
      }
    }
  }

  resolvePlanApproval(response: { requestId: string; approved: boolean }): void {
    for (const [sessionId, session] of this.sessions) {
      const pending = session.pendingPlanApprovals.get(response.requestId)
      if (pending) {
        pending.resolve({ approved: response.approved })
        session.pendingPlanApprovals.delete(response.requestId)
        // Exit plan mode regardless of approval result
        this.setMode(sessionId, 'normal')
        this.updateStatus(sessionId, 'running')
        return
      }
    }
  }

  resumeSession(sessionId: string): boolean {
    if (this.sessions.has(sessionId)) return true

    const db = getDb()
    const row = db
      .prepare(
        'SELECT id, cwd, sdk_session_id, model, permission_mode, git_baseline_hash, title, worktree_path, original_cwd FROM sessions WHERE id = ?',
      )
      .get(sessionId) as
      | {
          id: string
          cwd: string
          sdk_session_id: string | null
          model: string
          permission_mode: string
          git_baseline_hash: string | null
          title: string
          worktree_path: string | null
          original_cwd: string | null
        }
      | undefined

    if (!row) return false

    if (row.worktree_path && !existsSync(row.worktree_path)) {
      logger.warn(`Worktree path missing for session ${sessionId}: ${row.worktree_path}`)
    }

    // Determine provider from the session's model
    const provider = getProviderForModel(row.model)
    const providerId: ProviderId = provider?.id ?? 'claude'

    const effortRow = db.prepare("SELECT value FROM settings WHERE key = 'defaultEffort'").get() as
      | { value: string }
      | undefined
    const initialEffort: EffortLevel = (effortRow?.value as EffortLevel) || 'high'

    this.sessions.set(sessionId, {
      id: row.id,
      provider: providerId,
      sdkSessionId: row.sdk_session_id,
      cwd: row.cwd,
      gitBaselineHash: row.git_baseline_hash,
      model: row.model,
      permissionMode: (row.permission_mode as PermissionMode) || 'default',
      effort: initialEffort,
      agentSession: null,
      abortController: new AbortController(),
      pendingPermissions: new Map(),
      pendingQuestions: new Map(),
      lastContextInputTokens: 0,
      mode: 'normal',
      prePlanPermissionMode: null,
      pendingPlanApprovals: new Map(),
      mcpServers: null,
    })

    // Backfill title for old sessions that never got one
    if (row.title === '') {
      const messages = db
        .prepare(
          'SELECT sdk_message FROM messages WHERE session_id = ? ORDER BY timestamp ASC LIMIT 10',
        )
        .all(sessionId) as { sdk_message: string }[]

      for (const msg of messages) {
        try {
          const parsed = JSON.parse(msg.sdk_message)
          if (parsed.type === 'user') {
            const content =
              typeof parsed.content === 'string' ? parsed.content : (parsed.content?.text ?? '')
            if (content) {
              this.setTitleFromMessage(sessionId, content)
              break
            }
          }
        } catch {
          // Ignore parse errors
        }
      }
    }

    return true
  }

  setPermissionMode(sessionId: string, mode: PermissionMode): void {
    const session = this.sessions.get(sessionId)
    if (!session) return
    session.permissionMode = mode
    const db = getDb()
    db.prepare('UPDATE sessions SET permission_mode = ?, updated_at = ? WHERE id = ?').run(
      mode,
      Date.now(),
      sessionId,
    )
  }

  setModel(sessionId: string, model: string): void {
    const session = this.sessions.get(sessionId)
    if (!session) return
    session.model = model
    const db = getDb()
    db.prepare('UPDATE sessions SET model = ?, updated_at = ? WHERE id = ?').run(
      model,
      Date.now(),
      sessionId,
    )
  }

  setEffort(sessionId: string, effort: EffortLevel): void {
    const session = this.sessions.get(sessionId)
    if (!session) return
    session.effort = effort
  }

  setMode(sessionId: string, mode: SessionMode): void {
    const session = this.sessions.get(sessionId)
    if (!session) return

    // Validate provider supports plan mode
    if (mode === 'plan') {
      const provider = getProvider(session.provider)
      if (!provider.capabilities.planMode) return
    }

    if (mode === 'plan') {
      // Entering plan mode: save current permission mode
      session.prePlanPermissionMode = session.permissionMode
      session.permissionMode = 'plan'
      session.mode = 'plan'
    } else {
      // Exiting plan mode: restore previous permission mode
      if (session.prePlanPermissionMode) {
        session.permissionMode = session.prePlanPermissionMode
        session.prePlanPermissionMode = null
      }
      session.mode = 'normal'
    }

    this.send(IPC.SESSION_STATUS, { sessionId, mode: session.mode })
  }

  /** Returns the SDK-reported context window for a model, or undefined if not yet seen. */
  getModelContextWindow(model: string): number | undefined {
    return this.modelContextWindows.get(model)
  }

  /** Returns the SDK-reported max output tokens for a model, or undefined if not yet seen. */
  getModelMaxOutputTokens(model: string): number | undefined {
    return this.modelMaxOutputTokens.get(model)
  }

  getSessionInfo(
    sessionId: string,
  ): { model: string; permissionMode: PermissionMode; effort: EffortLevel } | null {
    const session = this.sessions.get(sessionId)
    if (!session) return null
    return {
      model: session.model,
      permissionMode: session.permissionMode,
      effort: session.effort,
    }
  }

  async sendGitAiQuery(sessionId: string, prompt: string, systemPrompt: string): Promise<string> {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error('Session not found')

    // Use a standalone text-only query via the provider — NOT the user's active
    // session — so the git AI request never appears in the chat UI.
    const provider = getProvider(session.provider)
    const textSession = provider.createSession({
      cwd: session.cwd,
      model: session.model,
      effort: session.effort,
      permissionMode: 'auto-approve',
      abortController: new AbortController(),
      onPermissionRequest: async () => ({ behavior: 'allow' as const }),
      onQuestionRequest: async () => ({}),
    })

    const combinedPrompt = `${systemPrompt}\n\n${prompt}`
    let responseText = ''
    for await (const event of textSession.sendTextOnly(combinedPrompt)) {
      if (event.type === 'message_complete' && event.role === 'assistant') {
        const textBlock = event.content.find((b) => b.type === 'text')
        if (textBlock && textBlock.type === 'text') {
          responseText = textBlock.text
        }
      }
    }
    return responseText
  }

  checkRepoStatus(folderPath: string) {
    return gitWorktreeService.checkRepoStatus(folderPath)
  }

  createWorktree(repoPath: string, sessionId: string) {
    return gitWorktreeService.createWorktree(repoPath, sessionId)
  }

  renameWorktreeBranch(sessionId: string, title: string) {
    return gitWorktreeService.renameWorktreeBranch(sessionId, title)
  }

  removeWorktree(sessionId: string) {
    return gitWorktreeService.removeWorktree(sessionId)
  }

  mergeAndCleanupWorktree(sessionId: string) {
    return gitWorktreeService.mergeAndCleanupWorktree(sessionId)
  }

  getWorktreeInfo(sessionId: string) {
    return gitWorktreeService.getWorktreeInfo(sessionId)
  }

  getProjectFolders(): Array<{ path: string; lastUsed: number }> {
    const db = getDb()
    const worktreeBase = join(homedir(), '.pylon', 'worktrees')
    // Merge manually-managed projects with session-derived projects.
    // Hidden rows act as tombstones so users can suppress stale session-derived repos.
    const rows = db
      .prepare(`
      SELECT path, MAX(last_used) as last_used FROM (
        SELECT
          COALESCE(original_cwd, cwd) as path,
          MAX(updated_at) as last_used
        FROM sessions
        WHERE COALESCE(original_cwd, cwd) NOT LIKE ? || '%'
          AND COALESCE(original_cwd, cwd) NOT IN (
            SELECT path FROM projects WHERE hidden = 1
          )
        GROUP BY COALESCE(original_cwd, cwd)

        UNION ALL

        SELECT path, last_opened_at as last_used
        FROM projects
        WHERE hidden = 0
      )
      GROUP BY path
      ORDER BY last_used DESC
      LIMIT 20
    `)
      .all(worktreeBase) as Array<{ path: string; last_used: number }>

    return rows.map((r) => ({ path: r.path, lastUsed: r.last_used }))
  }

  addProject(projectPath: string): void {
    const db = getDb()
    const now = Date.now()
    db.prepare(`
      INSERT INTO projects (path, added_at, last_opened_at, hidden) VALUES (?, ?, ?, 0)
      ON CONFLICT(path) DO UPDATE SET
        last_opened_at = excluded.last_opened_at,
        hidden = 0
    `).run(projectPath, now, now)
  }

  removeProject(projectPath: string): void {
    const db = getDb()
    const existing = db.prepare('SELECT added_at FROM projects WHERE path = ?').get(projectPath) as
      | { added_at: number }
      | undefined
    const now = Date.now()

    db.prepare(`
      INSERT INTO projects (path, added_at, last_opened_at, hidden) VALUES (?, ?, ?, 1)
      ON CONFLICT(path) DO UPDATE SET hidden = 1
    `).run(projectPath, existing?.added_at ?? now, now)
  }

  getStoredSessions(): unknown[] {
    const db = getDb()
    return db.prepare("SELECT * FROM sessions WHERE source = 'user' ORDER BY updated_at DESC").all()
  }

  getSessionMessages(sessionId: string): unknown[] {
    const db = getDb()
    return db
      .prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp ASC')
      .all(sessionId)
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.stopSession(sessionId)
    await this.removeWorktree(sessionId)
    this.sessions.delete(sessionId)
    const db = getDb()
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId)
  }

  private async captureGitBaseline(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session || session.gitBaselineHash !== null) return

    const hash = await diffService.captureGitBaseline(session.cwd, session.gitBaselineHash)
    if (hash) {
      session.gitBaselineHash = hash
      diffService.persistBaseline(sessionId, hash)
    }
  }

  async getFileDiffs(
    sessionId: string,
    filePaths: string[],
  ): Promise<Array<{ filePath: string; status: string; diff: string }>> {
    const session = this.sessions.get(sessionId)
    if (!session) return []

    if (!session.gitBaselineHash) {
      await this.captureGitBaseline(sessionId)
    }

    return diffService.getFileDiffs(session.cwd, session.gitBaselineHash, filePaths)
  }

  async getFileStatuses(
    sessionId: string,
    filePaths: string[],
  ): Promise<Array<{ filePath: string; status: string }>> {
    const session = this.sessions.get(sessionId)
    if (!session) return filePaths.map((fp) => ({ filePath: fp, status: 'modified' }))

    if (!session.gitBaselineHash) {
      await this.captureGitBaseline(sessionId)
    }

    return diffService.getFileStatuses(session.cwd, session.gitBaselineHash, filePaths)
  }

  private setTitleFromMessage(sessionId: string, userMessage: string): void {
    const title = deriveTitle(userMessage)
    if (!title) return

    const db = getDb()
    db.prepare('UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?').run(
      title,
      Date.now(),
      sessionId,
    )

    this.send(IPC.SESSION_TITLE_UPDATED, { sessionId, title })
    this.renameWorktreeBranch(sessionId, title).catch(() => {})
  }

  private async requestQuestion(
    sessionId: string,
    input: Record<string, unknown>,
  ): Promise<Record<string, string>> {
    const session = this.sessions.get(sessionId)
    if (!session) return {}

    const requestId = randomUUID()
    const questions = Array.isArray(input.questions)
      ? (input.questions as Array<Record<string, unknown>>).map((q) => ({
          question: String(q?.question ?? ''),
          header: String(q?.header ?? ''),
          options: Array.isArray(q?.options)
            ? (q.options as Array<Record<string, unknown>>).map((o) => ({
                label: String(o?.label ?? ''),
                description: String(o?.description ?? ''),
                preview: o?.preview ? String(o.preview) : undefined,
              }))
            : [],
          multiSelect: q?.multiSelect === true,
        }))
      : []

    this.send(IPC.SESSION_QUESTION, { requestId, sessionId, questions })
    this.updateStatus(sessionId, 'waiting')

    return new Promise((resolve) => {
      session.pendingQuestions.set(requestId, { resolve })
    })
  }

  private async requestPermission(
    sessionId: string,
    toolName: string,
    input: Record<string, unknown>,
    suggestions?: unknown[],
  ): Promise<{ behavior: 'allow' | 'deny'; message?: string }> {
    const session = this.sessions.get(sessionId)
    if (!session) return { behavior: 'deny', message: 'Session not found' }

    const requestId = randomUUID()
    this.send(IPC.SESSION_PERMISSION, { requestId, sessionId, toolName, input, suggestions })

    return new Promise((resolve) => {
      session.pendingPermissions.set(requestId, { resolve })
    })
  }

  private async requestPlanApproval(
    sessionId: string,
    input: Record<string, unknown>,
  ): Promise<{ approved: boolean }> {
    const session = this.sessions.get(sessionId)
    if (!session) return { approved: false }

    const requestId = randomUUID()
    const allowedPrompts = Array.isArray(input.allowedPrompts)
      ? (input.allowedPrompts as Array<{ tool: string; prompt: string }>)
      : undefined

    this.send(IPC.SESSION_PLAN_APPROVAL, { requestId, sessionId, allowedPrompts })
    this.updateStatus(sessionId, 'waiting')

    return new Promise((resolve) => {
      session.pendingPlanApprovals.set(requestId, { resolve })
    })
  }

  private persistMessage(sessionId: string, message: unknown): void {
    if ((message as Record<string, unknown>).type === 'stream_event') return
    const db = getDb()
    db.prepare(
      'INSERT INTO messages (id, session_id, timestamp, sdk_message) VALUES (?, ?, ?, ?)',
    ).run(randomUUID(), sessionId, Date.now(), JSON.stringify(message))
  }

  private updateStatus(sessionId: string, status: string): void {
    const db = getDb()
    db.prepare('UPDATE sessions SET status = ?, updated_at = ? WHERE id = ?').run(
      status,
      Date.now(),
      sessionId,
    )
    this.send(IPC.SESSION_STATUS, { sessionId, status })
  }

  getRaisePrInfo(sessionId: string) {
    return prRaiseService.getRaisePrInfo(sessionId)
  }

  generatePrDescription(sessionId: string) {
    this.resumeSession(sessionId)
    return prRaiseService.generatePrDescription(sessionId, (prompt, systemPrompt) =>
      this.sendGitAiQuery(sessionId, prompt, systemPrompt),
    )
  }

  raisePr(request: import('../shared/types').PrRaiseRequest) {
    return prRaiseService.raisePr(request)
  }

  private send(channel: string, data: unknown): void {
    if (!this.window) {
      logger.warn(`IPC send before setWindow — dropping ${channel}`)
      return
    }
    if (!this.window.isDestroyed()) {
      this.window.webContents.send(channel, data)
    }
  }
}

export const sessionManager = new SessionManager()
