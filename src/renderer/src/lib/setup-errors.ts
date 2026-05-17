import {
  PROVIDER_SETUP_ERRORS,
  type ProviderSetupError,
} from '../../../shared/provider-setup-errors'

export type { ProviderSetupError } from '../../../shared/provider-setup-errors'

export function getProviderSetupError(message?: string | null): ProviderSetupError | null {
  if (!message) return null

  const normalized = message.toLowerCase()
  if (normalized.includes('claude code cli not found')) {
    return PROVIDER_SETUP_ERRORS['claude-cli-missing']
  }

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

  if (mentionsCodexExecutableMissing) return PROVIDER_SETUP_ERRORS['codex-cli-missing']

  if (hasCodexContext && mentionsAuthFailure) {
    return PROVIDER_SETUP_ERRORS['codex-auth-missing']
  }

  return null
}

export function isClaudeSetupError(message?: string | null): boolean {
  return getProviderSetupError(message)?.provider === 'claude'
}
