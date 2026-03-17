import { Check, FileText, GitCommit, Loader2 } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo } from 'react'

type CommitCardProps = {
  toolBlocks: Array<{
    name: string
    input: Record<string, unknown>
    id?: string
  }>
  toolResultMap: Map<string, string>
  isStreaming: boolean
}

/** Match a bash tool block to commit workflow phase(s).
 *  Returns the highest-priority phase found (commit > stage > review > analyze).
 *  This handles combined commands like `git add X && git commit ...`. */
function classifyTool(name: string, input: Record<string, unknown>): string | null {
  if (!name.toLowerCase().includes('bash') && !name.toLowerCase().includes('shell')) return null
  const cmd = String(input.command ?? input.cmd ?? '')
  // Check most specific/latest phase first — commit trumps stage in combined commands
  if (cmd.includes('git commit')) return 'commit'
  if (cmd.includes('git add')) return 'stage'
  if (cmd.includes('git log')) return 'review'
  if (cmd.includes('git status') || cmd.includes('git diff')) return 'analyze'
  return null
}

/** Return ALL phases present in a combined command (for phase tracking) */
function classifyToolPhases(name: string, input: Record<string, unknown>): string[] {
  if (!name.toLowerCase().includes('bash') && !name.toLowerCase().includes('shell')) return []
  const cmd = String(input.command ?? input.cmd ?? '')
  const phases: string[] = []
  if (cmd.includes('git status') || cmd.includes('git diff')) phases.push('analyze')
  if (cmd.includes('git log')) phases.push('review')
  if (cmd.includes('git add')) phases.push('stage')
  if (cmd.includes('git commit')) phases.push('commit')
  return phases
}

function parseCommitHash(output: string): string | null {
  const match = output.match(/\[[\w/.+-]+\s+([a-f0-9]{7,})\]/)
  return match ? match[1] : null
}

function parseCommitMessage(output: string): string | null {
  const match = output.match(/\[[\w/.+-]+\s+[a-f0-9]+\]\s+(.+)/)
  return match ? match[1] : null
}

function parseFileStats(output: string): {
  files: string[]
  insertions: number
  deletions: number
} {
  const files: string[] = []
  let insertions = 0
  let deletions = 0

  for (const line of output.split('\n')) {
    // Summary line: "3 files changed, 274 insertions(+), 201 deletions(-)"
    const summary = line.match(
      /(\d+)\s+files?\s+changed(?:,\s+(\d+)\s+insertion)?(?:.*?(\d+)\s+deletion)?/,
    )
    if (summary) {
      insertions = parseInt(summary[2] ?? '0', 10)
      deletions = parseInt(summary[3] ?? '0', 10)
    }
    // File stat lines: " src/foo.tsx | 12 ++--"
    const fileMatch = line.match(/^\s+(.+?)\s+\|/)
    if (fileMatch) {
      files.push(fileMatch[1].trim())
    }
    // Create/delete mode lines
    const modeMatch = line.match(/(?:create|delete)\s+mode\s+\d+\s+(.+)/)
    if (modeMatch && !files.includes(modeMatch[1].trim())) {
      files.push(modeMatch[1].trim())
    }
  }
  return { files, insertions, deletions }
}

type PhaseInfo = {
  id: string
  label: string
  status: 'pending' | 'running' | 'done'
}

export function CommitCard({ toolBlocks, toolResultMap, isStreaming }: CommitCardProps) {
  const { phases, commitHash, commitMessage, fileStats } = useMemo(() => {
    const phaseResults = new Map<string, { done: boolean; result: string }>()
    let hash: string | null = null
    let message: string | null = null
    let stats: { files: string[]; insertions: number; deletions: number } = {
      files: [],
      insertions: 0,
      deletions: 0,
    }

    for (const block of toolBlocks) {
      // Use classifyToolPhases to track ALL phases in combined commands
      const blockPhases = classifyToolPhases(block.name, block.input)
      if (blockPhases.length === 0) continue
      const result = block.id ? (toolResultMap.get(block.id) ?? '') : ''
      const done = result.length > 0

      for (const phase of blockPhases) {
        // Extract data from completed phases
        if (phase === 'commit' && done) {
          hash = parseCommitHash(result)
          message = parseCommitMessage(result)
          const parsed = parseFileStats(result)
          if (parsed.files.length > 0) stats = parsed
        }
        if (phase === 'analyze' && done && stats.files.length === 0) {
          const parsed = parseFileStats(result)
          if (parsed.files.length > 0) stats = parsed
        }

        // Track latest status per phase (some phases have multiple tool calls)
        const existing = phaseResults.get(phase)
        if (!existing || done) {
          phaseResults.set(phase, { done, result })
        }
      }
    }

    // Build ordered phases — only include phases that have tool blocks
    const phaseOrder = [
      { id: 'analyze', label: 'Analyzing changes' },
      { id: 'review', label: 'Reviewing history' },
      { id: 'stage', label: 'Staging files' },
      { id: 'commit', label: 'Committing' },
    ]

    let foundRunning = false
    const builtPhases: PhaseInfo[] = []
    for (const def of phaseOrder) {
      const entry = phaseResults.get(def.id)
      if (!entry) continue
      if (entry.done) {
        builtPhases.push({ id: def.id, label: def.label, status: 'done' })
      } else if (!foundRunning) {
        foundRunning = true
        builtPhases.push({ id: def.id, label: def.label, status: 'running' })
      } else {
        builtPhases.push({ id: def.id, label: def.label, status: 'pending' })
      }
    }

    return { phases: builtPhases, commitHash: hash, commitMessage: message, fileStats: stats }
  }, [toolBlocks, toolResultMap])

  const isDone = commitHash !== null
  const inProgress = !isDone && (isStreaming || phases.some((p) => p.status === 'running'))
  // Auto-expand while in progress, auto-collapse when done
  const showDetails = inProgress || (!isDone && phases.length > 0)

  return (
    <div className="my-1 px-6 py-2">
      <div className="overflow-hidden rounded-lg border border-base-border-subtle bg-base-surface/60">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3">
          <div
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
              isDone ? 'bg-success/30 text-success' : 'bg-base-raised text-base-text-secondary'
            }`}
          >
            {isDone ? (
              <Check size={16} />
            ) : inProgress ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <GitCommit size={16} />
            )}
          </div>

          <div className="min-w-0 flex-1">
            {isDone ? (
              <>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-base-text text-sm">Committed</span>
                  <code className="rounded bg-base-raised px-1.5 py-0.5 font-mono text-warning text-xs">
                    {commitHash}
                  </code>
                </div>
                {commitMessage && (
                  <p className="mt-0.5 truncate text-base-text-secondary text-xs">
                    {commitMessage}
                  </p>
                )}
              </>
            ) : (
              <span className="font-medium text-base-text text-sm">
                {inProgress ? 'Committing...' : 'Commit'}
              </span>
            )}
          </div>

          {isDone && (fileStats.insertions > 0 || fileStats.deletions > 0) && (
            <div className="flex items-center gap-2 text-base-text-muted text-xs">
              {fileStats.files.length > 0 && (
                <span>
                  {fileStats.files.length} file{fileStats.files.length !== 1 ? 's' : ''}
                </span>
              )}
              {fileStats.insertions > 0 && (
                <span className="text-success">+{fileStats.insertions}</span>
              )}
              {fileStats.deletions > 0 && (
                <span className="text-error">&minus;{fileStats.deletions}</span>
              )}
            </div>
          )}
        </div>

        {/* Details — auto-shown during progress, hidden when done */}
        <AnimatePresence>
          {showDetails && phases.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="space-y-3 border-base-border-subtle/60 border-t px-4 py-3">
                {/* Progress phases */}
                <div className="space-y-1.5">
                  {phases.map((phase) => (
                    <div key={phase.id} className="flex items-center gap-2">
                      {phase.status === 'done' && (
                        <Check size={12} className="shrink-0 text-success" />
                      )}
                      {phase.status === 'running' && (
                        <Loader2
                          size={12}
                          className="shrink-0 animate-spin text-base-text-secondary"
                        />
                      )}
                      {phase.status === 'pending' && (
                        <div className="h-3 w-3 shrink-0 rounded-full border border-base-border" />
                      )}
                      <span
                        className={`text-xs ${
                          phase.status === 'done'
                            ? 'text-base-text-secondary'
                            : phase.status === 'running'
                              ? 'text-base-text'
                              : 'text-base-text-faint'
                        }`}
                      >
                        {phase.label}
                      </span>
                    </div>
                  ))}
                </div>

                {/* File list */}
                {fileStats.files.length > 0 && (
                  <div className="space-y-1">
                    <p className="font-medium text-[10px] text-base-text-faint uppercase tracking-wider">
                      Files
                    </p>
                    {fileStats.files.map((file) => (
                      <div key={file} className="flex items-center gap-2">
                        <FileText size={11} className="shrink-0 text-base-text-faint" />
                        <span className="truncate font-mono text-base-text-secondary text-xs">
                          {file}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

/** Check if a user message looks like a commit request */
export function isCommitRequest(userMessage: string): boolean {
  const normalized = userMessage.trim().toLowerCase()
  if (normalized === 'commit' || normalized === 'commit changes' || normalized === 'git commit')
    return true
  if (
    /^(commit|please commit|can you commit|go ahead and commit|now commit|lets commit|let's commit|yep.*commit|yes.*commit)/.test(
      normalized,
    )
  )
    return true
  return false
}

/** Check if an assistant turn's tool blocks look like a commit workflow */
export function hasGitCommitTools(
  toolBlocks: Array<{ name: string; input: Record<string, unknown> }>,
): boolean {
  let hasCommit = false
  let hasAnalyze = false
  for (const block of toolBlocks) {
    const phase = classifyTool(block.name, block.input)
    if (phase === 'commit') hasCommit = true
    if (phase === 'analyze') hasAnalyze = true
  }
  return hasCommit || (hasAnalyze && toolBlocks.length >= 2)
}
