import type { ProviderId } from './provider-models'

export type ProviderSetupErrorCode =
  | 'claude-cli-missing'
  | 'codex-cli-missing'
  | 'codex-auth-missing'

export type ProviderSetupError = {
  code: ProviderSetupErrorCode
  provider: ProviderId
  title: string
  description: string
  actionLabel: string
  actionUrl: string
  command: string
}

export const PROVIDER_SETUP_ERRORS: Record<ProviderSetupErrorCode, ProviderSetupError> = {
  'claude-cli-missing': {
    code: 'claude-cli-missing',
    provider: 'claude',
    title: 'Claude Code Required',
    description:
      'This action requires Claude Code to be installed on your machine. Make sure the `claude` command works in Terminal, then retry.',
    actionLabel: 'Install Claude Code',
    actionUrl: 'https://code.claude.com/docs',
    command: 'claude',
  },
  'codex-cli-missing': {
    code: 'codex-cli-missing',
    provider: 'codex',
    title: 'Codex Required',
    description:
      'This action requires Codex to be installed on your machine. Make sure the `codex` command works in Terminal, then retry.',
    actionLabel: 'Install Codex',
    actionUrl: 'https://developers.openai.com/codex/cli',
    command: 'codex',
  },
  'codex-auth-missing': {
    code: 'codex-auth-missing',
    provider: 'codex',
    title: 'Codex Login Required',
    description: 'This action requires Codex authentication. Run `codex login`, then retry.',
    actionLabel: 'Codex Setup',
    actionUrl: 'https://developers.openai.com/codex/cli',
    command: 'codex login',
  },
}
