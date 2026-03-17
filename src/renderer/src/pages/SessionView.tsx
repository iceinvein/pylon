import { GitCompareArrows, GitPullRequestArrow, Info, Workflow } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  AppSettings,
  Attachment,
  EffortLevel,
  ImageAttachment,
  PermissionMode,
  Tab,
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
import { usePersistedWidth } from '../hooks/use-persisted-width'
import { fadeUpSmall, stagger } from '../lib/animations'
import { resumeStoredSession, type StoredSession } from '../lib/resume-session'
import { usePrRaiseStore } from '../store/pr-raise-store'
import { useSessionStore } from '../store/session-store'
import { useTabStore } from '../store/tab-store'

const emptyFiles: string[] = []

type SessionViewProps = {
  tab: Tab
  isActive: boolean
}

type IpcAttachment = {
  type: string
  content: string
  mediaType?: string
  name?: string
}

export function SessionView({ tab, isActive }: SessionViewProps) {
  const { updateTab } = useTabStore()
  const setSession = useSessionStore((s) => s.setSession)
  const updateSession = useSessionStore((s) => s.updateSession)
  const sessions = useSessionStore((s) => s.sessions)
  const creatingSession = useRef(false)
  const [pendingModel, setPendingModel] = useState('claude-opus-4-6')
  const [effort, setEffort] = useState<EffortLevel>('high')
  const [permissionMode, setPermissionMode] = useState<PermissionMode>('default')

  const sessionId = tab.sessionId
  const session = sessionId ? sessions.get(sessionId) : undefined
  const currentModel = session?.model || pendingModel
  const streaming = useSessionStore((s) => (sessionId ? s.streamingText.get(sessionId) : undefined))
  const sdkStatus = useSessionStore((s) => (sessionId ? s.sdkStatus.get(sessionId) : null))
  const isRunning =
    session?.status === 'running' || session?.status === 'starting' || session?.status === 'waiting'
  const isCompacting = sdkStatus === 'compacting'
  const isProcessing = (isRunning && !streaming) || isCompacting

  // Load global defaults for new sessions, or sync from backend for existing ones
  useEffect(() => {
    if (sessionId) {
      // Existing session: sync UI state from backend
      window.api.getSessionInfo(sessionId).then((info) => {
        if (info) {
          setPendingModel(info.model)
          setPermissionMode(info.permissionMode as PermissionMode)
        }
      })
    } else {
      // New session: load global defaults
      window.api.getSettings().then((s) => {
        const settings = s as AppSettings
        setPendingModel(settings.defaultModel)
        setPermissionMode(settings.defaultPermissionMode)
      })
    }
  }, [sessionId])

  // Check git branch status on mount/tab switch
  const setBranchStatus = useSessionStore((s) => s.setBranchStatus)
  const branchStatus = useSessionStore((s) => s.branchStatus.get(tab.cwd))
  useEffect(() => {
    window.api.getGitBranchStatus(tab.cwd).then((status) => {
      setBranchStatus(tab.cwd, status)
    })
  }, [tab.cwd, setBranchStatus])

  // Lazy hydration: when switching to a restored-but-unhydrated tab
  useEffect(() => {
    // Only trigger for tabs explicitly marked as unhydrated by the restore logic.
    // hydrated === undefined means a fresh tab (not restored) — skip.
    // hydrated === true means already hydrated — skip.
    // hydrated === false means restored but not yet hydrated — hydrate now.
    if (!sessionId || tab.hydrated !== false) return

    let cancelled = false

    async function hydrate() {
      const allSessions = (await window.api.listSessions()) as StoredSession[]
      const session = allSessions.find((s) => s.id === sessionId)
      if (cancelled || !session) return

      await resumeStoredSession(session)
      updateTab(tab.id, { hydrated: true })
    }

    hydrate()
    return () => {
      cancelled = true
    }
  }, [sessionId, tab.hydrated, tab.id, updateTab])

  async function ensureSession(): Promise<string> {
    if (sessionId) return sessionId
    if (creatingSession.current) {
      // Wait a bit and return whatever was created
      await new Promise((r) => setTimeout(r, 100))
      return tab.sessionId ?? ''
    }

    creatingSession.current = true
    const newSessionId = await window.api.createSession(tab.cwd, pendingModel, tab.useWorktree)

    setSession({
      id: newSessionId,
      cwd: tab.cwd,
      status: 'empty',
      model: pendingModel,
      title: '',
      cost: {
        inputTokens: 0,
        outputTokens: 0,
        totalUsd: 0,
        contextWindow: 0,
        contextInputTokens: 0,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    updateTab(tab.id, { sessionId: newSessionId })
    if (permissionMode !== 'default') {
      await window.api.setPermissionMode(newSessionId, permissionMode)
    }
    creatingSession.current = false
    return newSessionId
  }

  async function handleSend(text: string, attachments: Attachment[]) {
    // Re-check branch status before first message
    if (!sessionId) {
      try {
        const freshStatus = await window.api.getGitBranchStatus(tab.cwd)
        setBranchStatus(tab.cwd, freshStatus)
      } catch {
        // ignore — don't block sending
      }
    }

    const sid = await ensureSession()
    if (!sid) return

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

    useSessionStore.getState().appendMessage(sid, {
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

    await window.api.sendMessage(sid, text, ipcAttachments)
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
        await window.api.setModel(sessionId, model)
      }
    },
    [sessionId, effort],
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
                    className="font-display text-2xl text-[var(--color-base-text-secondary)] italic"
                    variants={fadeUpSmall}
                  >
                    What shall we build?
                  </motion.p>
                  <motion.p
                    className="mt-2 text-[var(--color-base-text-faint)] text-sm"
                    variants={fadeUpSmall}
                  >
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
                        className="rounded-lg border border-[var(--color-base-border)]/50 px-4 py-2.5 text-left text-[var(--color-base-text-secondary)] text-sm transition-all hover:border-[var(--color-accent)]/30 hover:bg-[var(--color-accent)]/5 hover:text-[var(--color-base-text)]"
                      >
                        {prompt}
                      </motion.button>
                    ))}
                  </div>
                  <motion.p
                    className="mt-4 text-[11px] text-[var(--color-base-text-faint)]"
                    variants={fadeUpSmall}
                  >
                    Type{' '}
                    <kbd className="rounded border border-[var(--color-base-border)] px-1 py-0.5 text-[10px]">
                      /
                    </kbd>{' '}
                    for commands
                    {' · '}
                    <kbd className="rounded border border-[var(--color-base-border)] px-1 py-0.5 text-[10px]">
                      ⌘K
                    </kbd>{' '}
                    palette
                  </motion.p>
                </motion.div>
              </div>
            )}
          </div>
          <TasksPanel
            sessionId={sessionId ?? null}
            isProcessing={isProcessing}
            isCompacting={isCompacting}
          />
          <div>
            <InputBar
              tabId={tab.id}
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
                  className="flex flex-shrink-0 overflow-hidden"
                >
                  {/* biome-ignore lint/a11y/noStaticElementInteractions: mouse-only resize handle */}
                  <div
                    onMouseDown={handleFlowDragStart}
                    className="flex w-1 flex-shrink-0 cursor-col-resize items-center justify-center border-[var(--color-base-border-subtle)] border-l bg-[var(--color-base-bg)] transition-colors hover:bg-[var(--color-base-border)] active:bg-[var(--color-base-text-faint)]"
                  />
                  <div className="flex min-w-0 flex-1 flex-col bg-[var(--color-base-bg)]">
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
                  className="flex flex-shrink-0 overflow-hidden"
                >
                  {/* biome-ignore lint/a11y/noStaticElementInteractions: mouse-only resize handle */}
                  <div
                    onMouseDown={handleChangesDragStart}
                    className="flex w-1 flex-shrink-0 cursor-col-resize items-center justify-center border-[var(--color-base-border-subtle)] border-l bg-[var(--color-base-bg)] transition-colors hover:bg-[var(--color-base-border)] active:bg-[var(--color-base-text-faint)]"
                  />
                  <div className="flex min-w-0 flex-1 flex-col bg-[var(--color-base-bg)]">
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
                  className="flex flex-shrink-0 overflow-hidden"
                >
                  {/* biome-ignore lint/a11y/noStaticElementInteractions: mouse-only resize handle */}
                  <div
                    onMouseDown={handleInfoDragStart}
                    className="flex w-1 flex-shrink-0 cursor-col-resize items-center justify-center border-[var(--color-base-border-subtle)] border-l bg-[var(--color-base-bg)] transition-colors hover:bg-[var(--color-base-border)] active:bg-[var(--color-base-text-faint)]"
                  />
                  <div className="flex min-w-0 flex-1 flex-col bg-[var(--color-base-bg)]">
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

            {/* Icon strip — icons only, labels in panel headers */}
            <div className="flex flex-shrink-0 flex-col items-center gap-0.5 border-[var(--color-base-border-subtle)] border-l bg-[var(--color-base-bg)] pt-1">
              <button
                type="button"
                onClick={() => setShowFlow((v) => !v)}
                title={showFlow ? 'Hide flow' : 'Show flow'}
                className={`group flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-[var(--color-base-raised)]/60 ${
                  showFlow ? 'bg-[var(--color-accent)]/10' : ''
                }`}
              >
                <Workflow
                  size={17}
                  className={`transition-colors ${
                    showFlow
                      ? 'text-[var(--color-accent-text)]'
                      : 'text-[var(--color-base-text-muted)] group-hover:text-[var(--color-base-text)]'
                  }`}
                />
              </button>
              <button
                type="button"
                onClick={() => setShowChanges((v) => !v)}
                title={showChanges ? 'Hide changed files' : 'Show changed files'}
                className={`group relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-[var(--color-base-raised)]/60 ${
                  showChanges ? 'bg-[var(--color-accent)]/10' : ''
                }`}
              >
                <GitCompareArrows
                  size={17}
                  className={`transition-colors ${
                    showChanges
                      ? 'text-[var(--color-accent-text)]'
                      : 'text-[var(--color-base-text-muted)] group-hover:text-[var(--color-base-text)]'
                  }`}
                />
                {changedFiles.length > 0 && (
                  <span className="absolute top-0.5 right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[var(--color-accent)] px-0.5 font-medium text-[8px] text-white">
                    {changedFiles.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setShowInfo((v) => !v)}
                title={showInfo ? 'Hide session info' : 'Show session info'}
                className={`group flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-[var(--color-base-raised)]/60 ${
                  showInfo ? 'bg-[var(--color-accent)]/10' : ''
                }`}
              >
                <Info
                  size={17}
                  className={`transition-colors ${
                    showInfo
                      ? 'text-[var(--color-accent-text)]'
                      : 'text-[var(--color-base-text-muted)] group-hover:text-[var(--color-base-text)]'
                  }`}
                />
              </button>
              {sessionId && tab.useWorktree && changedFiles.length > 0 && (
                <button
                  type="button"
                  onClick={() => usePrRaiseStore.getState().openOverlay(sessionId)}
                  title="Raise pull request"
                  className="group flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-[var(--color-base-raised)]/60"
                >
                  <GitPullRequestArrow
                    size={17}
                    className="text-[var(--color-info)] transition-colors group-hover:brightness-125"
                  />
                </button>
              )}
            </div>
          </>
        )}
      </div>
      {/* Review panel overlay — rendered outside the flex layout for full-width slide-over */}
      <ReviewPanel />
      {/* PR raise overlay */}
      <PrRaiseOverlay />
    </>
  )
}
