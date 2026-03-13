import { useEffect, useRef, useState } from 'react'
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
import { useTestStore } from '../store/test-store'
import { useTabStore } from '../store/tab-store'
import type { ExplorationMode, FindingSeverity, TestExploration } from '../../../shared/types'

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
      <div className="w-[320px] flex-shrink-0 border-r border-stone-800 flex flex-col">
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
      <div className="min-w-0 flex-1 flex flex-col overflow-hidden">
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
    <div className="p-4 space-y-3 border-b border-stone-800">
      <h2 className="text-sm font-semibold text-stone-100">New Exploration</h2>

      <div>
        <label className="block text-xs text-stone-400 mb-1">URL</label>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com"
          className="w-full bg-stone-800 border border-stone-700 text-stone-100 rounded-lg px-3 py-2 text-sm placeholder:text-stone-500 focus:outline-none focus:border-blue-500"
          disabled={isRunning}
        />
      </div>

      <div>
        <label className="block text-xs text-stone-400 mb-1">Goal</label>
        <textarea
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="Describe what to explore and test..."
          rows={3}
          className="w-full bg-stone-800 border border-stone-700 text-stone-100 rounded-lg px-3 py-2 text-sm placeholder:text-stone-500 focus:outline-none focus:border-blue-500 resize-none"
          disabled={isRunning}
        />
      </div>

      <div>
        <label className="block text-xs text-stone-400 mb-1">Mode</label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode('manual')}
            className={`flex-1 px-3 py-1.5 text-sm rounded-lg border transition-colors ${
              mode === 'manual'
                ? 'bg-blue-600/20 border-blue-500 text-blue-400'
                : 'bg-stone-800 border-stone-700 text-stone-400 hover:text-stone-300'
            }`}
            disabled={isRunning}
          >
            Manual
          </button>
          <button
            type="button"
            onClick={() => setMode('requirements')}
            className={`flex-1 px-3 py-1.5 text-sm rounded-lg border transition-colors ${
              mode === 'requirements'
                ? 'bg-blue-600/20 border-blue-500 text-blue-400'
                : 'bg-stone-800 border-stone-700 text-stone-400 hover:text-stone-300'
            }`}
            disabled={isRunning}
          >
            Requirements
          </button>
        </div>
      </div>

      {mode === 'requirements' && (
        <div>
          <label className="block text-xs text-stone-400 mb-1">Requirements</label>
          <textarea
            value={requirements}
            onChange={(e) => setRequirements(e.target.value)}
            placeholder="List requirements to verify..."
            rows={4}
            className="w-full bg-stone-800 border border-stone-700 text-stone-100 rounded-lg px-3 py-2 text-sm placeholder:text-stone-500 focus:outline-none focus:border-blue-500 resize-none"
            disabled={isRunning}
          />
        </div>
      )}

      <div>
        <label className="block text-xs text-stone-400 mb-1">E2E Output Path</label>
        <input
          type="text"
          value={e2ePath}
          onChange={(e) => setE2ePath(e.target.value)}
          className="w-full bg-stone-800 border border-stone-700 text-stone-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
          disabled={isRunning}
        />
        {e2eReason && (
          <p className="mt-1 text-xs text-stone-500">{e2eReason}</p>
        )}
      </div>

      {isRunning ? (
        <button
          type="button"
          onClick={onStop}
          className="w-full flex items-center justify-center gap-2 bg-red-600/20 text-red-400 hover:bg-red-600/30 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
        >
          <Square className="w-4 h-4" />
          Stop Exploration
        </button>
      ) : (
        <button
          type="button"
          onClick={onStart}
          disabled={!canStart}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-stone-700 disabled:text-stone-500 text-white rounded-lg px-3 py-2 text-sm font-medium transition-colors"
        >
          <Play className="w-4 h-4" />
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

function ExplorationHistory({ explorations, activeId, onSelect, onDelete }: ExplorationHistoryProps) {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-3">
        <h3 className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-2">
          History
        </h3>
        {explorations.length === 0 ? (
          <p className="text-xs text-stone-500 py-2">No explorations yet</p>
        ) : (
          <div className="space-y-1">
            {explorations.map((exp) => (
              <button
                key={exp.id}
                type="button"
                onClick={() => onSelect(exp.id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors group ${
                  activeId === exp.id
                    ? 'bg-stone-700/50 text-stone-100'
                    : 'text-stone-300 hover:bg-stone-800/50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_COLORS[exp.status] ?? 'bg-stone-500'}`}
                  />
                  <span className="truncate flex-1">{truncateUrl(exp.url)}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onDelete(exp.id)
                    }}
                    className="opacity-0 group-hover:opacity-100 text-stone-500 hover:text-red-400 transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex items-center gap-2 mt-1 text-xs text-stone-500">
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

function ExplorationDetail({ exploration, streamingText, findings, tests, cwd }: ExplorationDetailProps) {
  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Status bar */}
      <StatusBar exploration={exploration} findingsCount={findings.length} testsCount={tests.length} />

      {/* Error banner */}
      {exploration.errorMessage && (
        <div className="mx-4 mt-3 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          {exploration.errorMessage}
        </div>
      )}

      {/* Streaming text */}
      {exploration.status === 'running' && streamingText && (
        <StreamingPanel text={streamingText} />
      )}

      {/* Findings */}
      {findings.length > 0 && (
        <div className="px-4 py-3">
          <h3 className="text-sm font-semibold text-stone-100 mb-2 flex items-center gap-2">
            <Bug className="w-4 h-4 text-yellow-400" />
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
          <h3 className="text-sm font-semibold text-stone-100 mb-2 flex items-center gap-2">
            <FileCode2 className="w-4 h-4 text-green-400" />
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
    <div className="px-4 py-3 border-b border-stone-800 flex items-center gap-4 text-sm">
      <div className="flex items-center gap-2">
        <span className={`w-2.5 h-2.5 rounded-full ${STATUS_COLORS[exploration.status] ?? 'bg-stone-500'}`} />
        <span className="text-stone-100 capitalize">{exploration.status}</span>
      </div>
      <div className="text-stone-400">
        {findingsCount} {findingsCount === 1 ? 'finding' : 'findings'}
      </div>
      <div className="text-stone-400">
        {testsCount} {testsCount === 1 ? 'test' : 'tests'}
      </div>
      {exploration.totalCostUsd > 0 && (
        <div className="text-stone-500 ml-auto">{formatCost(exploration.totalCostUsd)}</div>
      )}
    </div>
  )
}

// -- Streaming Panel --

function StreamingPanel({ text }: { text: string }) {
  const ref = useRef<HTMLPreElement>(null)

  useEffect(() => {
    if (ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight
    }
  }, [text])

  return (
    <div className="px-4 pt-3">
      <div className="flex items-center gap-2 mb-2">
        <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
        <span className="text-xs text-stone-400">Exploring...</span>
      </div>
      <pre
        ref={ref}
        className="bg-stone-900/50 rounded-lg p-3 text-xs text-stone-300 whitespace-pre-wrap overflow-auto max-h-[300px] border border-stone-800"
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
    <div className="bg-stone-800/50 rounded-lg p-3 border border-stone-700">
      <div className="flex items-start gap-2">
        <Icon className="w-4 h-4 mt-0.5 flex-shrink-0 text-stone-400" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`px-1.5 py-0.5 rounded text-xs font-medium ${SEVERITY_COLORS[finding.severity]}`}
            >
              {finding.severity}
            </span>
            <span className="text-sm font-medium text-stone-100 truncate">{finding.title}</span>
          </div>
          <p className="text-xs text-stone-400 mb-1">{finding.description}</p>
          {finding.url && (
            <p className="text-xs text-blue-400 truncate mb-1">{finding.url}</p>
          )}
          {finding.reproductionSteps.length > 0 && (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 text-xs text-stone-500 hover:text-stone-300 transition-colors mt-1"
            >
              <ChevronRight
                className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`}
              />
              Reproduction steps ({finding.reproductionSteps.length})
            </button>
          )}
          {expanded && (
            <ol className="mt-2 space-y-1 text-xs text-stone-400 list-decimal list-inside">
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
    <div className="bg-stone-800/50 rounded-lg border border-stone-700">
      <button
        type="button"
        onClick={handleExpand}
        className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-stone-700/30"
      >
        <ChevronRight
          className={`w-3.5 h-3.5 text-stone-500 transition-transform flex-shrink-0 ${expanded ? 'rotate-90' : ''}`}
        />
        <FileCode2 className="w-4 h-4 text-green-400 flex-shrink-0" />
        <span className="text-stone-300 truncate">{path}</span>
      </button>
      {expanded && content !== null && (
        <pre className="px-3 pb-3 text-xs text-stone-400 whitespace-pre-wrap overflow-x-auto max-h-[400px] border-t border-stone-700">
          {content}
        </pre>
      )}
    </div>
  )
}

// -- Empty State --

function EmptyState() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center">
        <Bug className="w-12 h-12 text-stone-600 mx-auto mb-3" />
        <p className="text-stone-400 text-sm">No exploration selected</p>
        <p className="text-stone-500 text-xs mt-1">
          Configure an exploration on the left to get started
        </p>
      </div>
    </div>
  )
}
