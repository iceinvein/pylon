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

  const hasCodexContext = normalized.includes('codex') || normalized.includes('openai')
  const mentionsCodexExecutableMissing =
    /\bcodex(?:\s+(?:command|cli))?\s+(?:not found|is not found)\b/.test(normalized) ||
    /\bcodex:\s*command not found\b/.test(normalized) ||
    /\bcommand not found:\s*codex\b/.test(normalized)
  const mentionsUnauthorizedFailure =
    normalized.includes('401 unauthorized') ||
    normalized.includes('missing bearer') ||
    normalized.includes('basic authentication')
  const mentionsAuthOrLoginFailure =
    normalized.includes('not authenticated') ||
    normalized.includes('authentication failed') ||
    normalized.includes('auth failed') ||
    normalized.includes('login required')
  const mentionsAuthFailure =
    mentionsUnauthorizedFailure ||
    (mentionsAuthOrLoginFailure && !normalized.includes('command not found'))

  const mentionsCodexSetup =
    mentionsCodexExecutableMissing || (hasCodexContext && mentionsAuthFailure)

  if (mentionsCodexSetup) return CODEX_SETUP_ERROR

  return null
}

export function isClaudeSetupError(message?: string | null): boolean {
  return getProviderSetupError(message)?.provider === 'claude'
}
