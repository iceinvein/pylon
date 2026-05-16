import { ChevronDown } from 'lucide-react'
import { useMemo } from 'react'
import type { EffortLevel } from '../../../shared/types'
import {
  defaultModelForProvider,
  providerForModel,
  type ProviderId,
  type ProviderModelEntry,
} from '../lib/provider-models'

type ProviderModelPickerProps = {
  models: ProviderModelEntry[]
  provider: ProviderId
  model: string
  effort: EffortLevel
  onSelectionChange: (provider: ProviderId, model: string, effort: EffortLevel) => void
  disabled?: boolean
}

const PROVIDERS: Array<{ id: ProviderId; label: string }> = [
  { id: 'claude', label: 'Claude' },
  { id: 'codex', label: 'Codex' },
]

const EFFORT_LABELS: Record<EffortLevel, string> = {
  low: 'Low',
  medium: 'Med',
  high: 'High',
  xhigh: 'xHigh',
  max: 'Max',
}

const DEFAULT_EFFORTS: EffortLevel[] = ['low', 'medium', 'high']

function modelEfforts(model: string, models: ProviderModelEntry[]): EffortLevel[] {
  const efforts = models.find((entry) => entry.id === model)?.supportsEffort
  return efforts?.length ? efforts : DEFAULT_EFFORTS
}

function clampEffortToOptions(effort: EffortLevel, options: EffortLevel[]): EffortLevel {
  if (options.includes(effort)) return effort
  if (options.includes('high')) return 'high'
  return options[0] ?? 'high'
}

export function resolveProviderModelPickerState({
  models,
  provider,
  model,
  effort,
  disabled = false,
}: {
  models: ProviderModelEntry[]
  provider: ProviderId
  model: string
  effort: EffortLevel
  disabled?: boolean
}) {
  const providerModels = models.filter((entry) => entry.provider === provider)
  const defaultModel = defaultModelForProvider(provider, models)
  const selectedModel =
    providerModels.find((entry) => entry.id === model)?.id ??
    providerModels.find((entry) => entry.id === defaultModel)?.id ??
    providerModels[0]?.id ??
    ''
  const effortOptions = selectedModel ? modelEfforts(selectedModel, models) : DEFAULT_EFFORTS
  const selectedEffort = clampEffortToOptions(effort, effortOptions)
  const hasModelOptions = providerModels.length > 0

  return {
    providerModels,
    selectedModel,
    effortOptions,
    selectedEffort,
    modelSelectDisabled: disabled || !hasModelOptions,
    effortSelectDisabled: disabled || !hasModelOptions,
  }
}

export function ProviderModelPicker({
  models,
  provider,
  model,
  effort,
  onSelectionChange,
  disabled = false,
}: ProviderModelPickerProps) {
  const pickerState = useMemo(
    () => resolveProviderModelPickerState({ models, provider, model, effort, disabled }),
    [disabled, effort, model, models, provider],
  )
  const {
    providerModels,
    selectedModel,
    effortOptions,
    selectedEffort,
    modelSelectDisabled,
    effortSelectDisabled,
  } = pickerState

  function selectProvider(nextProvider: ProviderId) {
    const nextProviderModels = models.filter((entry) => entry.provider === nextProvider)
    if (nextProviderModels.length === 0) return
    const defaultModel = defaultModelForProvider(nextProvider, models)
    const nextModel =
      nextProviderModels.find((entry) => entry.id === defaultModel)?.id ?? nextProviderModels[0]?.id
    if (!nextModel) return
    const nextEffort = clampEffortToOptions(effort, modelEfforts(nextModel, models))
    onSelectionChange(nextProvider, nextModel, nextEffort)
  }

  function selectModel(nextModel: string) {
    if (!nextModel) return
    const nextProvider = providerForModel(nextModel, models) ?? provider
    const nextEffort = clampEffortToOptions(effort, modelEfforts(nextModel, models))
    onSelectionChange(nextProvider, nextModel, nextEffort)
  }

  function selectEffort(nextEffort: EffortLevel) {
    if (!selectedModel) return
    onSelectionChange(
      provider,
      selectedModel,
      clampEffortToOptions(nextEffort, modelEfforts(selectedModel, models)),
    )
  }

  return (
    <div className="flex h-7 shrink-0 items-center gap-1.5">
      <div className="flex h-7 w-[7.5rem] shrink-0 overflow-hidden rounded-md border border-base-border/70">
        {PROVIDERS.map((entry) => {
          const isSelected = entry.id === provider
          const hasModels = models.some((modelEntry) => modelEntry.provider === entry.id)
          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => selectProvider(entry.id)}
              disabled={disabled || !hasModels}
              className={`h-full flex-1 px-2 text-xs transition-colors ${
                isSelected
                  ? 'bg-base-raised text-base-text'
                  : 'text-base-text-muted hover:bg-base-bg-subtle hover:text-base-text disabled:cursor-not-allowed disabled:opacity-40'
              }`}
            >
              {entry.label}
            </button>
          )
        })}
      </div>

      <label className="relative h-7 w-[9.5rem] shrink-0">
        <span className="sr-only">AST agent model</span>
        <select
          value={selectedModel}
          onChange={(event) => selectModel(event.target.value)}
          disabled={modelSelectDisabled}
          className="h-full w-full appearance-none truncate rounded-md border border-base-border/70 bg-base-bg pr-6 pl-2 text-base-text-secondary text-xs transition-colors hover:border-base-border hover:text-base-text focus:border-accent-text focus:outline-none disabled:opacity-50"
          title="AST agent model"
        >
          {providerModels.length === 0 && (
            <option value="" disabled>
              No models
            </option>
          )}
          {providerModels.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.label}
            </option>
          ))}
        </select>
        <ChevronDown
          size={12}
          className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-base-text-muted"
        />
      </label>

      <label className="relative h-7 w-20 shrink-0">
        <span className="sr-only">AST agent effort</span>
        <select
          value={selectedEffort}
          onChange={(event) => selectEffort(event.target.value as EffortLevel)}
          disabled={effortSelectDisabled}
          className="h-full w-full appearance-none rounded-md border border-base-border/70 bg-base-bg pr-6 pl-2 text-base-text-secondary text-xs transition-colors hover:border-base-border hover:text-base-text focus:border-accent-text focus:outline-none disabled:opacity-50"
          title="AST agent effort"
        >
          {effortOptions.map((entry) => (
            <option key={entry} value={entry}>
              {EFFORT_LABELS[entry]}
            </option>
          ))}
        </select>
        <ChevronDown
          size={12}
          className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-base-text-muted"
        />
      </label>
    </div>
  )
}
