import { query } from '@anthropic-ai/claude-agent-sdk'
import { BrowserWindow, app } from 'electron'
import { randomUUID } from 'crypto'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { getDb } from './db'
import { IPC } from '../shared/ipc-channels'
import type { PermissionMode, PermissionResponse, QuestionResponse } from '../shared/types'

type ActiveSession = {
  id: string
  sdkSessionId: string | null
  cwd: string
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

  async createSession(cwd: string, model?: string): Promise<string> {
    const id = randomUUID()
    const now = Date.now()
    const sessionModel = model || 'claude-opus-4-6'

    const db = getDb()
    db.prepare(
      'INSERT INTO sessions (id, cwd, status, model, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(id, cwd, 'empty', sessionModel, '', now, now)

    this.sessions.set(id, {
      id,
      sdkSessionId: null,
      cwd,
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
    const row = db.prepare('SELECT id, cwd, sdk_session_id, model, permission_mode FROM sessions WHERE id = ?').get(sessionId) as
      | { id: string; cwd: string; sdk_session_id: string | null; model: string; permission_mode: string }
      | undefined

    if (!row) return false

    this.sessions.set(sessionId, {
      id: row.id,
      sdkSessionId: row.sdk_session_id,
      cwd: row.cwd,
      model: row.model,
      permissionMode: (row.permission_mode as PermissionMode) || 'default',
      queryInstance: null,
      abortController: new AbortController(),
      pendingPermissions: new Map(),
      pendingQuestions: new Map(),
    })

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

  getStoredSessions(): unknown[] {
    const db = getDb()
    return db.prepare('SELECT * FROM sessions ORDER BY updated_at DESC').all()
  }

  getSessionMessages(sessionId: string): unknown[] {
    const db = getDb()
    return db.prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp ASC').all(sessionId)
  }

  deleteSession(sessionId: string): void {
    this.stopSession(sessionId)
    this.sessions.delete(sessionId)
    const db = getDb()
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId)
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
