import { ChevronRight, GitCompareArrows, GitPullRequestArrow, Info, Workflow } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  AppSettings,
  Attachment,
  ImageAttachment,
  PermissionMode,
  Tab,
} from '../../../shared/types'
import { ChangesPanel } from '../components/ChangesPanel'
import { FlowPanel } from '../components/flow/FlowPanel'
import { InputBar } from '../components/InputBar'
import { TasksPanel } from '../components/layout/TasksPanel'
import { ChatView } from '../components/messages/ChatView'
import { PrRaiseOverlay } from '../components/pr-raise/PrRaiseOverlay'
import { ReviewPanel } from '../components/review/ReviewPanel'
import { SessionInfoPanel } from '../components/SessionInfoPanel'
import { ThinkingIndicator } from '../components/ThinkingIndicator'
import { resumeStoredSession, type StoredSession } from '../lib/resume-session'
import { usePrRaiseStore } from '../store/pr-raise-store'
import { useSessionStore } from '../store/session-store'
import { useTabStore } from '../store/tab-store'

const emptyFiles: string[] = []

type SessionViewProps = {
  tab: Tab
}

type IpcAttachment = {
  type: string
  content: string
  mediaType?: string
  name?: string
}

export function SessionView({ tab }: SessionViewProps) {
  const { updateTab } = useTabStore()
  const setSession = useSessionStore((s) => s.setSession)
  const updateSession = useSessionStore((s) => s.updateSession)
  const sessions = useSessionStore((s) => s.sessions)
  const creatingSession = useRef(false)
  const [pendingModel, setPendingModel] = useState('claude-opus-4-6')
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
      if (sessionId) {
        await window.api.setModel(sessionId, model)
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
  const [panelWidth, setPanelWidth] = useState(360)
  const [flowPanelWidth, setFlowPanelWidth] = useState(280)
  const [infoPanelWidth, setInfoPanelWidth] = useState(260)
  const dragging = useRef(false)
  const dragStartX = useRef(0)
  const dragStartWidth = useRef(0)

  const MIN_PANEL_WIDTH = 300
  const MAX_PANEL_WIDTH = 700
  const MIN_FLOW_WIDTH = 220
  const MAX_FLOW_WIDTH = 450
  const MIN_INFO_WIDTH = 200
  const MAX_INFO_WIDTH = 400

  const makeDragHandler = useCallback(
    (currentWidth: number, setWidth: (w: number) => void, min: number, max: number) =>
      (e: React.MouseEvent) => {
        e.preventDefault()
        dragging.current = true
        dragStartX.current = e.clientX
        dragStartWidth.current = currentWidth

        document.body.style.userSelect = 'none'
        document.body.style.cursor = 'col-resize'

        const handleMouseMove = (ev: MouseEvent) => {
          if (!dragging.current) return
          const delta = dragStartX.current - ev.clientX
          setWidth(Math.min(max, Math.max(min, dragStartWidth.current + delta)))
        }

        const handleMouseUp = () => {
          dragging.current = false
          document.body.style.userSelect = ''
          document.body.style.cursor = ''
          document.removeEventListener('mousemove', handleMouseMove)
          document.removeEventListener('mouseup', handleMouseUp)
        }

        document.addEventListener('mousemove', handleMouseMove)
        document.addEventListener('mouseup', handleMouseUp)
      },
    [],
  )

  const handleChangesDragStart = useCallback(
    (e: React.MouseEvent) => {
      makeDragHandler(panelWidth, setPanelWidth, MIN_PANEL_WIDTH, MAX_PANEL_WIDTH)(e)
    },
    [panelWidth, makeDragHandler],
  )

  const handleFlowDragStart = useCallback(
    (e: React.MouseEvent) => {
      makeDragHandler(flowPanelWidth, setFlowPanelWidth, MIN_FLOW_WIDTH, MAX_FLOW_WIDTH)(e)
    },
    [flowPanelWidth, makeDragHandler],
  )

  const handleInfoDragStart = useCallback(
    (e: React.MouseEvent) => {
      makeDragHandler(infoPanelWidth, setInfoPanelWidth, MIN_INFO_WIDTH, MAX_INFO_WIDTH)(e)
    },
    [infoPanelWidth, makeDragHandler],
  )

  return (
    <>
      <div className="flex h-full">
        {/* Main chat column */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1">
            {sessionId ? (
              <ChatView sessionId={sessionId} />
            ) : (
              <div className="flex h-full items-center justify-center">
                <p className="text-sm text-stone-600">Send a message to start</p>
              </div>
            )}
          </div>
          <div className="overflow-hidden">
            <div
              className={`transition-opacity duration-150 ${isProcessing ? 'opacity-100' : 'opacity-0'}`}
            >
              <ThinkingIndicator isCompacting={isCompacting} />
            </div>
          </div>
          <TasksPanel sessionId={sessionId ?? null} />
          <div>
            <InputBar
              tabId={tab.id}
              sessionId={sessionId}
              isRunning={isRunning}
              model={currentModel}
              onModelChange={handleModelChange}
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
            <AnimatePresence mode="popLayout" initial={false}>
              {showFlow ? (
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
                    className="flex w-1 flex-shrink-0 cursor-col-resize items-center justify-center border-stone-800 border-l bg-stone-950 transition-colors hover:bg-stone-700 active:bg-stone-600"
                  />
                  <div className="flex min-w-0 flex-1 flex-col bg-[var(--color-base-bg)]">
                    <div className="flex items-center justify-between border-stone-800 border-b px-3 py-2">
                      <div className="flex items-center gap-2 font-medium text-stone-400 text-xs">
                        <Workflow size={13} />
                        Flow
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowFlow(false)}
                        className="rounded p-0.5 text-stone-600 transition-colors hover:bg-stone-800 hover:text-stone-300"
                        title="Collapse flow"
                      >
                        <ChevronRight size={14} />
                      </button>
                    </div>
                    <FlowPanel />
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>

            {/* Changes panel */}
            <AnimatePresence mode="popLayout" initial={false}>
              {showChanges ? (
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
                    className="flex w-1 flex-shrink-0 cursor-col-resize items-center justify-center border-stone-800 border-l bg-stone-950 transition-colors hover:bg-stone-700 active:bg-stone-600"
                  />
                  <div className="flex min-w-0 flex-1 flex-col bg-[var(--color-base-bg)]">
                    <div className="flex items-center justify-between border-stone-800 border-b px-3 py-2">
                      <div className="flex items-center gap-2 font-medium text-stone-400 text-xs">
                        <GitCompareArrows size={13} />
                        Changes
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowChanges(false)}
                        className="rounded p-0.5 text-stone-600 transition-colors hover:bg-stone-800 hover:text-stone-300"
                        title="Collapse changes"
                      >
                        <ChevronRight size={14} />
                      </button>
                    </div>
                    <ChangesPanel />
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>

            {/* Review panel — rendered as overlay (see bottom of component) */}

            {/* Info panel */}
            <AnimatePresence mode="popLayout" initial={false}>
              {showInfo ? (
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
                    className="flex w-1 flex-shrink-0 cursor-col-resize items-center justify-center border-stone-800 border-l bg-stone-950 transition-colors hover:bg-stone-700 active:bg-stone-600"
                  />
                  <div className="flex min-w-0 flex-1 flex-col bg-[var(--color-base-bg)]">
                    <div className="flex items-center justify-between border-stone-800 border-b px-3 py-2">
                      <div className="flex items-center gap-2 font-medium text-stone-400 text-xs">
                        <Info size={13} />
                        Session
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowInfo(false)}
                        className="rounded p-0.5 text-stone-600 transition-colors hover:bg-stone-800 hover:text-stone-300"
                        title="Collapse session info"
                      >
                        <ChevronRight size={14} />
                      </button>
                    </div>
                    <SessionInfoPanel sessionId={sessionId} />
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>

            {/* Collapsed tabs (shown when any panel is collapsed) */}
            {(!showFlow || !showChanges || !showInfo) && (
              <div className="flex flex-shrink-0 flex-col border-stone-800 border-l bg-[var(--color-base-bg)]">
                {!showFlow && (
                  <button
                    type="button"
                    onClick={() => setShowFlow(true)}
                    title="Show flow"
                    className="group flex w-10 flex-col items-center gap-1.5 py-3 transition-colors hover:bg-stone-800/60"
                  >
                    <Workflow
                      size={18}
                      className="text-stone-500 transition-colors group-hover:text-stone-200"
                    />
                    <span className="font-medium text-[9px] text-stone-600 transition-colors group-hover:text-stone-300">
                      Flow
                    </span>
                  </button>
                )}
                {!showChanges && (
                  <button
                    type="button"
                    onClick={() => setShowChanges(true)}
                    title="Show changed files"
                    className="group flex w-10 flex-col items-center gap-1.5 py-3 transition-colors hover:bg-stone-800/60"
                  >
                    <div className="relative">
                      <GitCompareArrows
                        size={18}
                        className="text-stone-500 transition-colors group-hover:text-stone-200"
                      />
                      {changedFiles.length > 0 && (
                        <span className="absolute -top-1.5 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-stone-600 px-1 font-medium text-[9px] text-stone-200">
                          {changedFiles.length}
                        </span>
                      )}
                    </div>
                    <span className="font-medium text-[9px] text-stone-600 transition-colors group-hover:text-stone-300">
                      Files
                    </span>
                  </button>
                )}
                {!showInfo && (
                  <button
                    type="button"
                    onClick={() => setShowInfo(true)}
                    title="Show session info"
                    className="group flex w-10 flex-col items-center gap-1.5 py-3 transition-colors hover:bg-stone-800/60"
                  >
                    <Info
                      size={18}
                      className="text-stone-500 transition-colors group-hover:text-stone-200"
                    />
                    <span className="font-medium text-[9px] text-stone-600 transition-colors group-hover:text-stone-300">
                      Info
                    </span>
                  </button>
                )}
                {sessionId && tab.useWorktree && changedFiles.length > 0 && (
                  <button
                    type="button"
                    onClick={() => usePrRaiseStore.getState().openOverlay(sessionId)}
                    title="Raise pull request"
                    className="group flex w-10 flex-col items-center gap-1.5 py-3 transition-colors hover:bg-stone-800/60"
                  >
                    <GitPullRequestArrow
                      size={18}
                      className="text-blue-500/70 transition-colors group-hover:text-blue-400"
                    />
                    <span className="font-medium text-[9px] text-stone-600 transition-colors group-hover:text-stone-300">
                      PR
                    </span>
                  </button>
                )}
              </div>
            )}
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
