import { query } from '@anthropic-ai/claude-agent-sdk'
import { BrowserWindow } from 'electron'
import { randomUUID } from 'crypto'
import { getDb } from './db'
import { IPC } from '../shared/ipc-channels'
import type { PermissionResponse } from '../shared/types'

type ActiveSession = {
  id: string
  sdkSessionId: string | null
  cwd: string
  model: string
  queryInstance: ReturnType<typeof query> | null
  abortController: AbortController
  pendingPermissions: Map<string, {
    resolve: (result: { behavior: 'allow' | 'deny'; message?: string }) => void
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
    const sessionModel = model || 'claude-sonnet-4-6'

    const db = getDb()
    db.prepare(
      'INSERT INTO sessions (id, cwd, status, model, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(id, cwd, 'empty', sessionModel, '', now, now)

    this.sessions.set(id, {
      id,
      sdkSessionId: null,
      cwd,
      model: sessionModel,
      queryInstance: null,
      abortController: new AbortController(),
      pendingPermissions: new Map(),
    })

    return id
  }

  async sendMessage(
    sessionId: string,
    text: string,
    attachments?: Array<{ type: string; content: string; mediaType?: string; name?: string }>
  ): Promise<void> {
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
          return this.requestPermission(sessionId, toolName, input, opts.suggestions)
        },
      }

      if (isResume) {
        options.resume = session.sdkSessionId
      }

      const q = query({ prompt: text, options: options as any })
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
