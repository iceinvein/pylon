import { log } from '../shared/logger'
import {
  DEFAULT_FEATURE_AGENT_EFFORT,
  providerLabel,
  resolveFeatureAgentSelection,
} from '../shared/provider-models'
import { type EffortLevel, isEffortLevel } from '../shared/types'
import { getAllModels, getProviderForModel } from './providers/registry'
import type { AgentProvider } from './providers/types'

const logger = log.child('feature-agent-resolver')

type FeatureAgentResolution = {
  model: string
  effort: EffortLevel
  provider?: AgentProvider
  label: string
  fellBack: boolean
}

type ResolveFeatureAgentOptions = {
  requestedModel?: string
  requestedEffort?: unknown
  fallbackUnknownModel?: boolean
  featureName?: string
}

export function resolveFeatureAgent(
  args: ResolveFeatureAgentOptions & { requireProvider: false },
): FeatureAgentResolution
export function resolveFeatureAgent(
  args: ResolveFeatureAgentOptions & { requireProvider?: true },
): FeatureAgentResolution & { provider: AgentProvider }

export function resolveFeatureAgent(
  args: ResolveFeatureAgentOptions & { requireProvider?: boolean },
): FeatureAgentResolution {
  const requestedModel = args.requestedModel?.trim()
  const requestedEffort = isEffortLevel(args.requestedEffort)
    ? args.requestedEffort
    : DEFAULT_FEATURE_AGENT_EFFORT
  if (requestedModel) {
    const provider = getProviderForModel(requestedModel)
    if (provider) {
      return {
        model: requestedModel,
        effort: requestedEffort,
        provider,
        label: providerLabel(provider.id),
        fellBack: false,
      }
    }
  }

  if (requestedModel && args.fallbackUnknownModel === false) {
    return {
      model: requestedModel,
      effort: requestedEffort,
      provider: undefined,
      label: `model ${requestedModel}`,
      fellBack: false,
    }
  }

  const selection = resolveFeatureAgentSelection({
    persistedModel: requestedModel,
    persistedEffort: requestedEffort,
    models: getAllModels(),
  })
  const fallbackProvider = getProviderForModel(selection.model)
  const fellBack = Boolean(requestedModel && selection.model !== requestedModel)
  if (fallbackProvider) {
    if (fellBack) {
      logger.warn(
        `Unknown ${args.featureName ?? 'feature agent'} model "${requestedModel}", falling back to ${selection.model}`,
      )
    }
    return {
      model: selection.model,
      effort: selection.effort,
      provider: fallbackProvider,
      label: providerLabel(fallbackProvider.id),
      fellBack,
    }
  }

  if (args.requireProvider === false) {
    return {
      model: selection.model,
      effort: selection.effort,
      provider: undefined,
      label: `model ${selection.model}`,
      fellBack,
    }
  }

  throw new Error(
    `No provider found for ${args.featureName ?? 'feature agent'} model: ${selection.model}`,
  )
}
