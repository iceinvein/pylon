import {
  AlertTriangle,
  Bug,
  Check,
  ChevronDown,
  ChevronRight,
  FileCode2,
  Folder,
  Info,
  Loader2,
  Minus,
  Play,
  Plus,
  Square,
  Trash2,
  X,
  Zap,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  ExplorationAgentMessage,
  ExplorationMode,
  FindingSeverity,
  SuggestedGoal,
  TestExploration,
} from '../../../shared/types'
import { ToolUseBlock } from '../components/tools/ToolUseBlock'
import { usePersistedWidth } from '../hooks/use-persisted-width'
import { timeAgo } from '../lib/utils'
import { useTestStore } from '../store/test-store'

// ── Constants ────────────────────────────────────────────────────────────────

const SEVERITY_COLORS: Record<FindingSeverity, string> = {
  critical: 'bg-[var(--color-error)]/20 text-[var(--color-error)]',
  high: 'bg-orange-500/20 text-orange-400',
  medium: 'bg-yellow-500/20 text-yellow-400',
  low: 'bg-[var(--color-info)]/20 text-[var(--color-info)]',
  info: 'bg-[var(--color-base-text-muted)]/20 text-[var(--color-base-text-secondary)]',
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-[var(--color-base-text-muted)]',
  running: 'bg-[var(--color-info)] animate-pulse',
  done: 'bg-[var(--color-success)]',
  stopped: 'bg-yellow-500',
  error: 'bg-[var(--color-error)]',
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

  const { width: sidebarWidth, onDragStart: handleSidebarDragStart } = usePersistedWidth({
    key: 'test-sidebar',
    defaultWidth: 300,
    min: 240,
    max: 500,
    direction: 'right',
  })

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
    agentMessagesByExploration,
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
  const agentMessages = selectedExplorationId
    ? (agentMessagesByExploration[selectedExplorationId] ?? [])
    : []

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
      {/* Left panel — resizable sidebar */}
      <div className="flex shrink-0 flex-col overflow-y-auto" style={{ width: sidebarWidth }}>
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

      {/* Resize handle */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: mouse-only resize handle */}
      <div
        onMouseDown={handleSidebarDragStart}
        className="flex w-1 shrink-0 cursor-col-resize items-center justify-center border-base-border-subtle border-r bg-base-bg transition-colors hover:bg-base-border active:bg-base-text-faint"
      />

      {/* Right panel */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {selectedExploration ? (
          <ExplorationDetail
            exploration={selectedExploration}
            streamingText={streamingText}
            agentMessages={agentMessages}
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
    <div ref={containerRef} className="relative border-base-border-subtle border-b p-3">
      <span className="mb-1 block text-base-text-secondary text-xs">Project</span>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 rounded-lg border border-base-border bg-base-raised px-3 py-2 text-left text-sm transition-colors hover:border-base-border"
      >
        {selectedProject ? (
          <>
            <Folder size={14} className="shrink-0 text-base-text-muted" />
            <span className="min-w-0 flex-1 truncate text-base-text">
              {basename(selectedProject)}
            </span>
          </>
        ) : (
          <span className="flex-1 text-base-text-muted">Select a project…</span>
        )}
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-base-text-muted transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {selectedProject && (
        <p className="mt-1 truncate text-[11px] text-base-text-faint">{selectedProject}</p>
      )}

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute right-3 left-3 z-50 mt-1 max-h-64 overflow-y-auto rounded-xl border border-base-border bg-base-surface py-1 shadow-2xl"
          >
            {projects.length === 0 ? (
              <div className="px-3 py-3 text-center text-base-text-faint text-xs">
                No recent projects
              </div>
            ) : (
              projects.map((p) => (
                <button
                  type="button"
                  key={p.path}
                  onClick={() => {
                    onSelect(p.path)
                    setOpen(false)
                  }}
                  className={`flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors hover:bg-base-raised/60 ${
                    selectedProject === p.path ? 'bg-base-raised/40' : ''
                  }`}
                >
                  <Folder size={13} className="mt-0.5 shrink-0 text-base-text-faint" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-base-text text-xs">
                      {basename(p.path)}
                    </p>
                    <p className="truncate text-[11px] text-base-text-faint">{p.path}</p>
                    <p className="text-[10px] text-base-text-faint">{timeAgo(p.lastUsed)}</p>
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

  const portInUse = projectScan?.serverRunning ?? false

  return (
    <div className="border-base-border-subtle border-b p-3">
      <h3 className="mb-2 font-semibold text-base-text-secondary text-xs uppercase tracking-wider">
        Server
      </h3>

      {scanLoading && (
        <div className="flex items-center gap-2 text-base-text-secondary text-xs">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>Scanning project…</span>
        </div>
      )}

      {!scanLoading && !showCustomInput && projectScan && !projectScan.error && (
        <div className="space-y-2">
          {/* Framework & detected info */}
          {projectScan.framework && (
            <div className="rounded-lg border border-base-border-subtle bg-base-raised p-2">
              <div className="flex items-center justify-between">
                <span className="font-medium text-base-text text-xs">{projectScan.framework}</span>
                {projectScan.detectedPort && (
                  <span className="font-mono text-[11px] text-base-text-muted">
                    :{projectScan.detectedPort}
                  </span>
                )}
              </div>
              {projectScan.devCommand && (
                <div className="mt-1 truncate font-mono text-[11px] text-base-text-faint">
                  {projectScan.devCommand}
                </div>
              )}
            </div>
          )}

          {/* Port status */}
          {projectScan.detectedPort && (
            <div className="flex items-center gap-1.5 text-xs">
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${portInUse ? 'bg-yellow-500' : 'bg-success'}`}
              />
              <span className={portInUse ? 'text-yellow-400' : 'text-success'}>
                Port {projectScan.detectedPort} {portInUse ? 'in use' : 'available'}
              </span>
            </div>
          )}

          {/* Auto-start mode info */}
          {autoStartServer && projectScan.devCommand && (
            <div className="flex items-center gap-1.5 text-xs">
              <Zap size={12} className="shrink-0 text-info" />
              <span className="text-info">
                {portInUse ? 'Will auto-select free port' : 'Will start on detected port'}
              </span>
            </div>
          )}
          {autoStartServer && !projectScan.devCommand && (
            <div className="flex items-center gap-1.5 text-xs">
              <AlertTriangle size={12} className="shrink-0 text-yellow-400" />
              <span className="text-yellow-400">No dev command found</span>
            </div>
          )}
          {!autoStartServer && !showCustomInput && (
            <div className="flex items-center gap-1.5 text-xs">
              <span className="h-2 w-2 shrink-0 rounded-full bg-base-text-muted" />
              <span className="text-base-text-secondary">
                Manual — server must be running externally
              </span>
            </div>
          )}
        </div>
      )}

      {!scanLoading && !showCustomInput && (!projectScan || projectScan.error) && (
        <p className="text-base-text-muted text-xs">
          {projectScan?.error ? projectScan.error : 'No project selected'}
        </p>
      )}

      {showCustomInput && (
        <div className="space-y-1">
          <input
            type="url"
            value={inputValue}
            onChange={(e) => handleCustomUrlChange(e.target.value)}
            placeholder="http://localhost:3000"
            className="w-full rounded-lg border border-base-border bg-base-raised px-3 py-1.5 text-base-text text-sm placeholder:text-base-text-muted focus:border-info focus:outline-none"
          />
          <p className="text-[11px] text-base-text-faint">Point to an already-running server</p>
        </div>
      )}

      <button
        type="button"
        onClick={handleToggleCustom}
        className="mt-2 text-info text-xs transition-colors hover:text-info"
      >
        {showCustomInput ? '← Use auto-start' : 'Use custom URL instead'}
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
    <div className="border-base-border-subtle border-b p-3">
      <h3 className="mb-2 font-semibold text-base-text-secondary text-xs uppercase tracking-wider">
        What to Test
      </h3>

      {goalsLoading && (
        <div className="mb-2 flex items-center gap-2 text-base-text-secondary text-xs">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>Analyzing project…</span>
        </div>
      )}

      {suggestedGoals.length > 0 && (
        <div className="mb-2 space-y-1.5">
          {suggestedGoals.map((goal) => (
            <button
              key={goal.id}
              type="button"
              onClick={() => onToggleGoal(goal.id)}
              className="flex w-full cursor-pointer items-start gap-2 text-left"
            >
              <span
                className={`mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border transition-colors ${
                  goal.selected
                    ? 'border-info bg-info text-white'
                    : 'border-base-border bg-base-raised'
                }`}
              >
                {goal.selected && <Check size={10} strokeWidth={3} />}
              </span>
              <div className="min-w-0">
                <span
                  className={`block text-xs leading-tight transition-colors ${goal.selected ? 'text-base-text' : 'text-base-text-muted'}`}
                >
                  {goal.title}
                </span>
                {goal.area && <span className="text-[11px] text-base-text-faint">{goal.area}</span>}
              </div>
            </button>
          ))}
        </div>
      )}

      {customGoals.length > 0 && (
        <div className="mb-2 space-y-1">
          {customGoals.map((goal, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span className="min-w-0 flex-1 truncate text-base-text text-xs">{goal}</span>
              <button
                type="button"
                onClick={() => onRemoveCustomGoal(i)}
                className="shrink-0 text-base-text-muted transition-colors hover:text-error"
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
          className="min-w-0 flex-1 rounded-lg border border-base-border bg-base-raised px-2.5 py-1.5 text-base-text text-xs placeholder:text-base-text-muted focus:border-info focus:outline-none"
        />
        <button
          type="button"
          onClick={onAddCustomGoal}
          disabled={!customGoalInput.trim()}
          className="shrink-0 rounded-lg border border-base-border bg-base-raised p-1.5 text-base-text-secondary transition-colors hover:text-base-text disabled:opacity-40"
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
    <div className="border-base-border-subtle border-b">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 px-3 py-2.5 text-left text-base-text-secondary text-xs transition-colors hover:text-base-text"
      >
        <ChevronRight
          className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
        />
        <span className="font-semibold uppercase tracking-wider">Advanced</span>
      </button>

      {open && (
        <div className="space-y-3 px-3 pb-3">
          <label className="block">
            <span className="mb-1 block text-base-text-secondary text-xs">E2E Output Path</span>
            <input
              type="text"
              value={e2ePath}
              onChange={(e) => onE2ePathChange(e.target.value)}
              className="w-full rounded-lg border border-base-border bg-base-raised px-3 py-1.5 text-base-text text-sm focus:border-info focus:outline-none"
            />
            {e2eReason && <p className="mt-1 text-base-text-muted text-xs">{e2eReason}</p>}
          </label>

          <div>
            <span className="mb-1 block text-base-text-secondary text-xs">Strategy</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onModeChange('manual')}
                className={`flex-1 rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                  mode === 'manual'
                    ? 'border-info bg-info/20 text-info'
                    : 'border-base-border bg-base-raised text-base-text-secondary hover:text-base-text'
                }`}
              >
                Manual
              </button>
              <button
                type="button"
                onClick={() => onModeChange('requirements')}
                className={`flex-1 rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                  mode === 'requirements'
                    ? 'border-info bg-info/20 text-info'
                    : 'border-base-border bg-base-raised text-base-text-secondary hover:text-base-text'
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
    <div className="space-y-2 border-base-border-subtle border-b p-3">
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onStart}
            disabled={!canStart}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-info px-3 py-2 font-medium text-sm text-white transition-colors hover:bg-info disabled:bg-base-border disabled:text-base-text-muted"
          >
            <Play className="h-4 w-4" />
            Start
          </button>
          <div className="flex items-center gap-1 rounded-lg border border-base-border bg-base-raised px-1 py-0.5">
            <button
              type="button"
              onClick={() => onSetAgentCount(agentCount - 1)}
              disabled={agentCount <= 1}
              className="flex h-7 w-7 items-center justify-center rounded-md text-base-text-muted transition-colors hover:bg-base-border hover:text-base-text disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <Minus size={14} />
            </button>
            <span className="w-5 text-center font-mono text-base-text text-sm">{agentCount}</span>
            <button
              type="button"
              onClick={() => onSetAgentCount(agentCount + 1)}
              disabled={agentCount >= 5}
              className="flex h-7 w-7 items-center justify-center rounded-md text-base-text-muted transition-colors hover:bg-base-border hover:text-base-text disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <Plus size={14} />
            </button>
          </div>
        </div>
        {agentCount > 1 && (
          <p
            className={`text-[11px] ${agentCount >= 4 ? 'text-yellow-400' : 'text-base-text-faint'}`}
          >
            {agentCount} parallel agents — {agentCount}x token usage
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onAutoExplore}
        disabled={!autoExploreEnabled}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-base-border bg-base-raised px-3 py-2 font-medium text-base-text text-sm transition-colors hover:bg-base-border disabled:opacity-40"
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
        <p className="text-base-text-muted text-xs">No explorations yet</p>
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
        className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-base-text-secondary text-xs transition-colors hover:text-base-text"
      >
        <ChevronRight
          className={`h-3 w-3 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
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
        isSelected ? 'bg-base-border/50 text-base-text' : 'text-base-text hover:bg-base-raised/50'
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_COLORS[exploration.status] ?? 'bg-base-text-muted'}`}
        />
        <span className="min-w-0 flex-1 truncate">{truncateGoal(exploration.goal)}</span>
        {exploration.findingsCount > 0 && (
          <span className="shrink-0 text-xs text-yellow-500">{exploration.findingsCount}</span>
        )}
        {isRunning ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onStop(exploration.id)
            }}
            className="shrink-0 text-base-text-muted opacity-0 transition-all hover:text-error group-hover:opacity-100"
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
            className="shrink-0 text-base-text-muted opacity-0 transition-all hover:text-error group-hover:opacity-100"
            aria-label="Delete exploration"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>
      <div className="mt-0.5 ml-3.5 text-base-text-muted text-xs">
        {formatDate(exploration.createdAt)}
      </div>
    </button>
  )
}

// ── Exploration Detail ────────────────────────────────────────────────────────

type ExplorationDetailProps = {
  exploration: TestExploration
  streamingText: string
  agentMessages: ExplorationAgentMessage[]
  findings: import('../../../shared/types').TestFinding[]
  tests: string[]
  cwd: string
}

function ExplorationDetail({
  exploration,
  streamingText,
  agentMessages,
  findings,
  tests,
  cwd,
}: ExplorationDetailProps) {
  const [viewMode, setViewMode] = useState<'single' | 'batch'>('single')

  // Pull stable store references for derived computation
  const explorations = useTestStore((s) => s.explorations)
  const findingsByExploration = useTestStore((s) => s.findingsByExploration)

  // Derive batch findings via useMemo (not a Zustand selector) to avoid
  // returning a new array reference on every store update, which causes
  // an infinite re-render loop with useSyncExternalStore.
  const batchFindings = useMemo(() => {
    if (!exploration.batchId) return null
    const batchExplorations = explorations.filter((e) => e.batchId === exploration.batchId)
    const allFindings: Array<import('../../../shared/types').TestFinding & { goalText: string }> =
      []
    for (const exp of batchExplorations) {
      const expFindings = findingsByExploration[exp.id] ?? []
      for (const f of expFindings) {
        allFindings.push({
          ...f,
          goalText: exp.goal.length > 50 ? `${exp.goal.slice(0, 50)}...` : exp.goal,
        })
      }
    }
    return allFindings
  }, [exploration.batchId, explorations, findingsByExploration])

  const batchExplorationCount = useMemo(() => {
    if (!exploration.batchId) return 0
    return explorations.filter((e) => e.batchId === exploration.batchId).length
  }, [exploration.batchId, explorations])

  // Show toggle only if this exploration belongs to a batch with multiple explorations
  const showBatchToggle = exploration.batchId && batchExplorationCount > 1

  const displayFindings = viewMode === 'batch' && batchFindings ? batchFindings : findings

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
        <div className="mx-4 mt-3 rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-error text-sm">
          {exploration.errorMessage}
        </div>
      )}

      {/* Agent activity — shows tool calls when available, falls back to raw text */}
      {agentMessages.length > 0 ? (
        <AgentActivityPanel messages={agentMessages} isRunning={exploration.status === 'running'} />
      ) : (
        exploration.status === 'running' && streamingText && <StreamingPanel text={streamingText} />
      )}

      {/* Findings */}
      {displayFindings.length > 0 && (
        <div className="px-4 py-3">
          <h3 className="mb-2 flex items-center gap-2 font-semibold text-base-text text-sm">
            <Bug className="h-4 w-4 text-yellow-400" />
            Findings ({displayFindings.length})
          </h3>
          {showBatchToggle && (
            <div className="mb-2 flex items-center gap-1 rounded-lg bg-base-raised p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('single')}
                className={`rounded px-2 py-1 text-xs ${
                  viewMode === 'single'
                    ? 'bg-base-border text-base-text'
                    : 'text-base-text-secondary hover:text-base-text'
                }`}
              >
                This exploration
              </button>
              <button
                type="button"
                onClick={() => setViewMode('batch')}
                className={`rounded px-2 py-1 text-xs ${
                  viewMode === 'batch'
                    ? 'bg-base-border text-base-text'
                    : 'text-base-text-secondary hover:text-base-text'
                }`}
              >
                All in batch ({batchFindings?.length ?? 0})
              </button>
            </div>
          )}
          <div className="space-y-2">
            {displayFindings.map((f) => (
              <FindingCard
                key={f.id}
                finding={f}
                goalText={
                  'goalText' in f
                    ? (f.goalText as string)
                    : exploration.goal.length > 50
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
          <h3 className="mb-2 flex items-center gap-2 font-semibold text-base-text text-sm">
            <FileCode2 className="h-4 w-4 text-success" />
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
    <div className="flex items-center gap-4 border-base-border-subtle border-b px-4 py-3 text-sm">
      <div className="flex items-center gap-2">
        <span
          className={`h-2.5 w-2.5 rounded-full ${STATUS_COLORS[exploration.status] ?? 'bg-base-text-muted'}`}
        />
        <span className="text-base-text capitalize">{exploration.status}</span>
      </div>
      <div className="text-base-text-secondary">
        {findingsCount} {findingsCount === 1 ? 'finding' : 'findings'}
      </div>
      <div className="text-base-text-secondary">
        {testsCount} {testsCount === 1 ? 'test' : 'tests'}
      </div>
      {exploration.totalCostUsd > 0 && (
        <div className="ml-auto text-base-text-muted">{formatCost(exploration.totalCostUsd)}</div>
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
        <Loader2 className="h-4 w-4 animate-spin text-info" />
        <span className="text-base-text-secondary text-xs">Exploring…</span>
      </div>
      <pre
        ref={ref}
        className="max-h-75 overflow-auto whitespace-pre-wrap rounded-lg border border-base-border-subtle bg-base-surface/50 p-3 text-base-text text-xs"
      >
        {text}
      </pre>
    </div>
  )
}

// ── Agent Activity Panel ──────────────────────────────────────────────────────

function AgentActivityPanel({
  messages,
  isRunning,
}: {
  messages: ExplorationAgentMessage[]
  isRunning: boolean
}) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const [collapsed, setCollapsed] = useState(false)

  // Auto-scroll when new messages arrive (only while running)
  useEffect(() => {
    if (isRunning && !collapsed) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [isRunning, collapsed])

  // Build tool result map for pairing tool_use → tool_result
  const toolResultMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const msg of messages) {
      if (msg.type === 'tool_result') {
        map.set(msg.toolUseId, msg.content)
      }
    }
    return map
  }, [messages])

  const toolUseCount = messages.filter((m) => m.type === 'tool_use').length

  return (
    <div className="px-4 pt-3">
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="mb-2 flex items-center gap-2"
      >
        {isRunning ? (
          <Loader2 className="h-4 w-4 animate-spin text-info" />
        ) : (
          <ChevronRight
            className={`h-4 w-4 text-base-text-faint transition-transform ${!collapsed ? 'rotate-90' : ''}`}
          />
        )}
        <span className="text-base-text-secondary text-xs">
          {isRunning ? 'Exploring' : 'Agent activity'}
          {toolUseCount > 0 && ` · ${toolUseCount} tool call${toolUseCount !== 1 ? 's' : ''}`}
        </span>
      </button>
      {!collapsed && (
        <div className="max-h-100 space-y-1.5 overflow-y-auto rounded-lg border border-base-border-subtle bg-base-surface/50 p-3">
          {messages
            .filter((m) => m.type !== 'tool_result') // Results shown inline with their tool_use
            .map((msg, i) => {
              if (msg.type === 'tool_use') {
                return (
                  <ToolUseBlock
                    key={msg.id || `tu-${i}`}
                    toolName={msg.name}
                    input={msg.input}
                    toolUseId={msg.id}
                    result={toolResultMap.get(msg.id)}
                  />
                )
              }
              if (msg.type === 'text') {
                return (
                  <p
                    key={`t-${i}`}
                    className="whitespace-pre-wrap text-base-text text-xs leading-relaxed"
                  >
                    {msg.text}
                  </p>
                )
              }
              if (msg.type === 'thinking') {
                return (
                  <p
                    key={`th-${i}`}
                    className="whitespace-pre-wrap text-base-text-muted text-xs italic leading-relaxed"
                  >
                    {msg.text}
                  </p>
                )
              }
              return null
            })}
          <div ref={bottomRef} />
        </div>
      )}
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
    <div className="rounded-lg border border-base-border bg-base-raised/50 p-3">
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-base-text-secondary" />
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <span
              className={`rounded px-1.5 py-0.5 font-medium text-xs ${SEVERITY_COLORS[finding.severity]}`}
            >
              {finding.severity}
            </span>
            {goalText && (
              <span className="truncate rounded bg-base-border/60 px-1.5 py-0.5 text-[10px] text-base-text-secondary">
                {goalText}
              </span>
            )}
            <span className="truncate font-medium text-base-text text-sm">{finding.title}</span>
          </div>
          <p className="mb-1 text-base-text-secondary text-xs">{finding.description}</p>
          {finding.url && <p className="mb-1 truncate text-info text-xs">{finding.url}</p>}
          {finding.reproductionSteps.length > 0 && (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="mt-1 flex items-center gap-1 text-base-text-muted text-xs transition-colors hover:text-base-text"
            >
              <ChevronRight
                className={`h-3 w-3 transition-transform ${expanded ? 'rotate-90' : ''}`}
              />
              Reproduction steps ({finding.reproductionSteps.length})
            </button>
          )}
          {expanded && (
            <ol className="mt-2 list-inside list-decimal space-y-1 text-base-text-secondary text-xs">
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
    <div className="rounded-lg border border-base-border bg-base-raised/50">
      <button
        type="button"
        onClick={handleExpand}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-base-border/30"
      >
        <ChevronRight
          className={`h-3.5 w-3.5 shrink-0 text-base-text-muted transition-transform ${expanded ? 'rotate-90' : ''}`}
        />
        <FileCode2 className="h-4 w-4 shrink-0 text-success" />
        <span className="truncate text-base-text">{path}</span>
      </button>
      {expanded && content !== null && (
        <pre className="max-h-100 overflow-x-auto whitespace-pre-wrap border-base-border border-t px-3 pb-3 text-base-text-secondary text-xs">
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
        <Bug className="mx-auto mb-3 h-12 w-12 text-base-text-faint" />
        {hasProject ? (
          <>
            <p className="text-base-text-secondary text-sm">No exploration selected</p>
            <p className="mt-1 text-base-text-muted text-xs">
              Configure goals on the left and start an exploration
            </p>
          </>
        ) : (
          <>
            <p className="text-base-text-secondary text-sm">Select a project to get started</p>
            <p className="mt-1 text-base-text-muted text-xs">
              Choose a project from the dropdown to scan for server details and generate test goals
            </p>
          </>
        )}
      </div>
    </div>
  )
}
