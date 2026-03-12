import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { promisify } from 'node:util'
import {
  query,
  type SDKResultMessage,
  type Options as SdkOptions,
} from '@anthropic-ai/claude-agent-sdk'
import { app, type BrowserWindow } from 'electron'
import { IPC } from '../shared/ipc-channels'
import { log } from '../shared/logger'
import type { PermissionMode, PermissionResponse, QuestionResponse } from '../shared/types'
import { getDb } from './db'

const logger = log.child('session-manager')

const execFileAsync = promisify(execFile)

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

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50)
}

type ActiveSession = {
  id: string
  sdkSessionId: string | null
  cwd: string
  gitBaselineHash: string | null
  model: string
  permissionMode: PermissionMode
  queryInstance: ReturnType<typeof query> | null
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
}

export class SessionManager {
  private sessions = new Map<string, ActiveSession>()
  private window: BrowserWindow | null = null
  private messageListeners = new Map<string, Set<(message: unknown) => void>>()

  setWindow(window: BrowserWindow): void {
    this.window = window
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
  ): Promise<string> {
    const id = randomUUID()
    const now = Date.now()
    const sessionModel = model || 'claude-opus-4-6'

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
    db.prepare(
      'INSERT INTO sessions (id, cwd, status, model, title, created_at, updated_at, worktree_path, original_cwd, worktree_branch, original_branch, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
    )

    this.sessions.set(id, {
      id,
      sdkSessionId: null,
      cwd: sessionCwd,
      gitBaselineHash: null,
      model: sessionModel,
      permissionMode: 'default',
      queryInstance: null,
      abortController: new AbortController(),
      pendingPermissions: new Map(),
      pendingQuestions: new Map(),
    })

    return id
  }

  async sendMessage(
    sessionId: string,
    text: string,
    attachments?: Array<{ type: string; content: string; mediaType?: string; name?: string }>,
  ): Promise<void> {
    if (!this.sessions.has(sessionId)) {
      this.resumeSession(sessionId)
    }
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error(`Session not found: ${sessionId}`)

    this.updateStatus(sessionId, 'starting')

    const isResume = session.sdkSessionId !== null

    try {
      const options: SdkOptions & Record<string, unknown> = {
        cwd: session.cwd,
        model: session.model,
        abortController: session.abortController,
        includePartialMessages: true,
        promptSuggestions: true,
        enableFileCheckpointing: true,
        settingSources: ['user', 'project', 'local'],
        canUseTool: async (toolName: string, input: Record<string, unknown>, opts) => {
          // Capture git baseline on first file-modifying tool
          if (['Edit', 'Write'].includes(toolName)) {
            this.captureGitBaseline(sessionId).catch(() => {})
          }

          // Intercept AskUserQuestion — route to question UI instead of permission prompt
          if (toolName === 'AskUserQuestion') {
            const answers = await this.requestQuestion(sessionId, input)
            return {
              behavior: 'allow' as const,
              updatedInput: { ...input, answers },
            }
          }

          // Auto-approve mode: skip permission prompt for all tools (questions still shown)
          if (session.permissionMode === 'auto-approve') {
            return { behavior: 'allow' as const, updatedInput: input }
          }

          const result = await this.requestPermission(sessionId, toolName, input, opts.suggestions)
          if (result.behavior === 'allow') {
            return { behavior: 'allow' as const, updatedInput: input }
          }
          return { behavior: 'deny' as const, message: result.message ?? 'User denied' }
        },
      }

      if (isResume) {
        options.resume = session.sdkSessionId ?? undefined
      }

      // Handle attachments: images saved to temp files, text files inlined in prompt
      const imageAttachments = (attachments ?? []).filter(
        (a) => a.type === 'image' && a.content && a.mediaType,
      )
      const fileAttachments = (attachments ?? []).filter((a) => a.type === 'file' && a.content)

      const promptParts: string[] = []

      // Save images to temp files and reference by path
      if (imageAttachments.length > 0) {
        const tmpDir = join(app.getPath('temp'), 'pylon-images')
        await mkdir(tmpDir, { recursive: true })

        for (const att of imageAttachments) {
          const ext = att.mediaType?.split('/')[1] ?? 'png'
          const filename = `${randomUUID()}.${ext}`
          const filepath = join(tmpDir, filename)
          await writeFile(filepath, Buffer.from(att.content, 'base64'))
          promptParts.push(`[Attached image: ${filepath}]`)
        }
      }

      // Inline text/data file contents directly in the prompt
      for (const att of fileAttachments) {
        promptParts.push(`<attached_file name="${att.name}">\n${att.content}\n</attached_file>`)
      }

      if (text) {
        promptParts.push(text)
      }

      const prompt = promptParts.join('\n\n')

      // Persist the user message (with image content blocks) so it survives reload from DB
      const userContent: Array<Record<string, unknown>> = []
      for (const att of imageAttachments) {
        userContent.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: att.mediaType,
            data: att.content,
          },
        })
      }
      if (text) {
        userContent.push({ type: 'text', text })
      }
      this.persistMessage(sessionId, {
        type: 'user',
        content: userContent.length === 1 && userContent[0]?.type === 'text' ? text : userContent,
      })

      const q = query({ prompt, options })
      session.queryInstance = q

      this.updateStatus(sessionId, 'running')

      for await (const message of q) {
        if (message.type === 'system' && 'session_id' in message) {
          session.sdkSessionId = message.session_id as string
          const db = getDb()
          db.prepare('UPDATE sessions SET sdk_session_id = ? WHERE id = ?').run(
            session.sdkSessionId,
            sessionId,
          )
        }

        this.persistMessage(sessionId, message)
        this.send(IPC.SESSION_MESSAGE, { sessionId, message })
        this.notifyMessageListeners(sessionId, message)

        if (message.type === 'result') {
          const result = message as SDKResultMessage
          if (result.total_cost_usd !== undefined) {
            const db = getDb()
            db.prepare(
              'UPDATE sessions SET total_cost_usd = total_cost_usd + ?, input_tokens = input_tokens + ?, output_tokens = output_tokens + ?, updated_at = ? WHERE id = ?',
            ).run(
              result.total_cost_usd || 0,
              result.usage?.input_tokens || 0,
              result.usage?.output_tokens || 0,
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
            this.setTitleFromMessage(sessionId, text)
          }
        }
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
      session.queryInstance = null
    }
  }

  async stopSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) return
    session.abortController.abort()
    session.abortController = new AbortController()
    if (session.queryInstance) {
      session.queryInstance.close()
      session.queryInstance = null
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

    this.sessions.set(sessionId, {
      id: row.id,
      sdkSessionId: row.sdk_session_id,
      cwd: row.cwd,
      gitBaselineHash: row.git_baseline_hash,
      model: row.model,
      permissionMode: (row.permission_mode as PermissionMode) || 'default',
      queryInstance: null,
      abortController: new AbortController(),
      pendingPermissions: new Map(),
      pendingQuestions: new Map(),
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

  getSessionInfo(sessionId: string): { model: string; permissionMode: PermissionMode } | null {
    const session = this.sessions.get(sessionId)
    if (!session) return null
    return { model: session.model, permissionMode: session.permissionMode }
  }

  async checkRepoStatus(folderPath: string): Promise<{ isGitRepo: boolean; isDirty: boolean }> {
    try {
      await execFileAsync('git', ['rev-parse', '--git-dir'], {
        cwd: folderPath,
        timeout: 3000,
      })
    } catch {
      return { isGitRepo: false, isDirty: false }
    }

    try {
      const { stdout } = await execFileAsync('git', ['status', '--porcelain'], {
        cwd: folderPath,
        timeout: 5000,
      })
      return { isGitRepo: true, isDirty: stdout.trim().length > 0 }
    } catch {
      return { isGitRepo: true, isDirty: false }
    }
  }

  async createWorktree(
    repoPath: string,
    sessionId: string,
  ): Promise<{ worktreePath: string; branch: string; originalBranch: string }> {
    const repoName = basename(repoPath)
    const worktreeBase = join(homedir(), '.pylon', 'worktrees', repoName)
    const worktreePath = join(worktreeBase, sessionId)
    const branch = `claude-session-${sessionId.slice(0, 8)}`

    const { stdout: branchOut } = await execFileAsync(
      'git',
      ['rev-parse', '--abbrev-ref', 'HEAD'],
      {
        cwd: repoPath,
        timeout: 5000,
      },
    )
    const originalBranch = branchOut.trim()

    await mkdir(worktreeBase, { recursive: true })

    // Clean up if path already exists
    if (existsSync(worktreePath)) {
      try {
        await execFileAsync('git', ['worktree', 'remove', '--force', worktreePath], {
          cwd: repoPath,
          timeout: 10000,
        })
      } catch {
        await rm(worktreePath, { recursive: true, force: true })
      }
    }

    await execFileAsync('git', ['worktree', 'add', worktreePath, '-b', branch], {
      cwd: repoPath,
      timeout: 30000,
    })

    return { worktreePath, branch, originalBranch }
  }

  async renameWorktreeBranch(sessionId: string, title: string): Promise<void> {
    const db = getDb()
    const row = db
      .prepare('SELECT worktree_path, worktree_branch, original_cwd FROM sessions WHERE id = ?')
      .get(sessionId) as
      | {
          worktree_path: string | null
          worktree_branch: string | null
          original_cwd: string | null
        }
      | undefined

    if (!row?.worktree_path || !row.worktree_branch || !row.original_cwd) return

    const slug = slugify(title)
    if (!slug) return

    let newBranch = `claude/${slug}`

    // Check for collision
    try {
      await execFileAsync('git', ['rev-parse', '--verify', newBranch], {
        cwd: row.original_cwd,
        timeout: 3000,
      })
      // Branch exists — add suffix
      newBranch = `claude/${slug}-${sessionId.slice(0, 4)}`
    } catch {
      // Branch doesn't exist — good
    }

    try {
      await execFileAsync('git', ['branch', '-m', row.worktree_branch, newBranch], {
        cwd: row.worktree_path,
        timeout: 5000,
      })
      db.prepare('UPDATE sessions SET worktree_branch = ? WHERE id = ?').run(newBranch, sessionId)
    } catch {
      // Rename failed — keep original branch name
    }
  }

  async removeWorktree(sessionId: string): Promise<void> {
    const db = getDb()
    const row = db
      .prepare('SELECT worktree_path, worktree_branch, original_cwd FROM sessions WHERE id = ?')
      .get(sessionId) as
      | {
          worktree_path: string | null
          worktree_branch: string | null
          original_cwd: string | null
        }
      | undefined

    if (!row?.worktree_path) return

    // Remove worktree
    if (row.original_cwd && existsSync(row.original_cwd)) {
      try {
        await execFileAsync('git', ['worktree', 'remove', '--force', row.worktree_path], {
          cwd: row.original_cwd,
          timeout: 10000,
        })
      } catch {
        // Fallback: delete directory directly
        await rm(row.worktree_path, { recursive: true, force: true }).catch(() => {})
      }

      // Delete branch
      if (row.worktree_branch) {
        try {
          await execFileAsync('git', ['branch', '-D', row.worktree_branch], {
            cwd: row.original_cwd,
            timeout: 5000,
          })
        } catch {
          // Branch may already be deleted
        }
      }
    } else {
      // Original repo gone — just delete directory
      await rm(row.worktree_path, { recursive: true, force: true }).catch(() => {})
    }

    // Clear worktree columns in DB
    db.prepare(
      'UPDATE sessions SET worktree_path = NULL, worktree_branch = NULL, original_branch = NULL WHERE id = ?',
    ).run(sessionId)
  }

  async mergeAndCleanupWorktree(sessionId: string): Promise<{
    success: boolean
    error?: string
    conflictFiles?: string[]
  }> {
    const db = getDb()
    const row = db
      .prepare(
        'SELECT worktree_path, worktree_branch, original_cwd, original_branch FROM sessions WHERE id = ?',
      )
      .get(sessionId) as
      | {
          worktree_path: string | null
          worktree_branch: string | null
          original_cwd: string | null
          original_branch: string | null
        }
      | undefined

    if (!row?.worktree_path || !row.worktree_branch || !row.original_cwd) {
      return { success: false, error: 'not-a-worktree' }
    }

    if (!row.original_branch) {
      return { success: false, error: 'branch-not-found' }
    }

    // Check for uncommitted changes in worktree
    try {
      const { stdout: statusOut } = await execFileAsync('git', ['status', '--porcelain'], {
        cwd: row.worktree_path,
        timeout: 5000,
      })
      if (statusOut.trim()) {
        return { success: false, error: 'uncommitted-changes' }
      }
    } catch {
      // If we can't check, continue anyway
    }

    // Checkout the original branch in the original repo
    try {
      await execFileAsync('git', ['checkout', row.original_branch], {
        cwd: row.original_cwd,
        timeout: 10000,
      })
    } catch {
      return { success: false, error: `Failed to checkout ${row.original_branch}` }
    }

    // Attempt merge
    try {
      await execFileAsync('git', ['merge', '--no-ff', row.worktree_branch], {
        cwd: row.original_cwd,
        timeout: 30000,
      })
    } catch {
      // Merge failed — likely conflicts. Parse conflict files then abort.
      let conflictFiles: string[] = []
      try {
        const { stdout: conflictOut } = await execFileAsync(
          'git',
          ['diff', '--name-only', '--diff-filter=U'],
          { cwd: row.original_cwd, timeout: 5000 },
        )
        conflictFiles = conflictOut.trim().split('\n').filter(Boolean)
      } catch {
        // Can't get conflict files
      }

      try {
        await execFileAsync('git', ['merge', '--abort'], {
          cwd: row.original_cwd,
          timeout: 5000,
        })
      } catch {
        // Best effort abort
      }

      return { success: false, error: 'conflicts', conflictFiles }
    }

    // Merge succeeded — clean up worktree and branch
    try {
      await execFileAsync('git', ['worktree', 'remove', '--force', row.worktree_path], {
        cwd: row.original_cwd,
        timeout: 10000,
      })
    } catch {
      await rm(row.worktree_path, { recursive: true, force: true }).catch(() => {})
    }

    try {
      await execFileAsync('git', ['branch', '-d', row.worktree_branch], {
        cwd: row.original_cwd,
        timeout: 5000,
      })
    } catch {
      // Branch may already be deleted
    }

    // Clear worktree columns in DB
    db.prepare(
      'UPDATE sessions SET worktree_path = NULL, worktree_branch = NULL, original_branch = NULL WHERE id = ?',
    ).run(sessionId)

    return { success: true }
  }

  getWorktreeInfo(sessionId: string): {
    worktreePath: string | null
    worktreeBranch: string | null
    originalBranch: string | null
  } {
    const db = getDb()
    const row = db
      .prepare('SELECT worktree_path, worktree_branch, original_branch FROM sessions WHERE id = ?')
      .get(sessionId) as
      | {
          worktree_path: string | null
          worktree_branch: string | null
          original_branch: string | null
        }
      | undefined

    return {
      worktreePath: row?.worktree_path ?? null,
      worktreeBranch: row?.worktree_branch ?? null,
      originalBranch: row?.original_branch ?? null,
    }
  }

  getProjectFolders(): Array<{ path: string; lastUsed: number }> {
    const db = getDb()
    const worktreeBase = join(homedir(), '.pylon', 'worktrees')
    const rows = db
      .prepare(`
      SELECT
        COALESCE(original_cwd, cwd) as path,
        MAX(updated_at) as last_used
      FROM sessions
      WHERE COALESCE(original_cwd, cwd) NOT LIKE ? || '%'
      GROUP BY COALESCE(original_cwd, cwd)
      ORDER BY last_used DESC
      LIMIT 20
    `)
      .all(worktreeBase) as Array<{ path: string; last_used: number }>

    return rows.map((r) => ({ path: r.path, lastUsed: r.last_used }))
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

    try {
      const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
        cwd: session.cwd,
        timeout: 5000,
      })
      const hash = stdout.trim()
      if (hash) {
        session.gitBaselineHash = hash
        const db = getDb()
        db.prepare('UPDATE sessions SET git_baseline_hash = ? WHERE id = ?').run(hash, sessionId)
      }
    } catch {
      // Not a git repo or no commits — leave baseline as null
    }
  }

  /**
   * Get the git repo root for correct path resolution.
   * git diff outputs paths relative to this root, not to session.cwd.
   */
  private async getGitRoot(cwd: string): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync('git', ['rev-parse', '--show-toplevel'], {
        cwd,
        timeout: 3000,
      })
      return stdout.trim()
    } catch {
      return null
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

    const results: Array<{ filePath: string; status: string; diff: string }> = []

    for (const filePath of filePaths) {
      try {
        const args = session.gitBaselineHash
          ? ['diff', session.gitBaselineHash, '--', filePath]
          : ['diff', 'HEAD', '--', filePath]

        const { stdout } = await execFileAsync('git', args, {
          cwd: session.cwd,
          timeout: 10000,
          maxBuffer: 1024 * 1024 * 5,
        })

        if (stdout.trim()) {
          let status = 'modified'
          if (stdout.includes('new file mode')) status = 'added'
          else if (stdout.includes('deleted file mode')) status = 'deleted'
          else if (stdout.includes('rename from')) status = 'renamed'

          results.push({ filePath, status, diff: stdout })
        } else {
          // Empty diff — show current file content as new-file diff
          const syntheticDiff = await this.buildNewFileDiff(filePath)
          results.push({
            filePath,
            status: syntheticDiff ? 'added' : 'modified',
            diff: syntheticDiff ?? '',
          })
        }
      } catch {
        // git diff failed — show current file content as new-file diff
        const syntheticDiff = await this.buildNewFileDiff(filePath)
        results.push({
          filePath,
          status: syntheticDiff ? 'added' : 'modified',
          diff: syntheticDiff ?? '',
        })
      }
    }

    return results
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

    const gitRoot = await this.getGitRoot(session.cwd)

    // Step 1: Detect untracked files in batch
    const untrackedFiles = new Set<string>()
    try {
      const { stdout } = await execFileAsync(
        'git',
        ['ls-files', '--others', '--exclude-standard', '--', ...filePaths],
        { cwd: session.cwd, timeout: 5000 },
      )
      for (const line of stdout.trim().split('\n')) {
        if (!line) continue
        // git ls-files outputs relative to cwd (not repo root)
        const absPath = line.startsWith('/') ? line : join(session.cwd, line)
        untrackedFiles.add(absPath)
      }
    } catch {
      /* ignore */
    }

    // Step 2: Get tracked file change statuses from diff against baseline
    const trackedStatuses = new Map<string, string>()
    if (session.gitBaselineHash) {
      try {
        const { stdout } = await execFileAsync(
          'git',
          ['diff', '--name-status', session.gitBaselineHash, '--', ...filePaths],
          { cwd: session.cwd, timeout: 5000 },
        )
        for (const line of stdout.trim().split('\n')) {
          if (!line) continue
          const [code, ...rest] = line.split('\t')
          const relPath = rest[rest.length - 1]
          if (!relPath) continue

          // git diff --name-status outputs paths relative to repo root
          const resolveRoot = gitRoot ?? session.cwd
          const absPath = relPath.startsWith('/') ? relPath : join(resolveRoot, relPath)

          switch (code?.[0]) {
            case 'A':
              trackedStatuses.set(absPath, 'added')
              break
            case 'D':
              trackedStatuses.set(absPath, 'deleted')
              break
            case 'R':
              trackedStatuses.set(absPath, 'renamed')
              break
            case 'M':
              trackedStatuses.set(absPath, 'modified')
              break
            default:
              trackedStatuses.set(absPath, 'modified')
          }
        }
      } catch {
        /* ignore */
      }
    }

    // Step 3: Also check git status for files committed since baseline
    // git diff --name-status only shows working tree vs baseline; if changes
    // were committed, we need git diff --name-status baseline..HEAD too
    if (session.gitBaselineHash) {
      try {
        const { stdout } = await execFileAsync(
          'git',
          ['diff', '--name-status', `${session.gitBaselineHash}..HEAD`, '--', ...filePaths],
          { cwd: session.cwd, timeout: 5000 },
        )
        for (const line of stdout.trim().split('\n')) {
          if (!line) continue
          const [code, ...rest] = line.split('\t')
          const relPath = rest[rest.length - 1]
          if (!relPath) continue

          const resolveRoot = gitRoot ?? session.cwd
          const absPath = relPath.startsWith('/') ? relPath : join(resolveRoot, relPath)

          // Don't overwrite — first diff (working tree) takes priority
          if (!trackedStatuses.has(absPath)) {
            switch (code?.[0]) {
              case 'A':
                trackedStatuses.set(absPath, 'added')
                break
              case 'D':
                trackedStatuses.set(absPath, 'deleted')
                break
              case 'R':
                trackedStatuses.set(absPath, 'renamed')
                break
              case 'M':
                trackedStatuses.set(absPath, 'modified')
                break
              default:
                trackedStatuses.set(absPath, 'modified')
            }
          }
        }
      } catch {
        /* ignore */
      }
    }

    // Step 4: Merge results
    const results: Array<{ filePath: string; status: string }> = []
    for (const filePath of filePaths) {
      if (untrackedFiles.has(filePath)) {
        results.push({ filePath, status: 'untracked' })
      } else if (trackedStatuses.has(filePath)) {
        results.push({ filePath, status: trackedStatuses.get(filePath) ?? 'modified' })
      } else {
        results.push({ filePath, status: 'modified' })
      }
    }

    return results
  }

  /**
   * Build a synthetic unified diff showing the entire file as added content.
   * Used when git diff returns empty (untracked, committed since baseline, etc.)
   * but we still want to show the user what the file contains.
   */
  private async buildNewFileDiff(filePath: string): Promise<string | null> {
    try {
      const content = await readFile(filePath, 'utf-8')
      if (!content.trim()) return null

      const lines = content.split('\n')
      const lineCount = lines.length

      const header = [
        `diff --git a/${filePath} b/${filePath}`,
        'new file mode 100644',
        '--- /dev/null',
        `+++ b/${filePath}`,
        `@@ -0,0 +1,${lineCount} @@`,
      ]
      const addedLines = lines.map((line) => `+${line}`)

      return [...header, ...addedLines].join('\n')
    } catch {
      return null
    }
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

  async getRaisePrInfo(sessionId: string): Promise<import('../shared/types').PrRaiseInfo> {
    const db = getDb()
    const row = db
      .prepare(
        'SELECT worktree_path, worktree_branch, original_branch, git_baseline_hash, original_cwd FROM sessions WHERE id = ?',
      )
      .get(sessionId) as
      | {
          worktree_path: string | null
          worktree_branch: string | null
          original_branch: string | null
          git_baseline_hash: string | null
          original_cwd: string | null
        }
      | undefined

    if (!row?.worktree_path || !row.worktree_branch || !row.git_baseline_hash) {
      throw new Error('Session is not a worktree session or has no changes')
    }

    const cwd = row.worktree_path
    const baseline = row.git_baseline_hash

    // Run git commands in parallel
    const [diffResult, nameStatusResult, logResult, numstatResult] = await Promise.all([
      execFileAsync('git', ['diff', `${baseline}..HEAD`], { cwd, maxBuffer: 10 * 1024 * 1024 }),
      execFileAsync('git', ['diff', '--name-status', `${baseline}..HEAD`], { cwd }),
      execFileAsync('git', ['log', `${baseline}..HEAD`, '--format=%H%x1e%s%x1e%aI'], { cwd }),
      execFileAsync('git', ['diff', '--numstat', `${baseline}..HEAD`], { cwd }),
    ])

    // Parse file list with status
    const files: import('../shared/types').PrRaiseFileInfo[] = []
    const numstatLines = numstatResult.stdout.trim().split('\n').filter(Boolean)
    const numstatMap = new Map<string, { ins: number; del: number }>()
    for (const line of numstatLines) {
      const [ins, del, ...pathParts] = line.split('\t')
      const filePath = pathParts.join('\t') // handle renames with tab
      numstatMap.set(filePath, {
        ins: ins === '-' ? 0 : parseInt(ins, 10),
        del: del === '-' ? 0 : parseInt(del, 10),
      })
    }

    for (const line of nameStatusResult.stdout.trim().split('\n').filter(Boolean)) {
      const [status, ...pathParts] = line.split('\t')
      const filePath = pathParts[pathParts.length - 1] // last part for renames
      const stat = numstatMap.get(filePath) ?? numstatMap.get(pathParts.join('\t'))
      files.push({
        path: filePath,
        status: status.startsWith('R')
          ? 'renamed'
          : status === 'A'
            ? 'added'
            : status === 'D'
              ? 'deleted'
              : 'modified',
        insertions: stat?.ins ?? 0,
        deletions: stat?.del ?? 0,
      })
    }

    // Parse commits
    const commits: import('../shared/types').PrRaiseCommitInfo[] = logResult.stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [hash, message, timestamp] = line.split('\x1e')
        return { hash, message, timestamp }
      })

    // Compute stats
    const stats = {
      insertions: files.reduce((sum, f) => sum + f.insertions, 0),
      deletions: files.reduce((sum, f) => sum + f.deletions, 0),
      filesChanged: files.length,
    }

    // Detect remote
    let remote = 'origin'
    try {
      await execFileAsync('git', ['remote', 'get-url', 'origin'], { cwd })
    } catch {
      const { stdout } = await execFileAsync('git', ['remote'], { cwd })
      const firstRemote = stdout.trim().split('\n')[0]
      if (firstRemote) remote = firstRemote
    }

    // Detect repo full name
    let repoFullName = ''
    try {
      const { stdout } = await execFileAsync(
        'gh',
        ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'],
        { cwd },
      )
      repoFullName = stdout.trim()
    } catch {
      // Fallback: parse from remote URL
      const { parseGitHubRemote } = await import('./gh-cli')
      try {
        const { stdout } = await execFileAsync('git', ['remote', 'get-url', remote], { cwd })
        const parsed = parseGitHubRemote(stdout.trim())
        if (parsed) repoFullName = `${parsed.owner}/${parsed.repo}`
      } catch {
        /* ignore */
      }
    }

    // Detect default base branch
    let baseBranch = 'main'
    try {
      const { stdout } = await execFileAsync(
        'gh',
        ['repo', 'view', '--json', 'defaultBranchRef', '-q', '.defaultBranchRef.name'],
        { cwd },
      )
      baseBranch = stdout.trim() || 'main'
    } catch {
      // Fallback: check if main or master exists
      try {
        await execFileAsync('git', ['rev-parse', '--verify', 'origin/main'], { cwd })
        baseBranch = 'main'
      } catch {
        try {
          await execFileAsync('git', ['rev-parse', '--verify', 'origin/master'], { cwd })
          baseBranch = 'master'
        } catch {
          baseBranch = row.original_branch ?? 'main'
        }
      }
    }

    return {
      diff: diffResult.stdout,
      files,
      commits,
      stats,
      headBranch: row.worktree_branch,
      baseBranch,
      remote,
      repoFullName,
    }
  }

  async generatePrDescription(
    sessionId: string,
  ): Promise<import('../shared/types').PrRaiseDescription> {
    const db = getDb()

    // Get session messages for context
    const messages = db
      .prepare(
        'SELECT sdk_message FROM messages WHERE session_id = ? ORDER BY timestamp ASC LIMIT 50',
      )
      .all(sessionId) as { sdk_message: string }[]

    // Build conversation summary (user messages only, to keep prompt small)
    const conversationSummary = messages
      .map((m) => {
        try {
          const parsed = JSON.parse(m.sdk_message)
          if (parsed.type === 'user' && typeof parsed.content === 'string') {
            return `User: ${parsed.content.slice(0, 500)}`
          }
          return null
        } catch {
          return null
        }
      })
      .filter(Boolean)
      .slice(0, 10)
      .join('\n')

    // Get diff info
    const info = await this.getRaisePrInfo(sessionId)
    const fileList = info.files
      .map((f) => `${f.status} ${f.path} (+${f.insertions}/-${f.deletions})`)
      .join('\n')

    // Get session title
    const session = db.prepare('SELECT title FROM sessions WHERE id = ?').get(sessionId) as
      | { title: string }
      | undefined
    const sessionTitle = session?.title ?? 'Untitled'

    // Include truncated diff for better description quality (cap at ~8000 chars to stay under token limits)
    const diffPreview =
      info.diff.length > 8000 ? `${info.diff.slice(0, 8000)}\n... (diff truncated)` : info.diff

    const prompt = `Generate a pull request title and description for the following changes.

Session title: ${sessionTitle}

Conversation context:
${conversationSummary}

Files changed (${info.stats.filesChanged} files, +${info.stats.insertions}/-${info.stats.deletions}):
${fileList}

Diff (may be truncated):
${diffPreview}

Respond with ONLY a JSON object in this exact format (no markdown fences):
{"title": "feat: short descriptive title", "body": "## Summary\\n- bullet points\\n\\n## Test Plan\\n- [ ] verification steps"}

Rules:
- Title should follow conventional commit format (feat:, fix:, refactor:, etc.)
- Title should be under 72 characters
- Body should have ## Summary with bullet points and ## Test Plan with checkboxes
- Only include ## Breaking Changes section if there are breaking changes
- Be specific about what changed and why`

    try {
      const apiKey = process.env.ANTHROPIC_API_KEY
      if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1024,
          messages: [{ role: 'user', content: prompt }],
        }),
      })
      if (!response.ok) throw new Error(`Anthropic API error: ${response.status}`)
      const data = (await response.json()) as { content: { type: string; text: string }[] }

      const text = data.content
        .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
        .map((b) => b.text)
        .join('')

      const parsed = JSON.parse(text) as { title?: string; body?: string }
      return { title: parsed.title ?? sessionTitle, body: parsed.body ?? '' }
    } catch (err) {
      logger.error('generatePrDescription failed:', err)
      // Fallback: simple template
      return {
        title: sessionTitle,
        body: `## Summary\n\nChanges from Pylon session.\n\n### Files changed\n${fileList}`,
      }
    }
  }

  async raisePr(
    request: import('../shared/types').PrRaiseRequest,
  ): Promise<import('../shared/types').PrRaiseResult> {
    const db = getDb()
    const row = db
      .prepare(
        'SELECT worktree_path, worktree_branch, git_baseline_hash FROM sessions WHERE id = ?',
      )
      .get(request.sessionId) as
      | {
          worktree_path: string | null
          worktree_branch: string | null
          git_baseline_hash: string | null
        }
      | undefined

    if (!row?.worktree_path || !row.worktree_branch || !row.git_baseline_hash) {
      return { success: false, error: 'Session is not a worktree session or has no changes' }
    }

    const cwd = row.worktree_path
    const branch = row.worktree_branch

    try {
      // Handle squash if requested
      if (request.squash) {
        // Create backup ref
        await execFileAsync('git', ['update-ref', `refs/pylon/pre-squash/${branch}`, 'HEAD'], {
          cwd,
        })
        try {
          await execFileAsync('git', ['reset', '--soft', row.git_baseline_hash], { cwd })
          await execFileAsync('git', ['commit', '-m', request.title], { cwd })
        } catch (squashErr) {
          // Restore from backup
          await execFileAsync('git', ['reset', '--hard', `refs/pylon/pre-squash/${branch}`], {
            cwd,
          })
          throw squashErr
        }
      }

      // Detect remote
      let remote = 'origin'
      try {
        await execFileAsync('git', ['remote', 'get-url', 'origin'], { cwd })
      } catch {
        const { stdout } = await execFileAsync('git', ['remote'], { cwd })
        remote = stdout.trim().split('\n')[0] || 'origin'
      }

      // Push branch
      await execFileAsync('git', ['push', '-u', remote, branch], { cwd, timeout: 60_000 })

      // Detect repo full name
      let repoFullName = ''
      try {
        const { stdout } = await execFileAsync(
          'gh',
          ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'],
          { cwd },
        )
        repoFullName = stdout.trim()
      } catch {
        const { parseGitHubRemote } = await import('./gh-cli')
        const { stdout } = await execFileAsync('git', ['remote', 'get-url', remote], { cwd })
        const parsed = parseGitHubRemote(stdout.trim())
        if (parsed) repoFullName = `${parsed.owner}/${parsed.repo}`
      }

      if (!repoFullName) {
        return {
          success: false,
          error: 'Could not determine repository. Check git remote configuration.',
        }
      }

      // Create PR
      const { createPullRequest } = await import('./gh-cli')
      const result = await createPullRequest(
        repoFullName,
        branch,
        request.baseBranch,
        request.title,
        request.body,
      )

      return { success: true, prUrl: result.url, prNumber: result.number }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error('raisePr failed:', err)
      return { success: false, error: msg }
    }
  }

  private send(channel: string, data: unknown): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send(channel, data)
    }
  }
}

export const sessionManager = new SessionManager()
