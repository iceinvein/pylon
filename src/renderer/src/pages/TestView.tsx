import {
  AlertTriangle,
  Bug,
  ChevronRight,
  FileCode2,
  Info,
  Loader2,
  Play,
  Square,
  Trash2,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ExplorationMode, FindingSeverity, TestExploration } from '../../../shared/types'
import { useTabStore } from '../store/tab-store'
import { useTestStore } from '../store/test-store'

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

function truncateUrl(url: string, maxLen = 30): string {
  try {
    const u = new URL(url)
    const display = u.hostname + u.pathname
    return display.length > maxLen ? `${display.slice(0, maxLen)}...` : display
  } catch {
    return url.length > maxLen ? `${url.slice(0, maxLen)}...` : url
  }
}

export function TestView() {
  const [url, setUrl] = useState('')
  const [goal, setGoal] = useState('')
  const [mode, setMode] = useState<ExplorationMode>('manual')
  const [requirements, setRequirements] = useState('')
  const [e2ePath, setE2ePath] = useState('e2e')
  const [e2eReason, setE2eReason] = useState('')

  const activeTab = useTabStore((s) => s.tabs.find((t) => t.id === s.activeTabId))
  const cwd = activeTab?.cwd ?? ''

  const {
    activeExploration,
    explorationStreamingText,
    explorationFindings,
    generatedTests,
    explorations,
    startExploration,
    stopExploration,
    loadExplorations,
    loadExploration,
    deleteExploration,
    resolveE2ePath,
  } = useTestStore()

  useEffect(() => {
    if (!cwd) return
    resolveE2ePath(cwd).then((res) => {
      setE2ePath(res.path)
      setE2eReason(res.reason)
    })
    loadExplorations(cwd)
  }, [cwd, resolveE2ePath, loadExplorations])

  const isRunning = activeExploration?.status === 'running'
  const canStart = url.trim() !== '' && goal.trim() !== '' && !isRunning

  const handleStart = () => {
    if (!canStart || !cwd) return
    startExploration(cwd, {
      url,
      goal,
      mode,
      requirements: mode === 'requirements' ? requirements : undefined,
      e2eOutputPath: e2ePath,
      e2ePathReason: e2eReason,
    })
  }

  const handleStop = () => {
    if (activeExploration) {
      stopExploration(activeExploration.id)
    }
  }

  return (
    <div className="flex h-full">
      {/* Left panel */}
      <div className="flex w-[320px] flex-shrink-0 flex-col border-stone-800 border-r">
        <ConfigForm
          url={url}
          setUrl={setUrl}
          goal={goal}
          setGoal={setGoal}
          mode={mode}
          setMode={setMode}
          requirements={requirements}
          setRequirements={setRequirements}
          e2ePath={e2ePath}
          setE2ePath={setE2ePath}
          e2eReason={e2eReason}
          isRunning={isRunning}
          canStart={canStart}
          onStart={handleStart}
          onStop={handleStop}
        />
        <ExplorationHistory
          explorations={explorations}
          activeId={activeExploration?.id ?? null}
          onSelect={loadExploration}
          onDelete={deleteExploration}
        />
      </div>

      {/* Right panel */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {activeExploration ? (
          <ExplorationDetail
            exploration={activeExploration}
            streamingText={explorationStreamingText}
            findings={explorationFindings}
            tests={generatedTests}
            cwd={cwd}
          />
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  )
}

// -- Config Form --

type ConfigFormProps = {
  url: string
  setUrl: (v: string) => void
  goal: string
  setGoal: (v: string) => void
  mode: ExplorationMode
  setMode: (v: ExplorationMode) => void
  requirements: string
  setRequirements: (v: string) => void
  e2ePath: string
  setE2ePath: (v: string) => void
  e2eReason: string
  isRunning: boolean
  canStart: boolean
  onStart: () => void
  onStop: () => void
}

function ConfigForm({
  url,
  setUrl,
  goal,
  setGoal,
  mode,
  setMode,
  requirements,
  setRequirements,
  e2ePath,
  setE2ePath,
  e2eReason,
  isRunning,
  canStart,
  onStart,
  onStop,
}: ConfigFormProps) {
  return (
    <div className="space-y-3 border-stone-800 border-b p-4">
      <h2 className="font-semibold text-sm text-stone-100">New Exploration</h2>

      <label className="block">
        <span className="mb-1 block text-stone-400 text-xs">URL</span>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com"
          className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-sm text-stone-100 placeholder:text-stone-500 focus:border-blue-500 focus:outline-none"
          disabled={isRunning}
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-stone-400 text-xs">Goal</span>
        <textarea
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="Describe what to explore and test..."
          rows={3}
          className="w-full resize-none rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-sm text-stone-100 placeholder:text-stone-500 focus:border-blue-500 focus:outline-none"
          disabled={isRunning}
        />
      </label>

      <div>
        <span className="mb-1 block text-stone-400 text-xs">Mode</span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode('manual')}
            className={`flex-1 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
              mode === 'manual'
                ? 'border-blue-500 bg-blue-600/20 text-blue-400'
                : 'border-stone-700 bg-stone-800 text-stone-400 hover:text-stone-300'
            }`}
            disabled={isRunning}
          >
            Manual
          </button>
          <button
            type="button"
            onClick={() => setMode('requirements')}
            className={`flex-1 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
              mode === 'requirements'
                ? 'border-blue-500 bg-blue-600/20 text-blue-400'
                : 'border-stone-700 bg-stone-800 text-stone-400 hover:text-stone-300'
            }`}
            disabled={isRunning}
          >
            Requirements
          </button>
        </div>
      </div>

      {mode === 'requirements' && (
        <label className="block">
          <span className="mb-1 block text-stone-400 text-xs">Requirements</span>
          <textarea
            value={requirements}
            onChange={(e) => setRequirements(e.target.value)}
            placeholder="List requirements to verify..."
            rows={4}
            className="w-full resize-none rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-sm text-stone-100 placeholder:text-stone-500 focus:border-blue-500 focus:outline-none"
            disabled={isRunning}
          />
        </label>
      )}

      <label className="block">
        <span className="mb-1 block text-stone-400 text-xs">E2E Output Path</span>
        <input
          type="text"
          value={e2ePath}
          onChange={(e) => setE2ePath(e.target.value)}
          className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-sm text-stone-100 focus:border-blue-500 focus:outline-none"
          disabled={isRunning}
        />
        {e2eReason && <p className="mt-1 text-stone-500 text-xs">{e2eReason}</p>}
      </label>

      {isRunning ? (
        <button
          type="button"
          onClick={onStop}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-600/20 px-3 py-2 font-medium text-red-400 text-sm transition-colors hover:bg-red-600/30"
        >
          <Square className="h-4 w-4" />
          Stop Exploration
        </button>
      ) : (
        <button
          type="button"
          onClick={onStart}
          disabled={!canStart}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 font-medium text-sm text-white transition-colors hover:bg-blue-500 disabled:bg-stone-700 disabled:text-stone-500"
        >
          <Play className="h-4 w-4" />
          Start Exploration
        </button>
      )}
    </div>
  )
}

// -- Exploration History --

type ExplorationHistoryProps = {
  explorations: TestExploration[]
  activeId: string | null
  onSelect: (id: string) => void
  onDelete: (id: string) => void
}

function ExplorationHistory({
  explorations,
  activeId,
  onSelect,
  onDelete,
}: ExplorationHistoryProps) {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-3">
        <h3 className="mb-2 font-semibold text-stone-400 text-xs uppercase tracking-wider">
          History
        </h3>
        {explorations.length === 0 ? (
          <p className="py-2 text-stone-500 text-xs">No explorations yet</p>
        ) : (
          <div className="space-y-1">
            {explorations.map((exp) => (
              <button
                key={exp.id}
                type="button"
                onClick={() => onSelect(exp.id)}
                className={`group w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  activeId === exp.id
                    ? 'bg-stone-700/50 text-stone-100'
                    : 'text-stone-300 hover:bg-stone-800/50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 flex-shrink-0 rounded-full ${STATUS_COLORS[exp.status] ?? 'bg-stone-500'}`}
                  />
                  <span className="flex-1 truncate">{truncateUrl(exp.url)}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onDelete(exp.id)
                    }}
                    className="text-stone-500 opacity-0 transition-all hover:text-red-400 group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="mt-1 flex items-center gap-2 text-stone-500 text-xs">
                  <span>{formatDate(exp.createdAt)}</span>
                  {exp.findingsCount > 0 && (
                    <span className="text-yellow-500">{exp.findingsCount} findings</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// -- Exploration Detail (Right Panel) --

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
              <FindingCard key={f.id} finding={f} />
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

// -- Status Bar --

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

// -- Streaming Panel --

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
        <span className="text-stone-400 text-xs">Exploring...</span>
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

// -- Finding Card --

function FindingCard({ finding }: { finding: import('../../../shared/types').TestFinding }) {
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

// -- Generated Test Item --

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

// -- Empty State --

function EmptyState() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="text-center">
        <Bug className="mx-auto mb-3 h-12 w-12 text-stone-600" />
        <p className="text-sm text-stone-400">No exploration selected</p>
        <p className="mt-1 text-stone-500 text-xs">
          Configure an exploration on the left to get started
        </p>
      </div>
    </div>
  )
}
