import {
  AlertTriangle,
  Bug,
  ChevronDown,
  ChevronRight,
  FileCode2,
  Folder,
  Info,
  Loader2,
  Play,
  Plus,
  Square,
  Trash2,
  X,
  Zap,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import type {
  ExplorationMode,
  FindingSeverity,
  SuggestedGoal,
  TestExploration,
} from '../../../shared/types'
import { timeAgo } from '../lib/utils'
import { useTestStore } from '../store/test-store'

// ── Constants ────────────────────────────────────────────────────────────────

const SEVERITY_COLORS: Record<FindingSeverity, string> = {
  critical: 'bg-red-500/20 text-red-400',
  high: 'bg-orange-500/20 text-orange-400',
  medium: 'bg-yellow-500/20 text-yellow-400',
  low: 'bg-blue-500/20 text-blue-400',
  info: 'bg-stone-500/20 text-stone-400',
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-stone-500',
  running: 'bg-blue-500 animate-pulse',
  done: 'bg-green-500',
  stopped: 'bg-yellow-500',
  error: 'bg-red-500',
}

const SEVERITY_ICONS: Record<FindingSeverity, typeof Bug> = {
  critical: AlertTriangle,
  high: AlertTriangle,
  medium: Bug,
  low: Info,
  info: Info,
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatCost(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`
  return `$${usd.toFixed(2)}`
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function basename(p: string): string {
  return p.split('/').filter(Boolean).pop() ?? p
}

function truncateGoal(goal: string, maxLen = 40): string {
  return goal.length > maxLen ? `${goal.slice(0, maxLen)}…` : goal
}

// ── Root Component ───────────────────────────────────────────────────────────

export function TestView() {
  const [e2ePath, setE2ePath] = useState('e2e')
  const [e2eReason, setE2eReason] = useState('')
  const [mode, setMode] = useState<ExplorationMode>('manual')
  const [customGoalInput, setCustomGoalInput] = useState('')

  const {
    selectedProject,
    projects,
    projectScan,
    scanLoading,
    suggestedGoals,
    goalsLoading,
    customGoals,
    customUrl,
    selectedExplorationId,
    explorations,
    streamingTexts,
    findingsByExploration,
    testsByExploration,
    autoStartServer,
    agentCount,
    loadProjects,
    selectProject,
    toggleGoal,
    addCustomGoal,
    removeCustomGoal,
    setCustomUrl,
    stopExploration,
    selectExploration,
    deleteExploration,
    resolveE2ePath,
    setAutoStartServer,
    setAgentCount,
    startBatch,
  } = useTestStore()

  // Load projects on mount
  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  // When project changes, resolve e2e path
  useEffect(() => {
    if (!selectedProject) return
    resolveE2ePath(selectedProject).then((res) => {
      setE2ePath(res.path)
      setE2eReason(res.reason)
    })
  }, [selectedProject, resolveE2ePath])

  const selectedExploration = explorations.find((e) => e.id === selectedExplorationId) ?? null
  const streamingText = selectedExplorationId ? (streamingTexts[selectedExplorationId] ?? '') : ''
  const findings = selectedExplorationId ? (findingsByExploration[selectedExplorationId] ?? []) : []
  const tests = selectedExplorationId ? (testsByExploration[selectedExplorationId] ?? []) : []

  // Effective URL: custom override takes precedence over detected URL
  const effectiveUrl = customUrl ?? projectScan?.detectedUrl ?? null

  // canStart: project selected AND url available AND at least one goal
  const hasGoals = suggestedGoals.some((g) => g.selected) || customGoals.length > 0
  const canStart = !!selectedProject && !!effectiveUrl && hasGoals

  const handleStart = () => {
    if (!canStart || !selectedProject || !effectiveUrl) return
    const selectedGoalTexts = suggestedGoals.filter((g) => g.selected).map((g) => g.title)
    const allGoals = [...selectedGoalTexts, ...customGoals]
    if (allGoals.length === 0) return
    startBatch(selectedProject, {
      goals: allGoals,
      agentCount,
      mode,
      e2eOutputPath: e2ePath,
      e2ePathReason: e2eReason,
      autoStartServer,
      projectScan: projectScan ?? undefined,
    })
  }

  const handleAutoExplore = () => {
    if (!selectedProject || !effectiveUrl) return
    startBatch(selectedProject, {
      goals: [
        'Explore the entire application freely, testing all accessible pages and interactions',
      ],
      agentCount: 1,
      mode: 'manual',
      e2eOutputPath: e2ePath,
      e2ePathReason: e2eReason,
      autoStartServer,
      projectScan: projectScan ?? undefined,
    })
  }

  const handleAddCustomGoal = () => {
    const trimmed = customGoalInput.trim()
    if (!trimmed) return
    addCustomGoal(trimmed)
    setCustomGoalInput('')
  }

  const handleCustomGoalKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAddCustomGoal()
    }
  }

  return (
    <div className="flex h-full">
      {/* Left panel */}
      <div className="flex w-[300px] flex-shrink-0 flex-col overflow-y-auto border-stone-800 border-r">
        {/* Project Picker */}
        <ProjectPicker
          projects={projects}
          selectedProject={selectedProject}
          onSelect={selectProject}
        />

        {/* Server Section */}
        <ServerSection
          projectScan={projectScan}
          scanLoading={scanLoading}
          autoStartServer={autoStartServer}
          onSetAutoStartServer={setAutoStartServer}
          customUrl={customUrl}
          onSetCustomUrl={setCustomUrl}
        />

        {/* What to Test Section */}
        <GoalSection
          goalsLoading={goalsLoading}
          suggestedGoals={suggestedGoals}
          customGoals={customGoals}
          customGoalInput={customGoalInput}
          onCustomGoalInputChange={setCustomGoalInput}
          onToggleGoal={toggleGoal}
          onAddCustomGoal={handleAddCustomGoal}
          onRemoveCustomGoal={removeCustomGoal}
          onKeyDown={handleCustomGoalKeyDown}
        />

        {/* Advanced Section */}
        <AdvancedSection
          e2ePath={e2ePath}
          e2eReason={e2eReason}
          onE2ePathChange={setE2ePath}
          mode={mode}
          onModeChange={setMode}
        />

        {/* Launch Buttons */}
        <LaunchButtons
          canStart={canStart}
          hasProject={!!selectedProject}
          hasUrl={!!effectiveUrl}
          agentCount={agentCount}
          onSetAgentCount={setAgentCount}
          onStart={handleStart}
          onAutoExplore={handleAutoExplore}
        />

        {/* Exploration List */}
        <ExplorationList
          explorations={explorations}
          selectedId={selectedExplorationId}
          onSelect={selectExploration}
          onDelete={deleteExploration}
          onStop={stopExploration}
        />
      </div>

      {/* Right panel */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {selectedExploration ? (
          <ExplorationDetail
            exploration={selectedExploration}
            streamingText={streamingText}
            findings={findings}
            tests={tests}
            cwd={selectedProject ?? ''}
          />
        ) : (
          <EmptyState hasProject={!!selectedProject} />
        )}
      </div>
    </div>
  )
}

// ── Project Picker ───────────────────────────────────────────────────────────

type ProjectPickerProps = {
  projects: Array<{ path: string; lastUsed: number }>
  selectedProject: string | null
  onSelect: (cwd: string) => void
}

function ProjectPicker({ projects, selectedProject, onSelect }: ProjectPickerProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  return (
    <div ref={containerRef} className="relative border-stone-800 border-b p-3">
      <span className="mb-1 block text-stone-400 text-xs">Project</span>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-left text-sm transition-colors hover:border-stone-600"
      >
        {selectedProject ? (
          <>
            <Folder size={14} className="flex-shrink-0 text-stone-500" />
            <span className="min-w-0 flex-1 truncate text-stone-100">
              {basename(selectedProject)}
            </span>
          </>
        ) : (
          <span className="flex-1 text-stone-500">Select a project…</span>
        )}
        <ChevronDown
          className={`h-4 w-4 flex-shrink-0 text-stone-500 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {selectedProject && (
        <p className="mt-1 truncate text-[11px] text-stone-600">{selectedProject}</p>
      )}

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute right-3 left-3 z-50 mt-1 max-h-64 overflow-y-auto rounded-xl border border-stone-700 bg-stone-900 py-1 shadow-2xl"
          >
            {projects.length === 0 ? (
              <div className="px-3 py-3 text-center text-stone-600 text-xs">No recent projects</div>
            ) : (
              projects.map((p) => (
                <button
                  type="button"
                  key={p.path}
                  onClick={() => {
                    onSelect(p.path)
                    setOpen(false)
                  }}
                  className={`flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors hover:bg-stone-800/60 ${
                    selectedProject === p.path ? 'bg-stone-800/40' : ''
                  }`}
                >
                  <Folder size={13} className="mt-0.5 flex-shrink-0 text-stone-600" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-stone-300 text-xs">
                      {basename(p.path)}
                    </p>
                    <p className="truncate text-[11px] text-stone-600">{p.path}</p>
                    <p className="text-[10px] text-stone-700">{timeAgo(p.lastUsed)}</p>
                  </div>
                </button>
              ))
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Server Section ───────────────────────────────────────────────────────────

type ServerSectionProps = {
  projectScan: import('../../../shared/types').ProjectScan | null
  scanLoading: boolean
  autoStartServer: boolean
  onSetAutoStartServer: (enabled: boolean) => void
  customUrl: string | null
  onSetCustomUrl: (url: string | null) => void
}

function ServerSection({
  projectScan,
  scanLoading,
  autoStartServer,
  onSetAutoStartServer,
  customUrl,
  onSetCustomUrl,
}: ServerSectionProps) {
  const [showCustomInput, setShowCustomInput] = useState(false)
  const [inputValue, setInputValue] = useState(customUrl ?? '')

  const handleToggleCustom = () => {
    if (showCustomInput) {
      setShowCustomInput(false)
      onSetCustomUrl(null)
      onSetAutoStartServer(true)
      setInputValue('')
    } else {
      setShowCustomInput(true)
      onSetAutoStartServer(false)
      setInputValue(customUrl ?? '')
    }
  }

  const handleCustomUrlChange = (v: string) => {
    setInputValue(v)
    onSetCustomUrl(v || null)
  }

  return (
    <div className="border-stone-800 border-b p-3">
      <h3 className="mb-2 font-semibold text-stone-400 text-xs uppercase tracking-wider">Server</h3>

      {scanLoading && (
        <div className="flex items-center gap-2 text-stone-400 text-xs">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>Scanning project...</span>
        </div>
      )}

      {!scanLoading && !showCustomInput && projectScan && !projectScan.error && (
        <div className="space-y-1">
          {projectScan.framework && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-stone-300">{projectScan.framework}</span>
              {projectScan.detectedUrl && (
                <span className="truncate text-stone-500">{projectScan.detectedUrl}</span>
              )}
            </div>
          )}
          {autoStartServer && projectScan.devCommand && (
            <div className="flex items-center gap-1.5 text-xs">
              <span className="h-2 w-2 flex-shrink-0 rounded-full bg-blue-500" />
              <span className="text-blue-400">Auto-start enabled</span>
            </div>
          )}
          {!autoStartServer && !showCustomInput && (
            <div className="flex items-center gap-1.5 text-xs">
              <span className="h-2 w-2 flex-shrink-0 rounded-full bg-stone-500" />
              <span className="text-stone-400">Manual mode</span>
            </div>
          )}
        </div>
      )}

      {!scanLoading && !showCustomInput && (!projectScan || projectScan.error) && (
        <p className="text-stone-500 text-xs">
          {projectScan?.error ? projectScan.error : 'No project selected'}
        </p>
      )}

      {showCustomInput && (
        <input
          type="url"
          value={inputValue}
          onChange={(e) => handleCustomUrlChange(e.target.value)}
          placeholder="https://localhost:3000"
          className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-1.5 text-sm text-stone-100 placeholder:text-stone-500 focus:border-blue-500 focus:outline-none"
        />
      )}

      <button
        type="button"
        onClick={handleToggleCustom}
        className="mt-2 text-blue-400 text-xs transition-colors hover:text-blue-300"
      >
        {showCustomInput ? 'Use auto-start server' : 'Use custom URL'}
      </button>
    </div>
  )
}

// ── Goal Section ─────────────────────────────────────────────────────────────

type GoalSectionProps = {
  goalsLoading: boolean
  suggestedGoals: SuggestedGoal[]
  customGoals: string[]
  customGoalInput: string
  onCustomGoalInputChange: (v: string) => void
  onToggleGoal: (id: string) => void
  onAddCustomGoal: () => void
  onRemoveCustomGoal: (index: number) => void
  onKeyDown: (e: React.KeyboardEvent) => void
}

function GoalSection({
  goalsLoading,
  suggestedGoals,
  customGoals,
  customGoalInput,
  onCustomGoalInputChange,
  onToggleGoal,
  onAddCustomGoal,
  onRemoveCustomGoal,
  onKeyDown,
}: GoalSectionProps) {
  return (
    <div className="border-stone-800 border-b p-3">
      <h3 className="mb-2 font-semibold text-stone-400 text-xs uppercase tracking-wider">
        What to Test
      </h3>

      {goalsLoading && (
        <div className="mb-2 flex items-center gap-2 text-stone-400 text-xs">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>Analyzing project…</span>
        </div>
      )}

      {suggestedGoals.length > 0 && (
        <div className="mb-2 space-y-1.5">
          {suggestedGoals.map((goal) => (
            <label key={goal.id} className="flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                checked={goal.selected}
                onChange={() => onToggleGoal(goal.id)}
                className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 cursor-pointer accent-blue-500"
              />
              <div className="min-w-0">
                <span className="block text-stone-200 text-xs leading-tight">{goal.title}</span>
                {goal.area && <span className="text-stone-500 text-xs">{goal.area}</span>}
              </div>
            </label>
          ))}
        </div>
      )}

      {customGoals.length > 0 && (
        <div className="mb-2 space-y-1">
          {customGoals.map((goal, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span className="min-w-0 flex-1 truncate text-stone-300 text-xs">{goal}</span>
              <button
                type="button"
                onClick={() => onRemoveCustomGoal(i)}
                className="flex-shrink-0 text-stone-500 transition-colors hover:text-red-400"
                aria-label="Remove goal"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Custom goal input */}
      <div className="flex gap-1.5">
        <input
          type="text"
          value={customGoalInput}
          onChange={(e) => onCustomGoalInputChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Add custom goal…"
          className="min-w-0 flex-1 rounded-lg border border-stone-700 bg-stone-800 px-2.5 py-1.5 text-stone-100 text-xs placeholder:text-stone-500 focus:border-blue-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={onAddCustomGoal}
          disabled={!customGoalInput.trim()}
          className="flex-shrink-0 rounded-lg border border-stone-700 bg-stone-800 p-1.5 text-stone-400 transition-colors hover:text-stone-200 disabled:opacity-40"
          aria-label="Add goal"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

// ── Advanced Section ──────────────────────────────────────────────────────────

type AdvancedSectionProps = {
  e2ePath: string
  e2eReason: string
  onE2ePathChange: (v: string) => void
  mode: ExplorationMode
  onModeChange: (v: ExplorationMode) => void
}

function AdvancedSection({
  e2ePath,
  e2eReason,
  onE2ePathChange,
  mode,
  onModeChange,
}: AdvancedSectionProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className="border-stone-800 border-b">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 px-3 py-2.5 text-left text-stone-400 text-xs transition-colors hover:text-stone-300"
      >
        <ChevronRight
          className={`h-3.5 w-3.5 flex-shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
        />
        <span className="font-semibold uppercase tracking-wider">Advanced</span>
      </button>

      {open && (
        <div className="space-y-3 px-3 pb-3">
          <label className="block">
            <span className="mb-1 block text-stone-400 text-xs">E2E Output Path</span>
            <input
              type="text"
              value={e2ePath}
              onChange={(e) => onE2ePathChange(e.target.value)}
              className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-1.5 text-sm text-stone-100 focus:border-blue-500 focus:outline-none"
            />
            {e2eReason && <p className="mt-1 text-stone-500 text-xs">{e2eReason}</p>}
          </label>

          <div>
            <span className="mb-1 block text-stone-400 text-xs">Strategy</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onModeChange('manual')}
                className={`flex-1 rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                  mode === 'manual'
                    ? 'border-blue-500 bg-blue-600/20 text-blue-400'
                    : 'border-stone-700 bg-stone-800 text-stone-400 hover:text-stone-300'
                }`}
              >
                Manual
              </button>
              <button
                type="button"
                onClick={() => onModeChange('requirements')}
                className={`flex-1 rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                  mode === 'requirements'
                    ? 'border-blue-500 bg-blue-600/20 text-blue-400'
                    : 'border-stone-700 bg-stone-800 text-stone-400 hover:text-stone-300'
                }`}
              >
                Requirements
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Launch Buttons ────────────────────────────────────────────────────────────

type LaunchButtonsProps = {
  canStart: boolean
  hasProject: boolean
  hasUrl: boolean
  agentCount: number
  onSetAgentCount: (count: number) => void
  onStart: () => void
  onAutoExplore: () => void
}

function LaunchButtons({
  canStart,
  hasProject,
  hasUrl,
  agentCount,
  onSetAgentCount,
  onStart,
  onAutoExplore,
}: LaunchButtonsProps) {
  const autoExploreEnabled = hasProject && hasUrl

  return (
    <div className="space-y-2 border-stone-800 border-b p-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onStart}
          disabled={!canStart}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 font-medium text-sm text-white transition-colors hover:bg-blue-500 disabled:bg-stone-700 disabled:text-stone-500"
        >
          <Play className="h-4 w-4" />
          Start
        </button>
        <div className="flex items-center gap-1.5 rounded-lg border border-stone-700 bg-stone-800 px-2 py-1.5">
          <span className="text-stone-500 text-xs">Agents</span>
          <select
            value={agentCount}
            onChange={(e) => onSetAgentCount(Number(e.target.value))}
            className="appearance-none bg-transparent pr-1 text-center text-sm text-stone-100 focus:outline-none"
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      </div>
      <button
        type="button"
        onClick={onAutoExplore}
        disabled={!autoExploreEnabled}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 font-medium text-sm text-stone-300 transition-colors hover:bg-stone-700 disabled:opacity-40"
      >
        <Zap className="h-4 w-4 text-yellow-400" />
        Auto-explore everything
      </button>
    </div>
  )
}

// ── Exploration List ──────────────────────────────────────────────────────────

type ExplorationListProps = {
  explorations: TestExploration[]
  selectedId: string | null
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onStop: (id: string) => void
}

function ExplorationList({
  explorations,
  selectedId,
  onSelect,
  onDelete,
  onStop,
}: ExplorationListProps) {
  const running = explorations.filter((e) => e.status === 'running')
  const finished = explorations.filter((e) => e.status !== 'running')

  if (explorations.length === 0) {
    return (
      <div className="p-3">
        <p className="text-stone-500 text-xs">No explorations yet</p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {running.length > 0 && (
        <ExplorationGroup
          label="Running"
          count={running.length}
          items={running}
          selectedId={selectedId}
          onSelect={onSelect}
          onDelete={onDelete}
          onStop={onStop}
        />
      )}
      {finished.length > 0 && (
        <ExplorationGroup
          label="Completed"
          count={finished.length}
          items={finished}
          selectedId={selectedId}
          onSelect={onSelect}
          onDelete={onDelete}
          onStop={onStop}
        />
      )}
    </div>
  )
}

type ExplorationGroupProps = {
  label: string
  count: number
  items: TestExploration[]
  selectedId: string | null
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onStop: (id: string) => void
}

function ExplorationGroup({
  label,
  count,
  items,
  selectedId,
  onSelect,
  onDelete,
  onStop,
}: ExplorationGroupProps) {
  const [open, setOpen] = useState(true)

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-stone-400 text-xs transition-colors hover:text-stone-300"
      >
        <ChevronRight
          className={`h-3 w-3 flex-shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
        />
        <span className="font-semibold uppercase tracking-wider">
          {label} ({count})
        </span>
      </button>
      {open && (
        <div className="space-y-0.5 px-2 pb-1">
          {items.map((exp) => (
            <ExplorationRow
              key={exp.id}
              exploration={exp}
              isSelected={exp.id === selectedId}
              onSelect={onSelect}
              onDelete={onDelete}
              onStop={onStop}
            />
          ))}
        </div>
      )}
    </div>
  )
}

type ExplorationRowProps = {
  exploration: TestExploration
  isSelected: boolean
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onStop: (id: string) => void
}

function ExplorationRow({
  exploration,
  isSelected,
  onSelect,
  onDelete,
  onStop,
}: ExplorationRowProps) {
  const isRunning = exploration.status === 'running'

  return (
    <button
      type="button"
      onClick={() => onSelect(exploration.id)}
      className={`group w-full rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${
        isSelected ? 'bg-stone-700/50 text-stone-100' : 'text-stone-300 hover:bg-stone-800/50'
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${STATUS_COLORS[exploration.status] ?? 'bg-stone-500'}`}
        />
        <span className="min-w-0 flex-1 truncate">{truncateGoal(exploration.goal)}</span>
        {exploration.findingsCount > 0 && (
          <span className="flex-shrink-0 text-xs text-yellow-500">{exploration.findingsCount}</span>
        )}
        {isRunning ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onStop(exploration.id)
            }}
            className="flex-shrink-0 text-stone-500 opacity-0 transition-all hover:text-red-400 group-hover:opacity-100"
            aria-label="Stop exploration"
          >
            <Square className="h-3 w-3" />
          </button>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onDelete(exploration.id)
            }}
            className="flex-shrink-0 text-stone-500 opacity-0 transition-all hover:text-red-400 group-hover:opacity-100"
            aria-label="Delete exploration"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>
      <div className="mt-0.5 ml-3.5 text-stone-500 text-xs">
        {formatDate(exploration.createdAt)}
      </div>
    </button>
  )
}

// ── Exploration Detail ────────────────────────────────────────────────────────

type ExplorationDetailProps = {
  exploration: TestExploration
  streamingText: string
  findings: import('../../../shared/types').TestFinding[]
  tests: string[]
  cwd: string
}

function ExplorationDetail({
  exploration,
  streamingText,
  findings,
  tests,
  cwd,
}: ExplorationDetailProps) {
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Status bar */}
      <StatusBar
        exploration={exploration}
        findingsCount={findings.length}
        testsCount={tests.length}
      />

      {/* Error banner */}
      {exploration.errorMessage && (
        <div className="mx-4 mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-red-400 text-sm">
          {exploration.errorMessage}
        </div>
      )}

      {/* Streaming text */}
      {exploration.status === 'running' && streamingText && <StreamingPanel text={streamingText} />}

      {/* Findings */}
      {findings.length > 0 && (
        <div className="px-4 py-3">
          <h3 className="mb-2 flex items-center gap-2 font-semibold text-sm text-stone-100">
            <Bug className="h-4 w-4 text-yellow-400" />
            Findings ({findings.length})
          </h3>
          <div className="space-y-2">
            {findings.map((f) => (
              <FindingCard
                key={f.id}
                finding={f}
                goalText={
                  exploration.goal.length > 50
                    ? `${exploration.goal.slice(0, 50)}...`
                    : exploration.goal
                }
              />
            ))}
          </div>
        </div>
      )}

      {/* Generated tests */}
      {tests.length > 0 && (
        <div className="px-4 py-3">
          <h3 className="mb-2 flex items-center gap-2 font-semibold text-sm text-stone-100">
            <FileCode2 className="h-4 w-4 text-green-400" />
            Generated Tests ({tests.length})
          </h3>
          <div className="space-y-1">
            {tests.map((testPath) => (
              <GeneratedTestItem key={testPath} path={testPath} cwd={cwd} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Status Bar ────────────────────────────────────────────────────────────────

type StatusBarProps = {
  exploration: TestExploration
  findingsCount: number
  testsCount: number
}

function StatusBar({ exploration, findingsCount, testsCount }: StatusBarProps) {
  return (
    <div className="flex items-center gap-4 border-stone-800 border-b px-4 py-3 text-sm">
      <div className="flex items-center gap-2">
        <span
          className={`h-2.5 w-2.5 rounded-full ${STATUS_COLORS[exploration.status] ?? 'bg-stone-500'}`}
        />
        <span className="text-stone-100 capitalize">{exploration.status}</span>
      </div>
      <div className="text-stone-400">
        {findingsCount} {findingsCount === 1 ? 'finding' : 'findings'}
      </div>
      <div className="text-stone-400">
        {testsCount} {testsCount === 1 ? 'test' : 'tests'}
      </div>
      {exploration.totalCostUsd > 0 && (
        <div className="ml-auto text-stone-500">{formatCost(exploration.totalCostUsd)}</div>
      )}
    </div>
  )
}

// ── Streaming Panel ───────────────────────────────────────────────────────────

function StreamingPanel({ text }: { text: string }) {
  const ref = useRef<HTMLPreElement>(null)

  useEffect(() => {
    // Re-run when text changes to auto-scroll
    void text
    if (ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight
    }
  }, [text])

  return (
    <div className="px-4 pt-3">
      <div className="mb-2 flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
        <span className="text-stone-400 text-xs">Exploring…</span>
      </div>
      <pre
        ref={ref}
        className="max-h-[300px] overflow-auto whitespace-pre-wrap rounded-lg border border-stone-800 bg-stone-900/50 p-3 text-stone-300 text-xs"
      >
        {text}
      </pre>
    </div>
  )
}

// ── Finding Card ──────────────────────────────────────────────────────────────

function FindingCard({
  finding,
  goalText,
}: {
  finding: import('../../../shared/types').TestFinding
  goalText?: string
}) {
  const [expanded, setExpanded] = useState(false)
  const Icon = SEVERITY_ICONS[finding.severity]

  return (
    <div className="rounded-lg border border-stone-700 bg-stone-800/50 p-3">
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-4 w-4 flex-shrink-0 text-stone-400" />
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <span
              className={`rounded px-1.5 py-0.5 font-medium text-xs ${SEVERITY_COLORS[finding.severity]}`}
            >
              {finding.severity}
            </span>
            {goalText && (
              <span className="truncate rounded bg-stone-700/60 px-1.5 py-0.5 text-[10px] text-stone-400">
                {goalText}
              </span>
            )}
            <span className="truncate font-medium text-sm text-stone-100">{finding.title}</span>
          </div>
          <p className="mb-1 text-stone-400 text-xs">{finding.description}</p>
          {finding.url && <p className="mb-1 truncate text-blue-400 text-xs">{finding.url}</p>}
          {finding.reproductionSteps.length > 0 && (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="mt-1 flex items-center gap-1 text-stone-500 text-xs transition-colors hover:text-stone-300"
            >
              <ChevronRight
                className={`h-3 w-3 transition-transform ${expanded ? 'rotate-90' : ''}`}
              />
              Reproduction steps ({finding.reproductionSteps.length})
            </button>
          )}
          {expanded && (
            <ol className="mt-2 list-inside list-decimal space-y-1 text-stone-400 text-xs">
              {finding.reproductionSteps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Generated Test Item ───────────────────────────────────────────────────────

function GeneratedTestItem({ path, cwd }: { path: string; cwd: string }) {
  const [expanded, setExpanded] = useState(false)
  const [content, setContent] = useState<string | null>(null)
  const readGeneratedTest = useTestStore((s) => s.readGeneratedTest)

  const handleExpand = async () => {
    if (!expanded && content === null) {
      const result = await readGeneratedTest(cwd, path)
      setContent(result)
    }
    setExpanded(!expanded)
  }

  return (
    <div className="rounded-lg border border-stone-700 bg-stone-800/50">
      <button
        type="button"
        onClick={handleExpand}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-stone-700/30"
      >
        <ChevronRight
          className={`h-3.5 w-3.5 flex-shrink-0 text-stone-500 transition-transform ${expanded ? 'rotate-90' : ''}`}
        />
        <FileCode2 className="h-4 w-4 flex-shrink-0 text-green-400" />
        <span className="truncate text-stone-300">{path}</span>
      </button>
      {expanded && content !== null && (
        <pre className="max-h-[400px] overflow-x-auto whitespace-pre-wrap border-stone-700 border-t px-3 pb-3 text-stone-400 text-xs">
          {content}
        </pre>
      )}
    </div>
  )
}

// ── Empty State ───────────────────────────────────────────────────────────────

function EmptyState({ hasProject }: { hasProject: boolean }) {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="text-center">
        <Bug className="mx-auto mb-3 h-12 w-12 text-stone-600" />
        {hasProject ? (
          <>
            <p className="text-sm text-stone-400">No exploration selected</p>
            <p className="mt-1 text-stone-500 text-xs">
              Configure goals on the left and start an exploration
            </p>
          </>
        ) : (
          <>
            <p className="text-sm text-stone-400">Select a project to get started</p>
            <p className="mt-1 text-stone-500 text-xs">
              Choose a project from the dropdown to scan for server details and generate test goals
            </p>
          </>
        )}
      </div>
    </div>
  )
}
