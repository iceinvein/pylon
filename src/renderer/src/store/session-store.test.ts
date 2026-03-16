import { beforeEach, describe, expect, test } from 'bun:test'
import type { PermissionRequest, QuestionRequest } from '../../../shared/types'
import type { SessionState } from './session-store'
import { useSessionStore } from './session-store'

function makeSession(overrides: Partial<SessionState> = {}): SessionState {
  return {
    id: 'sess-1',
    cwd: '/tmp',
    status: 'empty',
    model: 'claude-sonnet-4-6',
    title: 'Test Session',
    cost: { inputTokens: 0, outputTokens: 0, totalUsd: 0, contextWindow: 0, contextInputTokens: 0 },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  }
}

function resetStore() {
  useSessionStore.setState({
    sessions: new Map(),
    messages: new Map(),
    pendingPermissions: [],
    pendingQuestions: [],
    streamingText: new Map(),
    subagentStreaming: new Map(),
    subagentMessages: new Map(),
    tasks: new Map(),
    sdkStatus: new Map(),
    changedFiles: new Map(),
    diffCache: new Map(),
  })
}

describe('session-store', () => {
  beforeEach(resetStore)

  describe('sessions', () => {
    test('setSession adds a new session', () => {
      const session = makeSession()
      useSessionStore.getState().setSession(session)
      expect(useSessionStore.getState().sessions.get('sess-1')).toEqual(session)
    })

    test('setSession overwrites an existing session', () => {
      useSessionStore.getState().setSession(makeSession({ title: 'First' }))
      useSessionStore.getState().setSession(makeSession({ title: 'Second' }))
      expect(useSessionStore.getState().sessions.get('sess-1')?.title).toBe('Second')
    })

    test('updateSession merges partial updates', () => {
      useSessionStore.getState().setSession(makeSession())
      useSessionStore
        .getState()
        .updateSession('sess-1', { title: 'Updated', model: 'claude-opus-4-6' })
      const s = useSessionStore.getState().sessions.get('sess-1')
      expect(s).toBeDefined()
      expect(s?.title).toBe('Updated')
      expect(s?.model).toBe('claude-opus-4-6')
      expect(s?.cwd).toBe('/tmp') // unchanged
    })

    test('updateSession does nothing for non-existent session', () => {
      useSessionStore.getState().updateSession('no-such', { title: 'nope' })
      expect(useSessionStore.getState().sessions.size).toBe(0)
    })
  })

  describe('messages', () => {
    test('appendMessage creates array for new session', () => {
      useSessionStore.getState().appendMessage('sess-1', { type: 'user', text: 'hi' })
      expect(useSessionStore.getState().messages.get('sess-1')).toEqual([
        { type: 'user', text: 'hi' },
      ])
    })

    test('appendMessage appends to existing array', () => {
      useSessionStore.getState().appendMessage('sess-1', 'msg1')
      useSessionStore.getState().appendMessage('sess-1', 'msg2')
      expect(useSessionStore.getState().messages.get('sess-1')).toEqual(['msg1', 'msg2'])
    })

    test('setMessages replaces all messages for a session', () => {
      useSessionStore.getState().appendMessage('sess-1', 'old')
      useSessionStore.getState().setMessages('sess-1', ['new1', 'new2'])
      expect(useSessionStore.getState().messages.get('sess-1')).toEqual(['new1', 'new2'])
    })
  })

  describe('permissions', () => {
    const perm: PermissionRequest = {
      sessionId: 'sess-1',
      requestId: 'req-1',
      toolName: 'Bash',
      input: {},
    }

    test('addPermission appends to list', () => {
      useSessionStore.getState().addPermission(perm)
      expect(useSessionStore.getState().pendingPermissions).toHaveLength(1)
    })

    test('removePermission filters by requestId', () => {
      useSessionStore.getState().addPermission(perm)
      useSessionStore.getState().addPermission({ ...perm, requestId: 'req-2' })
      useSessionStore.getState().removePermission('req-1')
      expect(useSessionStore.getState().pendingPermissions).toHaveLength(1)
      expect(useSessionStore.getState().pendingPermissions[0].requestId).toBe('req-2')
    })
  })

  describe('questions', () => {
    const question: QuestionRequest = {
      sessionId: 'sess-1',
      requestId: 'q-1',
      questions: [{ question: 'Pick one', header: '', options: [] }],
    }

    test('addQuestion and removeQuestion', () => {
      useSessionStore.getState().addQuestion(question)
      expect(useSessionStore.getState().pendingQuestions).toHaveLength(1)
      useSessionStore.getState().removeQuestion('q-1')
      expect(useSessionStore.getState().pendingQuestions).toHaveLength(0)
    })
  })

  describe('streaming', () => {
    test('updateStreamingText sets text for key', () => {
      useSessionStore.getState().updateStreamingText('sess-1', 'hello')
      expect(useSessionStore.getState().streamingText.get('sess-1')).toBe('hello')
    })

    test('clearStreamingText removes key', () => {
      useSessionStore.getState().updateStreamingText('sess-1', 'hello')
      useSessionStore.getState().clearStreamingText('sess-1')
      expect(useSessionStore.getState().streamingText.has('sess-1')).toBe(false)
    })
  })

  describe('subagent streaming', () => {
    test('appendSubagentStreamText accumulates text', () => {
      useSessionStore.getState().appendSubagentStreamText('agent-1', 'hello ')
      useSessionStore.getState().appendSubagentStreamText('agent-1', 'world')
      expect(useSessionStore.getState().subagentStreaming.get('agent-1')).toBe('hello world')
    })

    test('clearSubagentStream removes key', () => {
      useSessionStore.getState().appendSubagentStreamText('agent-1', 'text')
      useSessionStore.getState().clearSubagentStream('agent-1')
      expect(useSessionStore.getState().subagentStreaming.has('agent-1')).toBe(false)
    })
  })

  describe('subagent messages', () => {
    test('appendSubagentMessage creates and appends', () => {
      useSessionStore.getState().appendSubagentMessage('agent-1', 'msg1')
      useSessionStore.getState().appendSubagentMessage('agent-1', 'msg2')
      expect(useSessionStore.getState().subagentMessages.get('agent-1')).toEqual(['msg1', 'msg2'])
    })
  })

  describe('tasks', () => {
    const task1 = { id: '1', subject: 'Do thing', status: 'pending' as const }
    const task2 = { id: '2', subject: 'Other thing', status: 'completed' as const }

    test('upsertTask inserts new task', () => {
      useSessionStore.getState().upsertTask('sess-1', task1)
      expect(useSessionStore.getState().tasks.get('sess-1')).toEqual([task1])
    })

    test('upsertTask updates existing task by id', () => {
      useSessionStore.getState().upsertTask('sess-1', task1)
      useSessionStore.getState().upsertTask('sess-1', { ...task1, status: 'completed' })
      const tasks = useSessionStore.getState().tasks.get('sess-1')
      expect(tasks).toBeDefined()
      expect(tasks).toHaveLength(1)
      expect(tasks?.[0].status).toBe('completed')
    })

    test('upsertTask adds multiple tasks', () => {
      useSessionStore.getState().upsertTask('sess-1', task1)
      useSessionStore.getState().upsertTask('sess-1', task2)
      expect(useSessionStore.getState().tasks.get('sess-1')).toHaveLength(2)
    })

    test('clearTasks removes all tasks for session', () => {
      useSessionStore.getState().upsertTask('sess-1', task1)
      useSessionStore.getState().clearTasks('sess-1')
      expect(useSessionStore.getState().tasks.has('sess-1')).toBe(false)
    })
  })

  describe('sdkStatus', () => {
    test('setSdkStatus stores status per session', () => {
      useSessionStore.getState().setSdkStatus('sess-1', 'compacting')
      expect(useSessionStore.getState().sdkStatus.get('sess-1')).toBe('compacting')
    })

    test('setSdkStatus can set null', () => {
      useSessionStore.getState().setSdkStatus('sess-1', 'compacting')
      useSessionStore.getState().setSdkStatus('sess-1', null)
      expect(useSessionStore.getState().sdkStatus.get('sess-1')).toBeNull()
    })
  })

  describe('changedFiles', () => {
    test('addChangedFile adds file to session list', () => {
      useSessionStore.getState().addChangedFile('sess-1', '/a.ts')
      expect(useSessionStore.getState().changedFiles.get('sess-1')).toEqual(['/a.ts'])
    })

    test('addChangedFile deduplicates', () => {
      useSessionStore.getState().addChangedFile('sess-1', '/a.ts')
      useSessionStore.getState().addChangedFile('sess-1', '/a.ts')
      expect(useSessionStore.getState().changedFiles.get('sess-1')).toEqual(['/a.ts'])
    })

    test('addChangedFile tracks multiple files', () => {
      useSessionStore.getState().addChangedFile('sess-1', '/a.ts')
      useSessionStore.getState().addChangedFile('sess-1', '/b.ts')
      expect(useSessionStore.getState().changedFiles.get('sess-1')).toEqual(['/a.ts', '/b.ts'])
    })

    test('clearChangedFiles removes session entry', () => {
      useSessionStore.getState().addChangedFile('sess-1', '/a.ts')
      useSessionStore.getState().clearChangedFiles('sess-1')
      expect(useSessionStore.getState().changedFiles.has('sess-1')).toBe(false)
    })
  })

  describe('diffCache', () => {
    const diff = { filePath: '/a.ts', status: 'modified', diff: '+ added line' }

    test('setCachedDiff stores diff', () => {
      useSessionStore.getState().setCachedDiff('sess-1', diff)
      expect(useSessionStore.getState().getCachedDiff('sess-1', '/a.ts')).toEqual(diff)
    })

    test('getCachedDiff returns undefined for missing entries', () => {
      expect(useSessionStore.getState().getCachedDiff('sess-1', '/nope.ts')).toBeUndefined()
    })

    test('clearDiffCache removes all diffs for session', () => {
      useSessionStore.getState().setCachedDiff('sess-1', diff)
      useSessionStore.getState().clearDiffCache('sess-1')
      expect(useSessionStore.getState().getCachedDiff('sess-1', '/a.ts')).toBeUndefined()
    })
  })
})
