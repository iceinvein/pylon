import { GitCompareArrows, GitPullRequestArrow, Info, Workflow } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  Attachment,
  EffortLevel,
  ImageAttachment,
  IpcAttachment,
  PermissionMode,
  SessionMode,
} from '../../../shared/types'
import { ChangesPanel } from '../components/ChangesPanel'
import { FlowPanel } from '../components/flow/FlowPanel'
import { InputBar } from '../components/InputBar'
import { TasksPanel } from '../components/layout/TasksPanel'
import { ChatView } from '../components/messages/ChatView'
import { PanelHeader } from '../components/PanelHeader'
import { PrRaiseOverlay } from '../components/pr-raise/PrRaiseOverlay'
import { ReviewPanel } from '../components/review/ReviewPanel'
import { SessionInfoPanel } from '../components/SessionInfoPanel'
import { Tooltip } from '../components/Tooltip'
import { WorktreeSetupModal } from '../components/WorktreeSetupModal'
import { usePersistedWidth } from '../hooks/use-persisted-width'
import { fadeUpSmall, stagger } from '../lib/animations'
import { usePrRaiseStore } from '../store/pr-raise-store'
import { useSessionStore } from '../store/session-store'

const emptyFiles: string[] = []

type SessionViewProps = {
  sessionId: string
  isActive: boolean
}

export function SessionView({ sessionId, isActive }: SessionViewProps) {
  const updateSession = useSessionStore((s) => s.updateSession)
  const session = useSessionStore((s) => s.sessions.get(sessionId))
  const [pendingModel, setPendingModel] = useState(session?.model || 'claude-opus-4-6')
  const [effort, setEffort] = useState<EffortLevel>('high')
  const [permissionMode, setPermissionMode] = useState<PermissionMode>('default')
  const sessionMode = useSessionStore(
    (s) => (sessionId ? s.sessions.get(sessionId)?.mode ?? 'normal' : 'normal') as SessionMode,
  )

  // Provider models for plan mode support detection
  type ProviderModelEntry = { id: string; label: string; provider: string }
  const [providerModels, setProviderModels] = useState<ProviderModelEntry[]>([])
  useEffect(() => {
    window.api.getProviderModels().then((models) => {
      if (models && models.length > 0) {
        setProviderModels(models.map((m) => ({ id: m.id, label: m.label, provider: m.provider })))
      }
    })
  }, [])

  const cwd = session?.cwd ?? ''
  const currentModel = session?.model || pendingModel
  const currentProvider = providerModels.find((m) => m.id === currentModel)?.provider ?? 'claude'
  const providerSupportsPlanMode = currentProvider === 'claude'
  const isRunning =
    session?.status === 'running' || session?.status === 'starting' || session?.status === 'waiting'

  // Sync UI state from backend for the active session
  useEffect(() => {
    window.api.getSessionInfo(sessionId).then((info) => {
      if (info) {
        setPendingModel(info.model)
        setPermissionMode(info.permissionMode as PermissionMode)
      }
    })
  }, [sessionId])

  // Worktree state (replaces tab.useWorktree)
  const [isWorktree, setIsWorktree] = useState(false)
  useEffect(() => {
    window.api.getWorktreeInfo(sessionId).then((info) => {
      setIsWorktree(!!info.worktreePath)
    })
  }, [sessionId])

  // Check git branch status on mount/session switch
  const setBranchStatus = useSessionStore((s) => s.setBranchStatus)
  const branchStatus = useSessionStore((s) => s.branchStatus.get(cwd))
  useEffect(() => {
    if (!cwd) return
    window.api.getGitBranchStatus(cwd).then((status) => {
      setBranchStatus(cwd, status)
    })
  }, [cwd, setBranchStatus])

  async function handleSend(text: string, attachments: Attachment[]) {
    if (!sessionId) return

    // Optimistically add user message to store
    const userContent: unknown[] = []
    for (const att of attachments) {
      if (att.type === 'image') {
        userContent.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: (att as ImageAttachment).mediaType,
            data: (att as ImageAttachment).base64,
          },
        })
      }
    }
    if (text) {
      userContent.push({ type: 'text', text })
    }

    useSessionStore.getState().appendMessage(sessionId, {
      type: 'user',
      content:
        userContent.length === 1 &&
        userContent[0] &&
        (userContent[0] as { type: string }).type === 'text'
          ? text
          : userContent,
    })

    // Convert attachments for IPC
    const ipcAttachments: IpcAttachment[] = attachments.map((att) => {
      if (att.type === 'image') {
        const img = att as ImageAttachment
        return {
          type: 'image',
          content: img.base64,
          mediaType: img.mediaType,
          name: img.name,
        }
      }
      return {
        type: 'file',
        content: (att as import('../../../shared/types').FileAttachment).content ?? '',
        name: att.name,
      }
    })

    await window.api.sendMessage(sessionId, text, ipcAttachments)
  }

  const handleModelChange = useCallback(
    async (model: string) => {
      setPendingModel(model)
      // 'max' effort is only available on Opus — downgrade to 'high' when switching away
      if (model !== 'claude-opus-4-6' && effort === 'max') {
        setEffort('high')
        if (sessionId) {
          await window.api.setEffort(sessionId, 'high')
        }
      }
      if (sessionId) {
        updateSession(sessionId, { model })
        await window.api.setModel(sessionId, model)
      }
    },
    [sessionId, effort, updateSession],
  )

  const handleEffortChange = useCallback(
    async (level: EffortLevel) => {
      setEffort(level)
      if (sessionId) {
        await window.api.setEffort(sessionId, level)
      }
    },
    [sessionId],
  )

  const handlePermissionModeChange = useCallback(
    async (mode: PermissionMode) => {
      setPermissionMode(mode)
      if (sessionId) {
        await window.api.setPermissionMode(sessionId, mode)
      }
    },
    [sessionId],
  )

  async function handleStop() {
    if (!sessionId) return
    await window.api.stopSession(sessionId)
    updateSession(sessionId, { status: 'done' })
  }

  const changedFilesRaw = useSessionStore((s) =>
    sessionId ? s.changedFiles.get(sessionId) : undefined,
  )
  const changedFiles = changedFilesRaw ?? emptyFiles
  const [showChanges, setShowChanges] = useState(false)
  const [showFlow, setShowFlow] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  const { width: panelWidth, onDragStart: handleChangesDragStart } = usePersistedWidth({
    key: 'changes-panel',
    defaultWidth: 360,
    min: 300,
    max: 700,
    direction: 'left',
  })
  const { width: flowPanelWidth, onDragStart: handleFlowDragStart } = usePersistedWidth({
    key: 'flow-panel',
    defaultWidth: 280,
    min: 220,
    max: 450,
    direction: 'left',
  })
  const { width: infoPanelWidth, onDragStart: handleInfoDragStart } = usePersistedWidth({
    key: 'info-panel',
    defaultWidth: 260,
    min: 200,
    max: 400,
    direction: 'left',
  })

  // Keep a ref to sessionMode to avoid stale closure in keyboard handler
  const sessionModeRef = useRef(sessionMode)
  sessionModeRef.current = sessionMode

  // Cmd+Shift keyboard shortcuts for right-side panels
  useEffect(() => {
    if (!isActive || !sessionId) return
    function handlePanelKeys(e: KeyboardEvent) {
      if (!e.metaKey || !e.shiftKey || e.altKey || e.ctrlKey) return
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault()
        setShowFlow((v) => !v)
      } else if (e.key === 'c' || e.key === 'C') {
        e.preventDefault()
        setShowChanges((v) => !v)
      } else if (e.key === 'i' || e.key === 'I') {
        e.preventDefault()
        setShowInfo((v) => !v)
      } else if (e.key === 'l' || e.key === 'L') {
        e.preventDefault()
        if (providerSupportsPlanMode) {
          const nextMode = sessionModeRef.current === 'plan' ? 'normal' : 'plan'
          window.api.setSessionMode(sessionId, nextMode)
        }
      }
    }
    window.addEventListener('keydown', handlePanelKeys)
    return () => window.removeEventListener('keydown', handlePanelKeys)
  }, [isActive, sessionId, providerSupportsPlanMode])

  return (
    <>
      <div className="flex h-full">
        {/* Main chat column */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1">
            {sessionId ? (
              <ChatView sessionId={sessionId} isActive={isActive} />
            ) : (
              <div className="flex h-full items-center justify-center">
                <motion.div
                  className="w-full max-w-md px-6"
                  initial="hidden"
                  animate="show"
                  variants={stagger(0.06)}
                >
                  <motion.p
                    className="font-display text-2xl text-base-text-secondary italic"
                    variants={fadeUpSmall}
                  >
                    What shall we build?
                  </motion.p>
                  <motion.p className="mt-2 text-base-text-faint text-sm" variants={fadeUpSmall}>
                    Try one of these, or type your own below.
                  </motion.p>
                  <div className="mt-6 flex flex-col gap-2">
                    {[
                      'Explain this codebase — what does it do and how is it structured?',
                      'Find and fix any bugs in the recent changes',
                      'Add tests for the untested functions',
                      'Refactor the largest file into smaller modules',
                    ].map((prompt) => (
                      <motion.button
                        type="button"
                        key={prompt}
                        onClick={() => handleSend(prompt, [])}
                        variants={fadeUpSmall}
                        className="rounded-lg border border-base-border/70 px-4 py-2.5 text-left text-base-text-secondary text-sm transition-all hover:border-base-border hover:bg-base-raised/40 hover:text-base-text"
                      >
                        {prompt}
                      </motion.button>
                    ))}
                  </div>
                  <motion.div
                    className="mt-6 grid grid-cols-2 gap-x-6 gap-y-1"
                    variants={fadeUpSmall}
                  >
                    {[
                      { keys: '/', label: 'Slash commands' },
                      { keys: '⌘K', label: 'Command palette' },
                      { keys: '⌘N', label: 'New session' },
                      { keys: '⌘⇧F', label: 'Flow panel' },
                      { keys: '⌘⇧C', label: 'Changed files' },
                      { keys: '⌘?', label: 'All shortcuts' },
                    ].map((tip) => (
                      <div key={tip.keys} className="flex items-center gap-2 py-0.5">
                        <kbd className="inline-flex min-w-5 justify-center rounded border border-base-border px-1 py-0.5 font-mono text-base-text-muted text-xs">
                          {tip.keys}
                        </kbd>
                        <span className="text-base-text-faint text-xs">{tip.label}</span>
                      </div>
                    ))}
                  </motion.div>
                </motion.div>
              </div>
            )}
          </div>
          <TasksPanel sessionId={sessionId} />
          <div>
            <InputBar
              sessionId={sessionId}
              isActive={isActive}
              isRunning={isRunning}
              model={currentModel}
              onModelChange={handleModelChange}
              effort={effort}
              onEffortChange={handleEffortChange}
              permissionMode={permissionMode}
              onPermissionModeChange={handlePermissionModeChange}
              onSend={handleSend}
              onStop={handleStop}
              behindCount={branchStatus?.behind}
              mode={sessionMode}
              onModeChange={(newMode) => {
                window.api.setSessionMode(sessionId, newMode)
              }}
              providerSupportsPlanMode={providerSupportsPlanMode}
            />
          </div>
        </div>
        {/* Right-edge panels */}
        {sessionId && (
          <>
            {/* Flow panel */}
            <AnimatePresence initial={false}>
              {showFlow && (
                <motion.div
                  key="flow-panel"
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: flowPanelWidth + 5, opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
                  className="flex shrink-0 overflow-hidden"
                >
                  <div
                    onMouseDown={handleFlowDragStart}
                    className="flex w-1 shrink-0 cursor-col-resize items-center justify-center border-base-border-subtle border-l bg-base-bg transition-colors hover:bg-base-border active:bg-base-text-faint"
                  />
                  <div className="flex min-w-0 flex-1 flex-col bg-base-bg">
                    <PanelHeader
                      icon={<Workflow size={13} />}
                      title="Flow"
                      onClose={() => setShowFlow(false)}
                    />
                    <FlowPanel />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Changes panel */}
            <AnimatePresence initial={false}>
              {showChanges && (
                <motion.div
                  key="changes-panel"
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: panelWidth + 5, opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
                  className="flex shrink-0 overflow-hidden"
                >
                  <div
                    onMouseDown={handleChangesDragStart}
                    className="flex w-1 shrink-0 cursor-col-resize items-center justify-center border-base-border-subtle border-l bg-base-bg transition-colors hover:bg-base-border active:bg-base-text-faint"
                  />
                  <div className="flex min-w-0 flex-1 flex-col bg-base-bg">
                    <PanelHeader
                      icon={<GitCompareArrows size={13} />}
                      title="Changes"
                      onClose={() => setShowChanges(false)}
                    />
                    <ChangesPanel />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Review panel — rendered as overlay (see bottom of component) */}

            {/* Info panel */}
            <AnimatePresence initial={false}>
              {showInfo && (
                <motion.div
                  key="info-panel"
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: infoPanelWidth + 5, opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
                  className="flex shrink-0 overflow-hidden"
                >
                  <div
                    onMouseDown={handleInfoDragStart}
                    className="flex w-1 shrink-0 cursor-col-resize items-center justify-center border-base-border-subtle border-l bg-base-bg transition-colors hover:bg-base-border active:bg-base-text-faint"
                  />
                  <div className="flex min-w-0 flex-1 flex-col bg-base-bg">
                    <PanelHeader
                      icon={<Info size={13} />}
                      title="Session"
                      onClose={() => setShowInfo(false)}
                    />
                    <SessionInfoPanel sessionId={sessionId} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Icon strip with labels */}
            <div className="flex w-10 shrink-0 flex-col items-center gap-0.5 border-base-border-subtle border-l bg-base-bg pt-1">
              <Tooltip content="Agent Flow" shortcut="⌘⇧F" side="left">
                <button
                  type="button"
                  onClick={() => setShowFlow((v) => !v)}
                  aria-label={showFlow ? 'Hide flow panel' : 'Show flow panel'}
                  aria-pressed={showFlow}
                  className={`group flex h-10 w-10 flex-col items-center justify-center gap-0.5 rounded-lg transition-colors hover:bg-base-raised/60 ${
                    showFlow ? 'bg-accent/10' : ''
                  }`}
                >
                  <Workflow
                    size={15}
                    className={`transition-colors ${
                      showFlow
                        ? 'text-accent-text'
                        : 'text-base-text-muted group-hover:text-base-text'
                    }`}
                  />
                  <span
                    className={`text-[10px] leading-none ${showFlow ? 'text-accent-text' : 'text-base-text-faint'}`}
                  >
                    Flow
                  </span>
                </button>
              </Tooltip>
              <Tooltip content="Changed Files" shortcut="⌘⇧C" side="left">
                <button
                  type="button"
                  onClick={() => setShowChanges((v) => !v)}
                  aria-label={showChanges ? 'Hide changed files' : 'Show changed files'}
                  aria-pressed={showChanges}
                  className={`group relative flex h-10 w-10 flex-col items-center justify-center gap-0.5 rounded-lg transition-colors hover:bg-base-raised/60 ${
                    showChanges ? 'bg-accent/10' : ''
                  }`}
                >
                  <GitCompareArrows
                    size={15}
                    className={`transition-colors ${
                      showChanges
                        ? 'text-accent-text'
                        : 'text-base-text-muted group-hover:text-base-text'
                    }`}
                  />
                  <span
                    className={`text-[10px] leading-none ${showChanges ? 'text-accent-text' : 'text-base-text-faint'}`}
                  >
                    Files
                  </span>
                  {changedFiles.length > 0 && (
                    <span className="absolute top-0 right-0 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-accent px-0.5 font-medium text-[10px] text-base-bg">
                      {changedFiles.length}
                    </span>
                  )}
                </button>
              </Tooltip>
              <Tooltip content="Session Info" shortcut="⌘⇧I" side="left">
                <button
                  type="button"
                  onClick={() => setShowInfo((v) => !v)}
                  aria-label={showInfo ? 'Hide session info' : 'Show session info'}
                  aria-pressed={showInfo}
                  className={`group flex h-10 w-10 flex-col items-center justify-center gap-0.5 rounded-lg transition-colors hover:bg-base-raised/60 ${
                    showInfo ? 'bg-accent/10' : ''
                  }`}
                >
                  <Info
                    size={15}
                    className={`transition-colors ${
                      showInfo
                        ? 'text-accent-text'
                        : 'text-base-text-muted group-hover:text-base-text'
                    }`}
                  />
                  <span
                    className={`text-[10px] leading-none ${showInfo ? 'text-accent-text' : 'text-base-text-faint'}`}
                  >
                    Info
                  </span>
                </button>
              </Tooltip>
              {sessionId && isWorktree && changedFiles.length > 0 && (
                <Tooltip content="Raise Pull Request" side="left">
                  <button
                    type="button"
                    onClick={() => usePrRaiseStore.getState().openOverlay(sessionId)}
                    aria-label="Raise pull request"
                    className="group flex h-10 w-10 flex-col items-center justify-center gap-0.5 rounded-lg transition-colors hover:bg-base-raised/60"
                  >
                    <GitPullRequestArrow
                      size={15}
                      className="text-info transition-colors group-hover:text-info/80"
                    />
                    <span className="text-[10px] text-base-text-faint leading-none">PR</span>
                  </button>
                </Tooltip>
              )}
            </div>
          </>
        )}
      </div>
      {/* Worktree setup modal */}
      <WorktreeSetupModal />
      {/* Review panel overlay — rendered outside the flex layout for full-width slide-over */}
      <ReviewPanel />
      {/* PR raise overlay */}
      <PrRaiseOverlay />
    </>
  )
}
