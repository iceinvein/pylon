import { Check, FileText, Loader2, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import type { CommitGroup } from '../../../../shared/git-types'
import { useGitCommitStore } from '../../store/git-commit-store'
import { CommitPlanCard } from './CommitPlanCard'

type GitCommitTabProps = {
  cwd: string
  sessionId: string | null
}

export function GitCommitTab({ cwd, sessionId }: GitCommitTabProps) {
  const {
    workingTree,
    commitPlan,
    analyzing,
    error,
    fetchStatus,
    analyzePlan,
    executeGroup,
    generateMessage,
    stageFiles,
    unstageFiles,
    setCommitPlan,
  } = useGitCommitStore()
  const [commitMsg, setCommitMsg] = useState('')
  const [executing, setExecuting] = useState<number | null>(null)
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    if (cwd) fetchStatus(cwd)
  }, [cwd, fetchStatus])

  const handleAnalyze = useCallback(async () => {
    if (!sessionId) return
    await analyzePlan(cwd, sessionId)
  }, [cwd, sessionId, analyzePlan])

  const handleGenerateMsg = useCallback(async () => {
    if (!sessionId) return
    setGenerating(true)
    const msg = await generateMessage(cwd, sessionId)
    if (msg) setCommitMsg(msg)
    setGenerating(false)
  }, [cwd, sessionId, generateMessage])

  const handleExecuteGroup = useCallback(
    async (group: CommitGroup, index: number) => {
      setExecuting(index)
      await executeGroup(cwd, group)
      await fetchStatus(cwd)
      setExecuting(null)
    },
    [cwd, executeGroup, fetchStatus],
  )

  const handleToggleStage = useCallback(
    async (path: string, currentlyStaged: boolean) => {
      if (currentlyStaged) {
        await unstageFiles(cwd, [path])
      } else {
        await stageFiles(cwd, [path])
      }
      await fetchStatus(cwd)
    },
    [cwd, stageFiles, unstageFiles, fetchStatus],
  )

  const handleManualCommit = useCallback(async () => {
    if (!commitMsg.trim()) return
    const staged = workingTree.filter((f) => f.staged)
    if (staged.length === 0) return
    const group: CommitGroup = {
      title: commitMsg,
      message: commitMsg,
      files: staged.map((f) => ({ path: f.path })),
      order: 1,
      rationale: 'Manual commit',
    }
    await executeGroup(cwd, group)
    setCommitMsg('')
    await fetchStatus(cwd)
  }, [cwd, commitMsg, workingTree, executeGroup, fetchStatus])

  const stagedCount = workingTree.filter((f) => f.staged).length

  if (workingTree.length === 0 && !commitPlan) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-4">
        <Check size={20} className="text-stone-700" />
        <p className="text-stone-600 text-xs">Working tree clean</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* AI Commit Plan */}
      {commitPlan ? (
        <div className="flex-1 overflow-y-auto p-3">
          <div className="mb-3 flex items-center justify-between">
            <p className="font-medium text-stone-300 text-xs">Commit Plan</p>
            <button
              type="button"
              onClick={() => setCommitPlan(null)}
              className="text-[10px] text-stone-500 hover:text-stone-300"
            >
              Dismiss
            </button>
          </div>
          <p className="mb-3 text-[10px] text-stone-500 italic">{commitPlan.reasoning}</p>
          <div className="flex flex-col gap-2">
            {commitPlan.groups.map((group, i) => (
              <CommitPlanCard
                key={`${group.order}-${group.title}`}
                group={group}
                onExecute={() => handleExecuteGroup(group, i)}
                onEditMessage={(msg) => {
                  const updated = { ...commitPlan }
                  updated.groups = [...updated.groups]
                  updated.groups[i] = { ...updated.groups[i], message: msg }
                  setCommitPlan(updated)
                }}
                executing={executing === i}
              />
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* File list */}
          <div className="flex-1 overflow-y-auto p-2">
            {workingTree.map((file) => (
              <label
                key={file.path}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors hover:bg-stone-800/50"
              >
                <input
                  type="checkbox"
                  checked={file.staged}
                  onChange={() => handleToggleStage(file.path, file.staged)}
                  className="h-3 w-3 rounded border-stone-600 bg-stone-800 accent-amber-600"
                />
                <FileText size={11} className="flex-shrink-0 text-stone-500" />
                <span className="min-w-0 flex-1 truncate font-[family-name:var(--font-mono)] text-stone-300">
                  {file.path}
                </span>
                <span
                  className={`flex-shrink-0 text-[10px] ${
                    file.status === 'added'
                      ? 'text-emerald-400'
                      : file.status === 'deleted'
                        ? 'text-red-400'
                        : 'text-yellow-400'
                  }`}
                >
                  {file.status[0]?.toUpperCase()}
                </span>
              </label>
            ))}
          </div>

          {/* Commit input */}
          <div className="border-stone-800 border-t p-3">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={commitMsg}
                onChange={(e) => setCommitMsg(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.metaKey) handleManualCommit()
                }}
                placeholder="Commit message..."
                className="min-w-0 flex-1 rounded bg-stone-800 px-2.5 py-1.5 text-stone-200 text-xs outline-none ring-1 ring-stone-700 placeholder:text-stone-600 focus:ring-stone-500"
              />
              <button
                type="button"
                onClick={handleGenerateMsg}
                disabled={generating || !sessionId}
                className="rounded p-1.5 text-stone-500 transition-colors hover:bg-stone-800 hover:text-amber-400 disabled:opacity-50"
                title="Generate commit message"
              >
                {generating ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Sparkles size={13} />
                )}
              </button>
            </div>

            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={handleManualCommit}
                disabled={!commitMsg.trim() || stagedCount === 0}
                className="flex-1 rounded bg-emerald-600 px-3 py-1.5 font-medium text-white text-xs transition-colors hover:bg-emerald-500 disabled:opacity-50"
              >
                Commit ({stagedCount} staged)
              </button>
              <button
                type="button"
                onClick={handleAnalyze}
                disabled={analyzing || !sessionId || workingTree.length === 0}
                className="flex items-center gap-1.5 rounded border border-amber-700 px-3 py-1.5 text-amber-400 text-xs transition-colors hover:bg-amber-950/30 disabled:opacity-50"
              >
                {analyzing ? (
                  <Loader2 size={11} className="animate-spin" />
                ) : (
                  <Sparkles size={11} />
                )}
                Analyze
              </button>
            </div>
          </div>
        </>
      )}

      {error && (
        <div className="border-stone-800 border-t bg-red-950/30 px-3 py-2 text-red-400 text-xs">
          {error}
        </div>
      )}
    </div>
  )
}
