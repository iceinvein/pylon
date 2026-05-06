import {
  Blocks,
  Bot,
  Bug,
  Code2,
  Gauge,
  Monitor,
  Paintbrush,
  Play,
  Shield,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { EffortLevel, ReviewFocus } from '../../../../shared/types'
import { DropdownMenu } from '../DropdownMenu'

type Props = {
  onStart: (focus: ReviewFocus[], agentModel: string, agentEffort: EffortLevel) => void
  onClose: () => void
  isRerun?: boolean
}

type ReviewAgentProvider = 'claude' | 'codex'

type ProviderModelEntry = {
  id: string
  label: string
  provider: string
  supportsEffort: EffortLevel[]
}

const FALLBACK_MODELS: ProviderModelEntry[] = [
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

export const DEFAULT_REVIEW_AGENT_MODEL = 'claude-opus-4-7'
export const DEFAULT_REVIEW_AGENT_EFFORT: EffortLevel = 'high'
const DEFAULT_CODEX_REVIEW_AGENT_MODEL = 'gpt-5.5'

const EFFORT_LEVELS: Array<{ id: EffortLevel; label: string }> = [
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
  { id: 'xhigh', label: 'xHigh' },
  { id: 'max', label: 'Max' },
]

const FOCUS_OPTIONS: Array<{
  id: ReviewFocus
  label: string
  description: string
  icon: typeof Shield
}> = [
  {
    id: 'security',
    label: 'Security',
    description: 'Vulnerabilities, injection, auth issues',
    icon: Shield,
  },
  {
    id: 'bugs',
    label: 'Bugs',
    description: 'Logic errors, edge cases, race conditions',
    icon: Bug,
  },
  {
    id: 'performance',
    label: 'Performance',
    description: 'Bottlenecks, memory leaks, N+1 queries',
    icon: Gauge,
  },
  {
    id: 'code-smells',
    label: 'Code Smells',
    description: 'Duplication, brittle complexity, weak abstractions',
    icon: Code2,
  },
  {
    id: 'style',
    label: 'Style',
    description: 'Naming, formatting, code organization',
    icon: Paintbrush,
  },
  {
    id: 'architecture',
    label: 'Architecture',
    description: 'Design patterns, coupling, API contracts, SOLID',
    icon: Blocks,
  },
  {
    id: 'ux',
    label: 'UX',
    description: 'Error messages, loading states, accessibility, edge cases',
    icon: Monitor,
  },
]

export const DEFAULT_REVIEW_FOCUS: ReviewFocus[] = [
  'security',
  'bugs',
  'performance',
  'code-smells',
  'architecture',
]

function defaultModelForProvider(provider: ReviewAgentProvider): string {
  return provider === 'codex' ? DEFAULT_CODEX_REVIEW_AGENT_MODEL : DEFAULT_REVIEW_AGENT_MODEL
}

export function ReviewModal({ onStart, onClose, isRerun }: Props) {
  const [selected, setSelected] = useState<ReviewFocus[]>(DEFAULT_REVIEW_FOCUS)
  const [agentProvider, setAgentProvider] = useState<ReviewAgentProvider>('claude')
  const [agentModel, setAgentModel] = useState(DEFAULT_REVIEW_AGENT_MODEL)
  const [agentEffort, setAgentEffort] = useState<EffortLevel>(DEFAULT_REVIEW_AGENT_EFFORT)
  const [providerModels, setProviderModels] = useState<ProviderModelEntry[]>(FALLBACK_MODELS)

  useEffect(() => {
    window.api
      .getProviderModels()
      .then((models) => {
        if (models?.length) {
          setProviderModels(
            models.map((m) => ({
              id: m.id,
              label: m.label,
              provider: m.provider,
              supportsEffort: m.supportsEffort as EffortLevel[],
            })),
          )
        }
      })
      .catch(() => {})
  }, [])

  const agentModels = useMemo(
    () => providerModels.filter((m) => m.provider === agentProvider),
    [providerModels, agentProvider],
  )
  const effortOptions = useMemo(() => {
    const selectedModel = providerModels.find((m) => m.id === agentModel)
    return EFFORT_LEVELS.filter((e) =>
      (selectedModel?.supportsEffort ?? ['low', 'medium', 'high']).includes(e.id),
    )
  }, [agentModel, providerModels])

  useEffect(() => {
    if (effortOptions.some((e) => e.id === agentEffort)) return
    const fallback = effortOptions.find((e) => e.id === DEFAULT_REVIEW_AGENT_EFFORT)
    setAgentEffort(fallback?.id ?? effortOptions[0]?.id ?? DEFAULT_REVIEW_AGENT_EFFORT)
  }, [agentEffort, effortOptions])

  function toggle(id: ReviewFocus) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]))
  }

  function selectProvider(provider: ReviewAgentProvider) {
    setAgentProvider(provider)
    const nextModel =
      providerModels.find(
        (m) => m.provider === provider && m.id === defaultModelForProvider(provider),
      )?.id ??
      providerModels.find((m) => m.provider === provider)?.id ??
      defaultModelForProvider(provider)
    setAgentModel(nextModel)
  }

  return (
    <div
      role="dialog"
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
      }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" />

      {/* Modal */}
      <div
        className="relative w-full max-w-lg rounded-xl border border-base-border bg-base-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-base-border-subtle border-b px-5 py-3.5">
          <h3 className="font-semibold text-base-text text-sm">
            {isRerun ? 'Re-run Review' : 'Start Review'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-base-text-muted transition-colors hover:bg-base-raised hover:text-base-text"
          >
            <X size={14} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div>
            <p className="mb-3 font-medium text-base-text-muted text-xs uppercase tracking-wider">
              Agent
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {(
                [
                  { id: 'claude' as const, label: 'Claude Code' },
                  { id: 'codex' as const, label: 'Codex' },
                ] satisfies Array<{ id: ReviewAgentProvider; label: string }>
              ).map((opt) => {
                const isSelected = agentProvider === opt.id
                return (
                  <button
                    type="button"
                    key={opt.id}
                    onClick={() => selectProvider(opt.id)}
                    className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 font-medium text-[12px] transition-colors ${
                      isSelected
                        ? 'bg-base-raised text-base-text ring-1 ring-base-border'
                        : 'text-base-text-muted hover:bg-base-raised/50 hover:text-base-text'
                    }`}
                  >
                    <Bot size={12} />
                    {opt.label}
                  </button>
                )
              })}
            </div>
            <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
              <DropdownMenu
                items={
                  agentModels.length > 0
                    ? agentModels.map((model) => ({ id: model.id, label: model.label }))
                    : [{ id: agentModel, label: agentModel }]
                }
                value={agentModel}
                onChange={setAgentModel}
                placement="bottom"
                triggerClassName="flex h-8 w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-base-border bg-base-bg px-3 text-base-text-secondary text-xs transition-colors hover:bg-base-raised hover:text-base-text"
                minWidth={220}
              />
              <DropdownMenu
                items={effortOptions.map((effort) => ({
                  id: effort.id,
                  label: `${effort.label} effort`,
                }))}
                value={agentEffort}
                onChange={(id) => setAgentEffort(id as EffortLevel)}
                placement="bottom"
                triggerIcon={<SlidersHorizontal size={13} />}
                triggerClassName="flex h-8 items-center justify-between gap-2 rounded-lg border border-base-border bg-base-bg px-3 text-base-text-secondary text-xs transition-colors hover:bg-base-raised hover:text-base-text"
                minWidth={150}
              />
            </div>
          </div>

          <p className="mb-3 font-medium text-base-text-muted text-xs uppercase tracking-wider">
            Focus areas
          </p>
          <div className="space-y-1.5">
            {FOCUS_OPTIONS.map((opt) => {
              const Icon = opt.icon
              const isSelected = selected.includes(opt.id)
              return (
                <button
                  type="button"
                  key={opt.id}
                  onClick={() => toggle(opt.id)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all ${
                    isSelected
                      ? 'bg-base-raised ring-1 ring-base-border'
                      : 'hover:bg-base-raised/50'
                  }`}
                >
                  <div
                    className={`flex h-5 w-5 items-center justify-center rounded ${
                      isSelected
                        ? 'bg-base-text text-base-bg'
                        : 'border border-base-border text-base-text-faint'
                    }`}
                  >
                    {isSelected && <Icon size={11} strokeWidth={2.5} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Icon
                        size={12}
                        className={isSelected ? 'text-base-text' : 'text-base-text-muted'}
                      />
                      <span
                        className={`font-medium text-[12px] ${isSelected ? 'text-base-text' : 'text-base-text-secondary'}`}
                      >
                        {opt.label}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[10px] text-base-text-muted">{opt.description}</p>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-base-border-subtle border-t px-5 py-3.5">
          <span className="text-base-text-muted text-xs">
            {selected.length} area{selected.length !== 1 ? 's' : ''} selected
          </span>
          <button
            type="button"
            onClick={() => {
              onStart(selected, agentModel, agentEffort)
              onClose()
            }}
            disabled={selected.length === 0}
            className="flex items-center gap-1.5 rounded-lg bg-base-text px-4 py-2 font-semibold text-[12px] text-base-bg transition-colors hover:bg-white disabled:opacity-30"
          >
            <Play size={12} />
            {isRerun ? 'Re-run' : 'Start Review'}
          </button>
        </div>
      </div>
    </div>
  )
}
