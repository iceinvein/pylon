import { useCallback, useRef, useState } from 'react'
import {
  FALLBACK_PROVIDER_MODELS,
  normalizeProviderModels,
  type ProviderId,
  type ProviderModelEntry,
  providerForModelId,
  resolveFeatureAgentSelection,
} from '../../../shared/provider-models'
import type { AppSettings, EffortLevel } from '../../../shared/types'

type FeatureAgentSettings = {
  modelKey: 'astAgentModel' | 'testingAgentModel'
  effortKey: 'astAgentEffort' | 'testingAgentEffort'
}

type StoreSnapshot = {
  agentModel: string
  agentEffort: EffortLevel
  agentSelectionRevision: number
}

type AgentSelection = {
  provider: ProviderId
  model: string
  effort: EffortLevel
}

type LoadedAgentSelection = {
  models: ProviderModelEntry[]
  selection: AgentSelection
}

export function useFeatureAgentSelection({
  settings,
  getSnapshot,
  applySelection,
}: {
  settings: FeatureAgentSettings
  getSnapshot: () => StoreSnapshot
  applySelection: (provider: ProviderId, model: string, effort: EffortLevel) => void
}) {
  const [providerModels, setProviderModels] =
    useState<ProviderModelEntry[]>(FALLBACK_PROVIDER_MODELS)
  const requestRef = useRef(0)
  const baseRevisionRef = useRef(getSnapshot().agentSelectionRevision)
  const loadRef = useRef<Promise<LoadedAgentSelection> | null>(null)

  const loadAgentSelection = useCallback(async () => {
    const requestId = requestRef.current + 1
    requestRef.current = requestId
    const startRevision = getSnapshot().agentSelectionRevision

    loadRef.current ??= Promise.allSettled([
      window.api.getProviderModels(),
      window.api.getSettings(),
    ])
      .then(([modelsResult, settingsResult]) => {
        const models =
          modelsResult.status === 'fulfilled'
            ? normalizeProviderModels(modelsResult.value)
            : FALLBACK_PROVIDER_MODELS
        const appSettings =
          settingsResult.status === 'fulfilled' && settingsResult.value
            ? (settingsResult.value as Partial<AppSettings>)
            : {}
        const selection = resolveFeatureAgentSelection({
          persistedModel: appSettings[settings.modelKey],
          persistedEffort: appSettings[settings.effortKey],
          appDefaultModel: appSettings.defaultModel,
          appDefaultEffort: appSettings.defaultEffort,
          models,
        })
        return { models, selection }
      })
      .finally(() => {
        loadRef.current = null
      })

    const { models, selection } = await loadRef.current
    const current = getSnapshot()
    const canApplySelection =
      requestRef.current === requestId &&
      current.agentSelectionRevision === startRevision &&
      startRevision === baseRevisionRef.current

    setProviderModels(models)
    if (canApplySelection) {
      applySelection(selection.provider, selection.model, selection.effort)
      baseRevisionRef.current = getSnapshot().agentSelectionRevision
      return selection
    }

    return {
      provider: providerForModelId(current.agentModel, models) ?? selection.provider,
      model: current.agentModel,
      effort: current.agentEffort,
    }
  }, [applySelection, getSnapshot, settings.effortKey, settings.modelKey])

  const markExternalReset = useCallback(() => {
    baseRevisionRef.current = getSnapshot().agentSelectionRevision
  }, [getSnapshot])

  return { providerModels, setProviderModels, loadAgentSelection, markExternalReset }
}
