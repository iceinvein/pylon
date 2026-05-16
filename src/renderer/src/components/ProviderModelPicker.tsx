import { ChevronDown } from 'lucide-react'
import { useMemo } from 'react'
import type { EffortLevel } from '../../../shared/types'
import {
  clampEffortForModel,
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
  return models.find((entry) => entry.id === model)?.supportsEffort ?? DEFAULT_EFFORTS
}

export function ProviderModelPicker({
  models,
  provider,
  model,
  effort,
  onSelectionChange,
  disabled = false,
}: ProviderModelPickerProps) {
  const providerModels = useMemo(
    () => models.filter((entry) => entry.provider === provider),
    [models, provider],
  )
  const selectedModel =
    providerModels.find((entry) => entry.id === model)?.id ??
    defaultModelForProvider(provider, models)
  const effortOptions = modelEfforts(selectedModel, models)
  const selectedEffort = clampEffortForModel(selectedModel, effort, models)

  function selectProvider(nextProvider: ProviderId) {
    const nextModel = defaultModelForProvider(nextProvider, models)
    const nextEffort = clampEffortForModel(nextModel, effort, models)
    onSelectionChange(nextProvider, nextModel, nextEffort)
  }

  function selectModel(nextModel: string) {
    const nextProvider = providerForModel(nextModel, models) ?? provider
    const nextEffort = clampEffortForModel(nextModel, effort, models)
    onSelectionChange(nextProvider, nextModel, nextEffort)
  }

  function selectEffort(nextEffort: EffortLevel) {
    onSelectionChange(provider, selectedModel, clampEffortForModel(selectedModel, nextEffort, models))
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
          disabled={disabled}
          className="h-full w-full appearance-none truncate rounded-md border border-base-border/70 bg-base-bg pr-6 pl-2 text-base-text-secondary text-xs transition-colors hover:border-base-border hover:text-base-text focus:border-accent-text focus:outline-none disabled:opacity-50"
          title="AST agent model"
        >
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
          disabled={disabled}
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
