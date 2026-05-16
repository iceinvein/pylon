import {
  AlertTriangle,
  Check,
  ChevronDown,
  Folder,
  Loader2,
  Minus,
  Play,
  Plus,
  X,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  AppSettings,
  EffortLevel,
  ExplorationMode,
  ProjectScan,
  SuggestedGoal,
} from '../../../../shared/types'
import { ProviderModelPicker } from '../ProviderModelPicker'
import {
  FALLBACK_PROVIDER_MODELS,
  normalizeProviderModels,
  type ProviderId,
  type ProviderModelEntry,
  resolveFeatureAgentSelection,
} from '../../lib/provider-models'
import { timeAgo } from '../../lib/utils'
import { useTestStore } from '../../store/test-store'

/* -------------------------------------------------------------------------- */
/*  Step 1 — Project Selection                                                */
/* -------------------------------------------------------------------------- */

function Step1Project({
  projects,
  onSelect,
}: {
  projects: Array<{ path: string; lastUsed: number }>
  onSelect: (cwd: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6">
      <Folder className="mb-4 h-10 w-10 text-base-text-muted" />
      <h2 className="mb-1 font-display font-medium text-base-text text-xl">Choose a project</h2>
      <p className="mb-6 text-base-text-secondary text-sm">
        Select the project you want to explore
      </p>

      <div ref={ref} className="relative w-full max-w-sm">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex w-full items-center justify-between rounded-lg border border-base-border bg-base-raised px-4 py-3 text-left text-base-text text-sm transition-colors hover:border-base-border-hover"
        >
          <span className="text-base-text-muted">Select project...</span>
          <ChevronDown
            className={`h-4 w-4 text-base-text-muted transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </button>

        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15 }}
              className="absolute top-full z-20 mt-1 w-full rounded-lg border border-base-border bg-base-raised shadow-lg"
            >
              {projects.length === 0 ? (
                <p className="px-4 py-3 text-base-text-muted text-sm">No recent projects</p>
              ) : (
                <div className="max-h-64 overflow-y-auto py-1">
                  {projects.map((p) => (
                    <button
                      type="button"
                      key={p.path}
                      onClick={() => {
                        onSelect(p.path)
                        setOpen(false)
                      }}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-base-border/30"
                    >
                      <Folder className="h-4 w-4 shrink-0 text-base-text-muted" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-base-text text-sm">
                          {p.path.split('/').pop()}
                        </p>
                        <p className="truncate text-base-text-faint text-xs">{p.path}</p>
                      </div>
                      <span className="shrink-0 text-base-text-faint text-xs">
                        {timeAgo(p.lastUsed)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Step 2 — Goals                                                            */
/* -------------------------------------------------------------------------- */

function Step2Goals({
  suggestedGoals,
  goalsLoading,
  customGoals,
  onToggle,
  onAddCustom,
  onRemoveCustom,
  onContinue,
  onBack,
}: {
  suggestedGoals: SuggestedGoal[]
  goalsLoading: boolean
  customGoals: string[]
  onToggle: (id: string) => void
  onAddCustom: (goal: string) => void
  onRemoveCustom: (index: number) => void
  onContinue: () => void
  onBack: () => void
}) {
  const [customGoalInput, setCustomGoalInput] = useState('')

  const selectedCount = suggestedGoals.filter((g) => g.selected).length + customGoals.length
  const allSuggestedSelected = suggestedGoals.length > 0 && suggestedGoals.every((g) => g.selected)

  function handleToggleAll() {
    for (const goal of suggestedGoals) {
      if (allSuggestedSelected && goal.selected) {
        onToggle(goal.id)
      } else if (!allSuggestedSelected && !goal.selected) {
        onToggle(goal.id)
      }
    }
  }

  function handleAddCustom() {
    const trimmed = customGoalInput.trim()
    if (trimmed) {
      onAddCustom(trimmed)
      setCustomGoalInput('')
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden px-6 py-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="font-display font-medium text-base-text text-xl">Exploration goals</h2>
          <p className="mt-0.5 text-base-text-secondary text-sm">
            {goalsLoading
              ? 'Analyzing project...'
              : `${selectedCount} goal${selectedCount !== 1 ? 's' : ''} selected`}
          </p>
        </div>
        {suggestedGoals.length > 0 && (
          <button
            type="button"
            onClick={handleToggleAll}
            className="text-base-text-secondary text-xs transition-colors hover:text-base-text"
          >
            {allSuggestedSelected ? 'Deselect all' : 'Select all'}
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {goalsLoading && suggestedGoals.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-base-text-muted" />
          </div>
        ) : (
          <div className="space-y-2">
            <AnimatePresence initial={false}>
              {suggestedGoals.map((goal) => (
                <motion.button
                  key={goal.id}
                  type="button"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  onClick={() => onToggle(goal.id)}
                  className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                    goal.selected
                      ? 'border-base-border bg-base-raised/50'
                      : 'border-base-border bg-base-raised/50 hover:border-base-border-hover'
                  }`}
                >
                  <div
                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                      goal.selected
                        ? 'border-accent bg-accent text-base-bg'
                        : 'border-base-border bg-transparent'
                    }`}
                  >
                    {goal.selected && <Check className="h-3 w-3" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-base-text text-sm">{goal.title}</p>
                    <p className="mt-0.5 text-base-text-secondary text-xs">{goal.description}</p>
                    {goal.area && (
                      <span className="mt-1 inline-block rounded bg-base-border/60 px-1.5 py-0.5 text-[10px] text-base-text-faint">
                        {goal.area}
                      </span>
                    )}
                  </div>
                </motion.button>
              ))}
            </AnimatePresence>

            {/* Custom goals */}
            {customGoals.map((goal, i) => (
              <div
                key={`custom-${i}`}
                className="flex items-center gap-3 rounded-lg border border-base-border bg-base-raised/50 p-3"
              >
                <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-accent bg-accent text-base-bg">
                  <Check className="h-3 w-3" />
                </div>
                <p className="min-w-0 flex-1 font-medium text-base-text text-sm">{goal}</p>
                <button
                  type="button"
                  onClick={() => onRemoveCustom(i)}
                  className="shrink-0 text-base-text-muted transition-colors hover:text-base-text"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}

            {/* Custom goal input */}
            <div className="flex items-center gap-2 rounded-lg border border-base-border border-dashed p-3">
              <Plus className="h-4 w-4 shrink-0 text-base-text-muted" />
              <input
                type="text"
                value={customGoalInput}
                onChange={(e) => setCustomGoalInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddCustom()
                }}
                placeholder="Add a custom goal..."
                className="min-w-0 flex-1 bg-transparent text-base-text text-sm placeholder-base-text-muted outline-none"
              />
              {customGoalInput.trim() && (
                <button
                  type="button"
                  onClick={handleAddCustom}
                  className="shrink-0 text-accent text-xs transition-colors hover:text-accent/80"
                >
                  Add
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between border-base-border-subtle border-t pt-4">
        <button
          type="button"
          onClick={onBack}
          className="text-base-text-secondary text-sm transition-colors hover:text-base-text"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onContinue}
          disabled={selectedCount === 0}
          className="rounded-lg bg-accent px-5 py-2 font-medium text-base-bg text-sm transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Continue
        </button>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Step 3 — Configuration & Launch                                           */
/* -------------------------------------------------------------------------- */

function Step3Config({
  projectScan,
  scanLoading,
  providerModels,
  agentProvider,
  agentModel,
  agentEffort,
  agentCount,
  autoStartServer,
  customUrl,
  e2ePath,
  mode,
  requirements,
  goalCount,
  launchLoading,
  launchError,
  canLaunch,
  onAgentSelectionChange,
  onSetAgentCount,
  onSetAutoStart,
  onSetCustomUrl,
  onSetE2ePath,
  onSetMode,
  onSetRequirements,
  onBack,
  onLaunch,
}: {
  projectScan: ProjectScan | null
  scanLoading: boolean
  providerModels: ProviderModelEntry[]
  agentProvider: ProviderId
  agentModel: string
  agentEffort: EffortLevel
  agentCount: number
  autoStartServer: boolean
  customUrl: string | null
  e2ePath: string
  mode: ExplorationMode
  requirements: string
  goalCount: number
  launchLoading: boolean
  launchError: string | null
  canLaunch: boolean
  onAgentSelectionChange: (provider: ProviderId, model: string, effort: EffortLevel) => void
  onSetAgentCount: (n: number) => void
  onSetAutoStart: (enabled: boolean) => void
  onSetCustomUrl: (url: string | null) => void
  onSetE2ePath: (path: string) => void
  onSetMode: (mode: ExplorationMode) => void
  onSetRequirements: (r: string) => void
  onBack: () => void
  onLaunch: () => void
}) {
  const serverInfo = projectScan
    ? [projectScan.framework, projectScan.detectedPort ? `port ${projectScan.detectedPort}` : null]
        .filter(Boolean)
        .join(' · ')
    : null

  return (
    <div className="flex flex-1 flex-col overflow-hidden px-6 py-4">
      <h2 className="mb-1 font-display font-medium text-base-text text-xl">Configuration</h2>
      <p className="mb-6 text-base-text-secondary text-sm">Configure server, agents, and launch</p>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto">
        {/* Server section */}
        <section>
          <h3 className="mb-2 font-medium text-base-text text-sm">Server</h3>
          {scanLoading ? (
            <div className="flex items-center gap-2 text-base-text-muted text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Scanning project...
            </div>
          ) : (
            <div className="space-y-3">
              <label className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => onSetAutoStart(!autoStartServer)}
                  className={`relative h-5 w-9 rounded-full transition-colors ${
                    autoStartServer ? 'bg-base-text' : 'bg-base-border'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                      autoStartServer ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
                <span className="text-base-text text-sm">Auto-start dev server</span>
              </label>
              {autoStartServer && serverInfo && (
                <p className="ml-12 text-base-text-faint text-xs">
                  {projectScan?.serverRunning ? (
                    <span className="text-success">Server already running</span>
                  ) : (
                    serverInfo
                  )}
                </p>
              )}
              {!autoStartServer && (
                <input
                  type="text"
                  value={customUrl ?? ''}
                  onChange={(e) => onSetCustomUrl(e.target.value || null)}
                  placeholder="http://localhost:3000"
                  className="w-full rounded-lg border border-base-border bg-base-raised px-3 py-2 text-base-text text-sm placeholder-base-text-muted outline-none transition-colors focus:border-accent"
                />
              )}
              {!autoStartServer && !projectScan?.serverRunning && !customUrl && (
                <p className="flex items-center gap-1.5 text-warning text-xs">
                  <AlertTriangle className="h-3 w-3" />
                  No URL provided — agent will need a running server
                </p>
              )}
            </div>
          )}
        </section>

        {/* Agent model */}
        <section>
          <h3 className="mb-2 font-medium text-base-text text-sm">Model</h3>
          <ProviderModelPicker
            models={providerModels}
            provider={agentProvider}
            model={agentModel}
            effort={agentEffort}
            onSelectionChange={onAgentSelectionChange}
            labelPrefix="Testing agent"
          />
        </section>

        {/* Agent count */}
        <section>
          <h3 className="mb-2 font-medium text-base-text text-sm">Agents</h3>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onSetAgentCount(agentCount - 1)}
              disabled={agentCount <= 1}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-base-border text-base-text-secondary transition-colors hover:bg-base-border/30 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <Minus className="h-4 w-4" />
            </button>
            <span className="w-6 text-center font-medium text-base-text text-lg">{agentCount}</span>
            <button
              type="button"
              onClick={() => onSetAgentCount(agentCount + 1)}
              disabled={agentCount >= 5}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-base-border text-base-text-secondary transition-colors hover:bg-base-border/30 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <Plus className="h-4 w-4" />
            </button>
            <span className="text-base-text-secondary text-sm">
              parallel agent{agentCount !== 1 ? 's' : ''}
            </span>
          </div>
        </section>

        {/* Strategy */}
        <section>
          <h3 className="mb-2 font-medium text-base-text text-sm">Strategy</h3>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onSetMode('manual')}
              className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                mode === 'manual'
                  ? 'border-base-text bg-base-text/10 text-base-text'
                  : 'border-base-border text-base-text-secondary hover:border-base-border-hover'
              }`}
            >
              Manual
            </button>
            <button
              type="button"
              onClick={() => onSetMode('requirements')}
              className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                mode === 'requirements'
                  ? 'border-base-text bg-base-text/10 text-base-text'
                  : 'border-base-border text-base-text-secondary hover:border-base-border-hover'
              }`}
            >
              Requirements
            </button>
          </div>
          {mode === 'requirements' && (
            <textarea
              value={requirements}
              onChange={(e) => onSetRequirements(e.target.value)}
              placeholder="Paste or write testing requirements..."
              rows={4}
              className="mt-2 w-full resize-none rounded-lg border border-base-border bg-base-raised px-3 py-2 text-base-text text-sm placeholder-base-text-muted outline-none transition-colors focus:border-accent"
            />
          )}
        </section>

        {/* E2E output path */}
        <section>
          <h3 className="mb-2 font-medium text-base-text text-sm">E2E output path</h3>
          <input
            type="text"
            value={e2ePath}
            onChange={(e) => onSetE2ePath(e.target.value)}
            placeholder="e2e/"
            className="w-full rounded-lg border border-base-border bg-base-raised px-3 py-2 text-base-text text-sm placeholder-base-text-muted outline-none transition-colors focus:border-accent"
          />
        </section>
      </div>

      <div className="mt-4 flex items-center justify-between border-base-border-subtle border-t pt-4">
        <button
          type="button"
          onClick={onBack}
          className="text-base-text-secondary text-sm transition-colors hover:text-base-text"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onLaunch}
          disabled={!canLaunch || launchLoading}
          className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2 font-medium text-base-bg text-sm transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {launchLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          {launchLoading
            ? 'Starting...'
            : `Start ${agentCount} agent${agentCount !== 1 ? 's' : ''} on ${goalCount} goal${
                goalCount !== 1 ? 's' : ''
              }`}
        </button>
      </div>
      {launchError && (
        <p className="mt-2 rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-error text-xs">
          {launchError}
        </p>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  SetupWizard — main component                                              */
/* -------------------------------------------------------------------------- */

export function SetupWizard() {
  const projects = useTestStore((s) => s.projects)
  const selectedProject = useTestStore((s) => s.selectedProject)
  const projectScan = useTestStore((s) => s.projectScan)
  const scanLoading = useTestStore((s) => s.scanLoading)
  const suggestedGoals = useTestStore((s) => s.suggestedGoals)
  const goalsLoading = useTestStore((s) => s.goalsLoading)
  const customGoals = useTestStore((s) => s.customGoals)
  const agentProvider = useTestStore((s) => s.agentProvider)
  const agentModel = useTestStore((s) => s.agentModel)
  const agentEffort = useTestStore((s) => s.agentEffort)
  const agentCount = useTestStore((s) => s.agentCount)
  const autoStartServer = useTestStore((s) => s.autoStartServer)
  const customUrl = useTestStore((s) => s.customUrl)
  const launchLoading = useTestStore((s) => s.launchLoading)
  const launchError = useTestStore((s) => s.launchError)
  const setupStep = useTestStore((s) => s.setupStep)

  const selectProject = useTestStore((s) => s.selectProject)
  const toggleGoal = useTestStore((s) => s.toggleGoal)
  const addCustomGoal = useTestStore((s) => s.addCustomGoal)
  const removeCustomGoal = useTestStore((s) => s.removeCustomGoal)
  const setAgentCount = useTestStore((s) => s.setAgentCount)
  const setAutoStartServer = useTestStore((s) => s.setAutoStartServer)
  const setCustomUrl = useTestStore((s) => s.setCustomUrl)
  const setSetupStep = useTestStore((s) => s.setSetupStep)
  const setAgentSelection = useTestStore((s) => s.setAgentSelection)
  const startBatch = useTestStore((s) => s.startBatch)
  const resolveE2ePath = useTestStore((s) => s.resolveE2ePath)
  const loadProjects = useTestStore((s) => s.loadProjects)

  const [e2ePath, setE2ePath] = useState('')
  const [mode, setMode] = useState<ExplorationMode>('manual')
  const [requirements, setRequirements] = useState('')
  const [providerModels, setProviderModels] =
    useState<ProviderModelEntry[]>(FALLBACK_PROVIDER_MODELS)
  const agentSelectionRequestRef = useRef(0)
  const agentSelectionBaseRevisionRef = useRef(useTestStore.getState().agentSelectionRevision)
  const agentSelectionLoadRef = useRef<
    Promise<{ models: ProviderModelEntry[]; selection: AgentSelection }> | null
  >(null)

  type AgentSelection = {
    provider: ProviderId
    model: string
    effort: EffortLevel
  }

  function normalizeUrlInput(value: string): string | null {
    const trimmed = value.trim()
    if (!trimmed) return null
    const withProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`
    try {
      const parsed = new URL(withProtocol)
      return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : null
    } catch {
      return null
    }
  }

  // Load projects on mount
  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  const loadAgentSelection = useCallback(async () => {
    const requestId = agentSelectionRequestRef.current + 1
    agentSelectionRequestRef.current = requestId
    const startRevision = useTestStore.getState().agentSelectionRevision

    agentSelectionLoadRef.current ??= Promise.allSettled([
      window.api.getProviderModels(),
      window.api.getSettings(),
    ])
      .then(([modelsResult, settingsResult]) => {
        const models =
          modelsResult.status === 'fulfilled'
            ? normalizeProviderModels(modelsResult.value)
            : FALLBACK_PROVIDER_MODELS
        const settings =
          settingsResult.status === 'fulfilled' && settingsResult.value
            ? (settingsResult.value as Partial<AppSettings>)
            : {}
        const selection = resolveFeatureAgentSelection({
          persistedModel: settings.testingAgentModel,
          persistedEffort: settings.testingAgentEffort,
          appDefaultModel: settings.defaultModel,
          appDefaultEffort: settings.defaultEffort,
          models,
        })
        return { models, selection }
      })
      .finally(() => {
        agentSelectionLoadRef.current = null
      })

    const { models, selection } = await agentSelectionLoadRef.current
    const currentState = useTestStore.getState()
    const canApplySelection =
      agentSelectionRequestRef.current === requestId &&
      currentState.agentSelectionRevision === startRevision &&
      startRevision === agentSelectionBaseRevisionRef.current

    setProviderModels(models)
    if (canApplySelection) {
      setAgentSelection(selection.provider, selection.model, selection.effort)
      agentSelectionBaseRevisionRef.current = useTestStore.getState().agentSelectionRevision
    }
  }, [setAgentSelection])

  useEffect(() => {
    loadAgentSelection().catch(() => {
      setProviderModels(FALLBACK_PROVIDER_MODELS)
      setAgentSelection('claude', 'claude-opus-4-7', 'high')
    })
  }, [loadAgentSelection, setAgentSelection])

  // Resolve e2e path when project is selected
  useEffect(() => {
    if (selectedProject) {
      resolveE2ePath(selectedProject).then((result) => {
        setE2ePath(result.path)
      })
    }
  }, [selectedProject, resolveE2ePath])

  function handleProjectSelect(cwd: string) {
    selectProject(cwd)
    setSetupStep(2)
  }

  function handleLaunch() {
    if (!selectedProject) return

    const selectedGoalTexts = suggestedGoals.filter((g) => g.selected).map((g) => g.title)
    const allGoals = [...selectedGoalTexts, ...customGoals]
    if (allGoals.length === 0) return

    const normalizedCustomUrl = customUrl ? normalizeUrlInput(customUrl) : null
    if (!autoStartServer && customUrl && !normalizedCustomUrl) return

    startBatch(selectedProject, {
      goals: allGoals,
      agentCount,
      mode,
      requirements: mode === 'requirements' ? requirements : undefined,
      e2eOutputPath: e2ePath,
      customUrl: normalizedCustomUrl ?? undefined,
      autoStartServer,
      projectScan: projectScan ?? undefined,
    })
  }

  const handleAgentSelectionChange = useCallback(
    (provider: ProviderId, model: string, effort: EffortLevel) => {
      setAgentSelection(provider, model, effort)
      void Promise.all([
        window.api.updateSettings('testingAgentModel', model),
        window.api.updateSettings('testingAgentEffort', effort),
      ])
    },
    [setAgentSelection],
  )

  const selectedGoalCount = suggestedGoals.filter((g) => g.selected).length + customGoals.length
  const normalizedCustomUrl = customUrl ? normalizeUrlInput(customUrl) : null
  const hasInvalidCustomUrl = !autoStartServer && !!customUrl && !normalizedCustomUrl
  const canLaunch = selectedGoalCount > 0 && !!selectedProject && !!e2ePath && !hasInvalidCustomUrl

  const steps = [1, 2, 3] as const

  return (
    <div className="flex h-full flex-col">
      {/* Breadcrumb */}
      <div className="flex items-center justify-center gap-2 border-base-border-subtle border-b px-4 py-3">
        {steps.map((step, i) => (
          <div key={step} className="flex items-center gap-2">
            {i > 0 && <span className="text-base-text-faint text-xs">·</span>}
            <button
              type="button"
              onClick={() => {
                // Only allow navigating back, not forward
                if (step < setupStep) setSetupStep(step)
              }}
              disabled={step > setupStep}
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs transition-colors ${
                step === setupStep
                  ? 'bg-accent font-medium text-base-bg'
                  : step < setupStep
                    ? 'bg-base-text/10 text-base-text-secondary hover:bg-base-text/15'
                    : 'bg-base-border text-base-text-muted'
              } ${step > setupStep ? 'cursor-not-allowed' : 'cursor-pointer'}`}
            >
              {step < setupStep ? <Check className="h-3 w-3" /> : step}
            </button>
          </div>
        ))}
      </div>

      {/* Active step */}
      <AnimatePresence mode="wait">
        {setupStep === 1 && (
          <motion.div
            key="step1"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.2 }}
            className="flex flex-1 flex-col overflow-hidden"
          >
            <Step1Project projects={projects} onSelect={handleProjectSelect} />
          </motion.div>
        )}

        {setupStep === 2 && (
          <motion.div
            key="step2"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.2 }}
            className="flex flex-1 flex-col overflow-hidden"
          >
            <Step2Goals
              suggestedGoals={suggestedGoals}
              goalsLoading={goalsLoading}
              customGoals={customGoals}
              onToggle={toggleGoal}
              onAddCustom={addCustomGoal}
              onRemoveCustom={removeCustomGoal}
              onContinue={() => setSetupStep(3)}
              onBack={() => setSetupStep(1)}
            />
          </motion.div>
        )}

        {setupStep === 3 && (
          <motion.div
            key="step3"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.2 }}
            className="flex flex-1 flex-col overflow-hidden"
          >
            <Step3Config
              projectScan={projectScan}
              scanLoading={scanLoading}
              providerModels={providerModels}
              agentProvider={agentProvider}
              agentModel={agentModel}
              agentEffort={agentEffort}
              agentCount={agentCount}
              autoStartServer={autoStartServer}
              customUrl={customUrl}
              e2ePath={e2ePath}
              mode={mode}
              requirements={requirements}
              goalCount={selectedGoalCount}
              launchLoading={launchLoading}
              launchError={
                hasInvalidCustomUrl ? 'Enter a valid http:// or https:// URL.' : launchError
              }
              canLaunch={canLaunch}
              onAgentSelectionChange={handleAgentSelectionChange}
              onSetAgentCount={setAgentCount}
              onSetAutoStart={setAutoStartServer}
              onSetCustomUrl={setCustomUrl}
              onSetE2ePath={setE2ePath}
              onSetMode={setMode}
              onSetRequirements={setRequirements}
              onBack={() => setSetupStep(2)}
              onLaunch={handleLaunch}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
