import { describe, expect, test } from 'bun:test'
import { getProviderSetupError, isClaudeSetupError } from './setup-errors'

describe('provider setup errors', () => {
  test('returns Claude setup metadata for existing Claude Code setup errors', () => {
    expect(getProviderSetupError('Claude Code CLI not found. Install Claude Code.')).toEqual({
      provider: 'claude',
      title: 'Claude Code Required',
      description:
        'This action requires Claude Code to be installed on your machine. Make sure the `claude` command works in Terminal, then retry.',
      actionLabel: 'Install Claude Code',
      actionUrl: 'https://code.claude.com/docs',
      command: 'claude',
    })
  })

  test('returns Codex setup metadata for Codex CLI auth errors', () => {
    expect(getProviderSetupError('Codex auth failed: codex command not found')).toEqual({
      provider: 'codex',
      title: 'Codex Required',
      description:
        'This action requires Codex to be installed and authenticated on your machine. Make sure the `codex` command works in Terminal, then retry.',
      actionLabel: 'Install Codex',
      actionUrl: 'https://developers.openai.com/codex/cli',
      command: 'codex',
    })
  })

  test('returns null for non-setup errors', () => {
    expect(getProviderSetupError('Codex credit exhausted')).toBeNull()
    expect(getProviderSetupError(null)).toBeNull()
    expect(getProviderSetupError()).toBeNull()
  })

  test('preserves Claude setup boolean compatibility', () => {
    expect(isClaudeSetupError('Claude Code CLI not found')).toBe(true)
    expect(isClaudeSetupError('Codex auth failed: codex command not found')).toBe(false)
  })
})
