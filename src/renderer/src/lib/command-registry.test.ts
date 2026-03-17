import { describe, expect, test } from 'bun:test'
import type { CommandContext } from './command-registry'
import { COMMANDS, findCommand, getCommands } from './command-registry'

const fullContext: CommandContext = {
  sessionId: 'test-session-123',
  activeTabId: 'tab-1',
  cwd: '/Users/test/project',
  model: 'claude-opus-4-6',
  permissionMode: 'default',
}

const noSessionContext: CommandContext = {
  sessionId: null,
  activeTabId: null,
  cwd: null,
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
})
