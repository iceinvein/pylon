import { describe, expect, test } from 'bun:test'
import { getProviderSetupError, isClaudeSetupError } from './setup-errors'

describe('provider setup errors', () => {
  test('returns Claude setup metadata for existing Claude Code setup errors', () => {
    expect(getProviderSetupError('Claude Code CLI not found. Install Claude Code.')).toEqual({
      code: 'claude-cli-missing',
      provider: 'claude',
      title: 'Claude Code Required',
      description:
        'This action requires Claude Code to be installed on your machine. Make sure the `claude` command works in Terminal, then retry.',
      actionLabel: 'Install Claude Code',
      actionUrl: 'https://code.claude.com/docs',
      command: 'claude',
    })
  })

  test('returns Codex setup metadata for Codex CLI missing errors', () => {
    expect(getProviderSetupError('Codex auth failed: codex command not found')).toEqual({
      code: 'codex-cli-missing',
      provider: 'codex',
      title: 'Codex Required',
      description:
        'This action requires Codex to be installed on your machine. Make sure the `codex` command works in Terminal, then retry.',
      actionLabel: 'Install Codex',
      actionUrl: 'https://developers.openai.com/codex/cli',
      command: 'codex',
    })
  })

  test('returns Codex setup metadata for wrapped 401 authentication failures', () => {
    expect(
      getProviderSetupError(
        'Codex auth failed: 401 Unauthorized: Missing bearer or basic authentication',
      )?.provider,
    ).toBe('codex')
  })

  test('returns Codex setup metadata for OpenAI 401 authentication failures', () => {
    expect(
      getProviderSetupError(
        'OpenAI request failed: 401 Unauthorized: Missing bearer or basic authentication',
      )?.provider,
    ).toBe('codex')
  })

  test('returns Codex setup metadata for local provider auth wrapping', () => {
    expect(getProviderSetupError('Codex auth failed')?.provider).toBe('codex')
    expect(getProviderSetupError('Codex auth failed')?.code).toBe('codex-auth-missing')
  })

  test('does not classify unrelated command-not-found errors under Codex context', () => {
    expect(getProviderSetupError('Codex auth failed: gh: command not found')).toBeNull()
  })

  test('does not classify generic 401 errors without Codex or OpenAI context', () => {
    expect(
      getProviderSetupError('401 Unauthorized: Missing bearer or basic authentication'),
    ).toBeNull()
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
