import type { EffortLevel } from '../../../shared/types'

export type ProviderId = 'claude' | 'codex'

export type ProviderModelEntry = {
  id: string
  label: string
  provider: ProviderId
  supportsEffort?: EffortLevel[]
}

export const FALLBACK_PROVIDER_MODELS: ProviderModelEntry[] = [
  {
    id: 'claude-opus-4-7',
    label: 'Opus 4.7',
    provider: 'claude',
    supportsEffort: ['low', 'medium', 'high', 'xhigh', 'max'],
  },
  {
    id: 'claude-opus-4-6',
    label: 'Opus 4.6',
    provider: 'claude',
    supportsEffort: ['low', 'medium', 'high', 'max'],
  },
  {
    id: 'claude-sonnet-4-6',
    label: 'Sonnet 4.6',
    provider: 'claude',
    supportsEffort: ['low', 'medium', 'high'],
  },
  {
    id: 'claude-haiku-4-5',
    label: 'Haiku 4.5',
    provider: 'claude',
    supportsEffort: ['low', 'medium', 'high'],
  },
  {
    id: 'gpt-5.5',
    label: 'GPT-5.5',
    provider: 'codex',
    supportsEffort: ['low', 'medium', 'high', 'xhigh', 'max'],
  },
  {
    id: 'gpt-5.4',
    label: 'GPT-5.4',
    provider: 'codex',
    supportsEffort: ['low', 'medium', 'high', 'max'],
  },
  {
    id: 'gpt-5.4-mini',
    label: 'GPT-5.4 Mini',
    provider: 'codex',
    supportsEffort: ['low', 'medium', 'high', 'max'],
  },
  {
    id: 'gpt-5.3-codex',
    label: 'GPT-5.3 Codex',
    provider: 'codex',
    supportsEffort: ['low', 'medium', 'high', 'max'],
  },
  {
    id: 'gpt-5.3-codex-spark',
    label: 'GPT-5.3 Codex Spark',
    provider: 'codex',
    supportsEffort: ['low', 'medium', 'high', 'max'],
  },
]

const PROVIDER_DEFAULTS: Record<ProviderId, string> = {
  claude: 'claude-opus-4-7',
  codex: 'gpt-5.5',
}

const EFFORT_ORDER: EffortLevel[] = ['low', 'medium', 'high', 'xhigh', 'max']

export function isProviderId(value: unknown): value is ProviderId {
  return value === 'claude' || value === 'codex'
}

export function isEffortLevel(value: unknown): value is EffortLevel {
  return (
    value === 'low' ||
    value === 'medium' ||
    value === 'high' ||
    value === 'xhigh' ||
    value === 'max'
  )
}

export function providerLabel(provider: ProviderId): string {
  return provider === 'codex' ? 'Codex' : 'Claude Code'
}

export function providerForModel(
  modelId: string,
  models: ProviderModelEntry[],
): ProviderId | undefined {
  return models.find((model) => model.id === modelId)?.provider
}

export function defaultModelForProvider(
  provider: ProviderId,
  models: ProviderModelEntry[],
): string {
  return (
    models.find((model) => model.provider === provider && model.id === PROVIDER_DEFAULTS[provider])
      ?.id ??
    models.find((model) => model.provider === provider)?.id ??
    PROVIDER_DEFAULTS[provider]
  )
}

export function clampEffortForModel(
  modelId: string,
  effort: EffortLevel,
  models: ProviderModelEntry[],
): EffortLevel {
  const supported = models.find((model) => model.id === modelId)?.supportsEffort
  if (!supported?.length || supported.includes(effort)) return effort
  for (const candidate of [...EFFORT_ORDER].reverse()) {
    if (supported.includes(candidate)) return candidate
  }
  return 'high'
}

export function normalizeProviderModels(models: unknown[]): ProviderModelEntry[] {
  const normalized = models.flatMap((raw): ProviderModelEntry[] => {
    if (!raw || typeof raw !== 'object') return []

    const model = raw as Record<string, unknown>
    if (
      typeof model.id !== 'string' ||
      typeof model.label !== 'string' ||
      !isProviderId(model.provider)
    ) {
      return []
    }

    const supportsEffort = Array.isArray(model.supportsEffort)
      ? model.supportsEffort.filter(isEffortLevel)
      : undefined

    return [
      {
        id: model.id,
        label: model.label,
        provider: model.provider,
        supportsEffort,
      },
    ]
  })
  return normalized.length > 0 ? normalized : FALLBACK_PROVIDER_MODELS
}

export function resolveFeatureAgentSelection(input: {
  persistedModel?: string
  persistedProvider?: unknown
  persistedEffort?: unknown
  appDefaultModel?: string
  appDefaultEffort?: unknown
  models: ProviderModelEntry[]
}): { provider: ProviderId; model: string; effort: EffortLevel } {
  const modelExists = input.persistedModel
    ? input.models.some((model) => model.id === input.persistedModel)
    : false
  const appDefaultModelExists = input.appDefaultModel
    ? input.models.some((model) => model.id === input.appDefaultModel)
    : false
  const persistedProvider = isProviderId(input.persistedProvider)
    ? input.persistedProvider
    : undefined
  const provider =
    (modelExists && input.persistedModel
      ? providerForModel(input.persistedModel, input.models)
      : undefined) ??
    persistedProvider ??
    (input.appDefaultModel ? providerForModel(input.appDefaultModel, input.models) : undefined) ??
    'claude'
  const model =
    modelExists && input.persistedModel
      ? input.persistedModel
      : !persistedProvider && appDefaultModelExists && input.appDefaultModel
        ? input.appDefaultModel
        : defaultModelForProvider(provider, input.models)
  const requestedEffort = isEffortLevel(input.persistedEffort)
    ? input.persistedEffort
    : isEffortLevel(input.appDefaultEffort)
      ? input.appDefaultEffort
      : 'high'
  const effort = clampEffortForModel(model, requestedEffort, input.models)

  return { provider, model, effort }
}
