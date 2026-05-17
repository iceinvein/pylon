import { providerLabel } from '../shared/provider-models'
import { type EffortLevel, isEffortLevel } from '../shared/types'
import { getProviderForModel } from './providers'
import type { AgentProvider } from './providers/types'

const FEATURE_DEFAULTS = {
  ast: { model: 'claude-opus-4-7', effort: 'high' as EffortLevel },
  testing: { model: 'claude-opus-4-7', effort: 'high' as EffortLevel },
}

export type FeatureAgentFeature = keyof typeof FEATURE_DEFAULTS

export function resolveFeatureAgent(args: {
  feature: FeatureAgentFeature
  requestedModel?: string
  requestedEffort?: unknown
}): { model: string; effort: EffortLevel; provider: AgentProvider; label: string } {
  const defaults = FEATURE_DEFAULTS[args.feature]
  const requestedModel = args.requestedModel?.trim() || defaults.model
  const requestedEffort = isEffortLevel(args.requestedEffort)
    ? args.requestedEffort
    : defaults.effort
  const provider = getProviderForModel(requestedModel)
  if (provider) {
    return {
      model: requestedModel,
      effort: requestedEffort,
      provider,
      label: providerLabel(provider.id),
    }
  }

  const defaultProvider = getProviderForModel(defaults.model)
  if (!defaultProvider) {
    throw new Error(`No provider found for ${args.feature} model: ${requestedModel}`)
  }

  return {
    model: defaults.model,
    effort: defaults.effort,
    provider: defaultProvider,
    label: providerLabel(defaultProvider.id),
  }
}
