export type ProviderDisplayName = 'Claude' | 'Codex'

export function getAssistantDisplayName(model?: string | null): ProviderDisplayName {
  const normalized = model?.trim().toLowerCase() ?? ''

  if (normalized.startsWith('gpt-') || normalized.startsWith('o') || normalized.includes('codex')) {
    return 'Codex'
  }

  return 'Claude'
}
