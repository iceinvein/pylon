import { query } from '@anthropic-ai/claude-agent-sdk'
import { BrowserWindow, app } from 'electron'
import { randomUUID } from 'crypto'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { readFile, writeFile, mkdir, rm } from 'fs/promises'
import { existsSync } from 'fs'
import { join, basename } from 'path'
import { homedir } from 'os'
import { getDb } from './db'
import { IPC } from '../shared/ipc-channels'
import type { PermissionMode, PermissionResponse, QuestionResponse } from '../shared/types'

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
    .replace(/^(hey,?\s*|hi,?\s*|hello,?\s*|please\s+|can you\s+|could you\s+|i need to\s+|i want to\s+|help me\s+|let's\s+|lets\s+)/i, '')
    .trim()

  // Capitalize first letter
  title = title.charAt(0).toUpperCase() + title.slice(1)

  // Truncate to ~60 chars on a word boundary
  if (title.length > 60) {
    title = title.slice(0, 60).replace(/\s+\S*$/, '').trim()
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
  pendingPermissions: Map<string, {
    resolve: (result: { behavior: 'allow' | 'deny'; message?: string }) => void
  }>
  pendingQuestions: Map<string, {
    resolve: (answers: Record<string, string>) => void
  }>
}

export class SessionManager {
  private sessions = new Map<string, ActiveSession>()
  private window: BrowserWindow | null = null

  setWindow(window: BrowserWindow): void {
    this.window = window
  }

  async createSession(cwd: string, model?: string, useWorktree?: boolean): Promise<string> {
    const id = randomUUID()
    const now = Date.now()
    const sessionModel = model || 'claude-opus-4-6'

    let sessionCwd = cwd
    let worktreePath: string | null = null
    let originalCwd: string | null = null
    let worktreeBranch: string | null = null

    if (useWorktree) {
      const result = await this.createWorktree(cwd, id)
      sessionCwd = result.worktreePath
      worktreePath = result.worktreePath
      originalCwd = cwd
      worktreeBranch = result.branch
    }

    const db = getDb()
    db.prepare(
      'INSERT INTO sessions (id, cwd, status, model, title, created_at, updated_at, worktree_path, original_cwd, worktree_branch) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(id, sessionCwd, 'empty', sessionModel, '', now, now, worktreePath, originalCwd, worktreeBranch)

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
    attachments?: Array<{ type: string; content: string; mediaType?: string; name?: string }>
  ): Promise<void> {
    if (!this.sessions.has(sessionId)) {
      this.resumeSession(sessionId)
    }
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error('Session not found: ' + sessionId)

    this.updateStatus(sessionId, 'starting')

    const isResume = session.sdkSessionId !== null

    try {
      const options: Record<string, unknown> = {
        cwd: session.cwd,
        model: session.model,
        abortController: session.abortController,
        includePartialMessages: true,
        promptSuggestions: true,
        enableFileCheckpointing: true,
        settingSources: ['user', 'project', 'local'],
        canUseTool: async (
          toolName: string,
          input: Record<string, unknown>,
          opts: { suggestions?: Array<{ type: string; pattern: string }>; toolUseID: string }
        ) => {
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
        options.resume = session.sdkSessionId
      }

      // Handle attachments: images saved to temp files, text files inlined in prompt
      const imageAttachments = (attachments ?? []).filter((a) => a.type === 'image' && a.content && a.mediaType)
      const fileAttachments = (attachments ?? []).filter((a) => a.type === 'file' && a.content)

      const promptParts: string[] = []

      // Save images to temp files and reference by path
      if (imageAttachments.length > 0) {
        const tmpDir = join(app.getPath('temp'), 'claude-ui-images')
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

      // Persist the user message so it survives reload from DB
      this.persistMessage(sessionId, { type: 'user', content: text })

      const q = query({ prompt, options: options as any })
      session.queryInstance = q

      this.updateStatus(sessionId, 'running')

      for await (const message of q) {
        if (message.type === 'system' && 'session_id' in message) {
          session.sdkSessionId = message.session_id as string
          const db = getDb()
          db.prepare('UPDATE sessions SET sdk_session_id = ? WHERE id = ?')
            .run(session.sdkSessionId, sessionId)
        }

        this.persistMessage(sessionId, message)
        this.send(IPC.SESSION_MESSAGE, { sessionId, message })

        if (message.type === 'result') {
          const result = message as any
          if (result.total_cost_usd !== undefined) {
            const db = getDb()
            db.prepare(
              'UPDATE sessions SET total_cost_usd = total_cost_usd + ?, input_tokens = input_tokens + ?, output_tokens = output_tokens + ?, updated_at = ? WHERE id = ?'
            ).run(
              result.total_cost_usd || 0,
              result.usage?.input_tokens || 0,
              result.usage?.output_tokens || 0,
              Date.now(),
              sessionId
            )
          }
          // Set title after first exchange
          const currentTitle = (getDb().prepare('SELECT title FROM sessions WHERE id = ?').get(sessionId) as { title: string } | undefined)?.title
          if (currentTitle === '') {
            this.setTitleFromMessage(sessionId, text)
          }
        }
      }

      this.updateStatus(sessionId, 'done')
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error('Session error:', sessionId, errorMessage)
      this.updateStatus(sessionId, 'error')
      this.send(IPC.SESSION_MESSAGE, {
        sessionId,
        message: { type: 'error', error: errorMessage }
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
    const row = db.prepare('SELECT id, cwd, sdk_session_id, model, permission_mode, git_baseline_hash, title, worktree_path, original_cwd FROM sessions WHERE id = ?').get(sessionId) as
      | { id: string; cwd: string; sdk_session_id: string | null; model: string; permission_mode: string; git_baseline_hash: string | null; title: string; worktree_path: string | null; original_cwd: string | null }
      | undefined

    if (!row) return false

    if (row.worktree_path && !existsSync(row.worktree_path)) {
      console.warn(`Worktree path missing for session ${sessionId}: ${row.worktree_path}`)
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
      const messages = db.prepare(
        "SELECT sdk_message FROM messages WHERE session_id = ? ORDER BY timestamp ASC LIMIT 10"
      ).all(sessionId) as { sdk_message: string }[]

      for (const msg of messages) {
        try {
          const parsed = JSON.parse(msg.sdk_message)
          if (parsed.type === 'user') {
            const content = typeof parsed.content === 'string'
              ? parsed.content
              : (parsed.content?.text ?? '')
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
    db.prepare('UPDATE sessions SET permission_mode = ?, updated_at = ? WHERE id = ?').run(mode, Date.now(), sessionId)
  }

  setModel(sessionId: string, model: string): void {
    const session = this.sessions.get(sessionId)
    if (!session) return
    session.model = model
    const db = getDb()
    db.prepare('UPDATE sessions SET model = ?, updated_at = ? WHERE id = ?').run(model, Date.now(), sessionId)
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

  async createWorktree(repoPath: string, sessionId: string): Promise<{ worktreePath: string; branch: string }> {
    const repoName = basename(repoPath)
    const worktreeBase = join(homedir(), '.claude-ui', 'worktrees', repoName)
    const worktreePath = join(worktreeBase, sessionId)
    const branch = `claude-session-${sessionId.slice(0, 8)}`

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

    return { worktreePath, branch }
  }

  async renameWorktreeBranch(sessionId: string, title: string): Promise<void> {
    const db = getDb()
    const row = db.prepare('SELECT worktree_path, worktree_branch, original_cwd FROM sessions WHERE id = ?').get(sessionId) as
      | { worktree_path: string | null; worktree_branch: string | null; original_cwd: string | null }
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
    const row = db.prepare('SELECT worktree_path, worktree_branch, original_cwd FROM sessions WHERE id = ?').get(sessionId) as
      | { worktree_path: string | null; worktree_branch: string | null; original_cwd: string | null }
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
  }

  getStoredSessions(): unknown[] {
    const db = getDb()
    return db.prepare('SELECT * FROM sessions ORDER BY updated_at DESC').all()
  }

  getSessionMessages(sessionId: string): unknown[] {
    const db = getDb()
    return db.prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp ASC').all(sessionId)
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

  async getFileDiffs(sessionId: string, filePaths: string[]): Promise<Array<{ filePath: string; status: string; diff: string }>> {
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
    filePaths: string[]
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
        { cwd: session.cwd, timeout: 5000 }
      )
      for (const line of stdout.trim().split('\n')) {
        if (!line) continue
        // git ls-files outputs relative to cwd (not repo root)
        const absPath = line.startsWith('/') ? line : join(session.cwd, line)
        untrackedFiles.add(absPath)
      }
    } catch { /* ignore */ }

    // Step 2: Get tracked file change statuses from diff against baseline
    const trackedStatuses = new Map<string, string>()
    if (session.gitBaselineHash) {
      try {
        const { stdout } = await execFileAsync(
          'git',
          ['diff', '--name-status', session.gitBaselineHash, '--', ...filePaths],
          { cwd: session.cwd, timeout: 5000 }
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
            case 'A': trackedStatuses.set(absPath, 'added'); break
            case 'D': trackedStatuses.set(absPath, 'deleted'); break
            case 'R': trackedStatuses.set(absPath, 'renamed'); break
            case 'M': trackedStatuses.set(absPath, 'modified'); break
            default: trackedStatuses.set(absPath, 'modified')
          }
        }
      } catch { /* ignore */ }
    }

    // Step 3: Also check git status for files committed since baseline
    // git diff --name-status only shows working tree vs baseline; if changes
    // were committed, we need git diff --name-status baseline..HEAD too
    if (session.gitBaselineHash) {
      try {
        const { stdout } = await execFileAsync(
          'git',
          ['diff', '--name-status', `${session.gitBaselineHash}..HEAD`, '--', ...filePaths],
          { cwd: session.cwd, timeout: 5000 }
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
              case 'A': trackedStatuses.set(absPath, 'added'); break
              case 'D': trackedStatuses.set(absPath, 'deleted'); break
              case 'R': trackedStatuses.set(absPath, 'renamed'); break
              case 'M': trackedStatuses.set(absPath, 'modified'); break
              default: trackedStatuses.set(absPath, 'modified')
            }
          }
        }
      } catch { /* ignore */ }
    }

    // Step 4: Merge results
    const results: Array<{ filePath: string; status: string }> = []
    for (const filePath of filePaths) {
      if (untrackedFiles.has(filePath)) {
        results.push({ filePath, status: 'untracked' })
      } else if (trackedStatuses.has(filePath)) {
        results.push({ filePath, status: trackedStatuses.get(filePath)! })
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
    db.prepare('UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?')
      .run(title, Date.now(), sessionId)

    this.send(IPC.SESSION_TITLE_UPDATED, { sessionId, title })
    this.renameWorktreeBranch(sessionId, title).catch(() => {})
  }

  private async requestQuestion(
    sessionId: string,
    input: Record<string, unknown>
  ): Promise<Record<string, string>> {
    const session = this.sessions.get(sessionId)
    if (!session) return {}

    const requestId = randomUUID()
    const questions = Array.isArray(input.questions)
      ? input.questions.map((q: any) => ({
          question: String(q?.question ?? ''),
          header: String(q?.header ?? ''),
          options: Array.isArray(q?.options)
            ? q.options.map((o: any) => ({
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
    suggestions?: Array<{ type: string; pattern: string }>
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
    if ((message as any).type === 'stream_event') return
    const db = getDb()
    db.prepare('INSERT INTO messages (id, session_id, timestamp, sdk_message) VALUES (?, ?, ?, ?)')
      .run(randomUUID(), sessionId, Date.now(), JSON.stringify(message))
  }

  private updateStatus(sessionId: string, status: string): void {
    const db = getDb()
    db.prepare('UPDATE sessions SET status = ?, updated_at = ? WHERE id = ?').run(status, Date.now(), sessionId)
    this.send(IPC.SESSION_STATUS, { sessionId, status })
  }

  private send(channel: string, data: unknown): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send(channel, data)
    }
  }
}

export const sessionManager = new SessionManager()
