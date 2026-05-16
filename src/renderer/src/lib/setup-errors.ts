export type ProviderSetupError = {
  provider: 'claude' | 'codex'
  title: string
  description: string
  actionLabel: string
  actionUrl: string
  command: string
}

const CLAUDE_SETUP_ERROR: ProviderSetupError = {
  provider: 'claude',
  title: 'Claude Code Required',
  description:
    'This action requires Claude Code to be installed on your machine. Make sure the `claude` command works in Terminal, then retry.',
  actionLabel: 'Install Claude Code',
  actionUrl: 'https://code.claude.com/docs',
  command: 'claude',
}

const CODEX_SETUP_ERROR: ProviderSetupError = {
  provider: 'codex',
  title: 'Codex Required',
  description:
    'This action requires Codex to be installed and authenticated on your machine. Make sure the `codex` command works in Terminal, then retry.',
  actionLabel: 'Install Codex',
  actionUrl: 'https://developers.openai.com/codex/cli',
  command: 'codex',
}

export function getProviderSetupError(message?: string | null): ProviderSetupError | null {
  if (!message) return null

  const normalized = message.toLowerCase()
  if (normalized.includes('claude code cli not found')) return CLAUDE_SETUP_ERROR

  const mentionsCodexSetup =
    normalized.includes('codex command not found') ||
    normalized.includes('codex cli not found') ||
    (normalized.includes('codex auth failed') && normalized.includes('command not found'))

  if (mentionsCodexSetup) return CODEX_SETUP_ERROR

  return null
}

export function isClaudeSetupError(message?: string | null): boolean {
  return getProviderSetupError(message)?.provider === 'claude'
}
