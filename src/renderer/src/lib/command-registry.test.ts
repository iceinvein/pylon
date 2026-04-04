import { describe, expect, test } from 'bun:test'
import { useSessionStore } from '../store/session-store'
import { useUiStore } from '../store/ui-store'
import type { CommandContext } from './command-registry'
import { COMMANDS, findCommand, getCommands } from './command-registry'

const fullContext: CommandContext = {
  sessionId: 'test-session-123',
  activeSessionId: 'test-session-123',
  model: 'claude-opus-4-6',
  permissionMode: 'default',
}

const noSessionContext: CommandContext = {
  sessionId: null,
  activeSessionId: null,
  model: 'claude-opus-4-6',
  permissionMode: 'default',
}

describe('command-registry', () => {
  test('COMMANDS has no duplicate IDs', () => {
    const ids = COMMANDS.map((c) => c.id)
    const unique = new Set(ids)
    expect(unique.size).toBe(ids.length)
  })

  describe('getCommands', () => {
    test('returns all commands when sessionId is present', () => {
      const cmds = getCommands(fullContext)
      expect(cmds.length).toBe(COMMANDS.length)
    })

    test('filters out requiresSession commands when sessionId is null', () => {
      const cmds = getCommands(noSessionContext)
      const sessionCmds = COMMANDS.filter((c) => c.requiresSession)
      const globalCmds = COMMANDS.filter((c) => !c.requiresSession)
      expect(cmds.length).toBe(globalCmds.length)
      for (const cmd of cmds) {
        expect(cmd.requiresSession).toBe(false)
      }
      expect(cmds.length).toBeLessThan(COMMANDS.length)
      expect(sessionCmds.length).toBeGreaterThan(0)
    })
  })

  describe('findCommand', () => {
    test('returns the correct command by ID', () => {
      const cmd = findCommand('clear')
      expect(cmd).toBeDefined()
      expect(cmd?.id).toBe('clear')
      expect(cmd?.label).toBe('Clear chat')
    })

    test('returns undefined for unknown IDs', () => {
      expect(findCommand('nonexistent')).toBeUndefined()
    })
  })

  describe('execute', () => {
    const sid = 'test-session-123'

    function seedSession() {
      const sessions = new Map()
      sessions.set(sid, {
        id: sid,
        cwd: '/test',
        model: 'opus',
        status: 'idle',
        title: '',
        cost: {
          inputTokens: 0,
          outputTokens: 0,
          totalUsd: 0,
          contextWindow: 0,
          contextInputTokens: 0,
          maxOutputTokens: 0,
        },
        createdAt: 0,
        updatedAt: 0,
      })
      const messages = new Map()
      messages.set(sid, [])
      useSessionStore.setState({ sessions, messages })
    }

    function getSystemMsg(): { type: string; content: string } | undefined {
      const msgs = useSessionStore.getState().messages.get(sid) as
        | Array<{ type: string; content: string }>
        | undefined
      return msgs?.find((m) => m.type === 'system')
    }

    test('status command appends system message with model, cwd, and permissionMode', () => {
      seedSession()
      const cmd = findCommand('status')
      expect(cmd).toBeDefined()
      cmd?.execute(fullContext)

      const systemMsg = getSystemMsg()
      expect(systemMsg).toBeDefined()
      expect(systemMsg?.content).toContain('claude-opus-4-6')
      expect(systemMsg?.content).toContain('/test')
      expect(systemMsg?.content).toContain('default')
    })

    test('help command appends system message listing available commands', () => {
      seedSession()
      const cmd = findCommand('help')
      expect(cmd).toBeDefined()
      cmd?.execute(fullContext)

      const systemMsg = getSystemMsg()
      expect(systemMsg).toBeDefined()
      expect(systemMsg?.content).toContain('Available commands')
      expect(systemMsg?.content).toContain('/clear')
      expect(systemMsg?.content).toContain('/commit')
    })

    test('config command opens settings overlay', () => {
      useUiStore.setState({ settingsOpen: false })
      const cmd = findCommand('config')
      expect(cmd).toBeDefined()
      cmd?.execute(noSessionContext)
      expect(useUiStore.getState().settingsOpen).toBe(true)
    })

    test('status command is a no-op when sessionId is null', () => {
      const cmd = findCommand('status')
      cmd?.execute(noSessionContext)
    })

    test('help command is a no-op when sessionId is null', () => {
      const cmd = findCommand('help')
      cmd?.execute(noSessionContext)
    })
  })

  describe('command metadata', () => {
    test('every command has an icon', () => {
      for (const cmd of COMMANDS) {
        expect(cmd.icon).toBeDefined()
      }
    })

    test('every command has a section', () => {
      for (const cmd of COMMANDS) {
        expect(['session', 'global']).toContain(cmd.section)
      }
    })

    test('session commands require session, global commands do not', () => {
      for (const cmd of COMMANDS) {
        if (cmd.section === 'session') {
          expect(cmd.requiresSession).toBe(true)
        } else {
          expect(cmd.requiresSession).toBe(false)
        }
      }
    })
  })
})
