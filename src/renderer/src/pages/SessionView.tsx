import { useEffect, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { useTabStore } from '../store/tab-store'
import { useSessionStore } from '../store/session-store'
import { GitCompareArrows, ChevronRight } from 'lucide-react'
import { ChatView } from '../components/messages/ChatView'
import { InputBar } from '../components/InputBar'
import { ThinkingIndicator } from '../components/ThinkingIndicator'
import { TasksPanel } from '../components/layout/TasksPanel'
import { ChangesPanel } from '../components/ChangesPanel'
import type { AppSettings, Tab, Attachment, ImageAttachment, PermissionMode } from '../../../shared/types'

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
  const streaming = useSessionStore((s) => sessionId ? s.streamingText.get(sessionId) : undefined)
  const sdkStatus = useSessionStore((s) => sessionId ? s.sdkStatus.get(sessionId) : null)
  const isRunning =
    session?.status === 'running' ||
    session?.status === 'starting' ||
    session?.status === 'waiting'
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

  async function ensureSession(): Promise<string> {
    if (sessionId) return sessionId
    if (creatingSession.current) {
      // Wait a bit and return whatever was created
      await new Promise((r) => setTimeout(r, 100))
      return tab.sessionId ?? ''
    }

    creatingSession.current = true
    const newSessionId = await window.api.createSession(tab.cwd, pendingModel)

    setSession({
      id: newSessionId,
      cwd: tab.cwd,
      status: 'empty',
      model: pendingModel,
      title: '',
      cost: { inputTokens: 0, outputTokens: 0, totalUsd: 0 },
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
      content: userContent.length === 1 && userContent[0] && (userContent[0] as { type: string }).type === 'text'
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

  const handleModelChange = useCallback(async (model: string) => {
    setPendingModel(model)
    if (sessionId) {
      await window.api.setModel(sessionId, model)
    }
  }, [sessionId])

  const handlePermissionModeChange = useCallback(async (mode: PermissionMode) => {
    setPermissionMode(mode)
    if (sessionId) {
      await window.api.setPermissionMode(sessionId, mode)
    }
  }, [sessionId])

  async function handleStop() {
    if (!sessionId) return
    await window.api.stopSession(sessionId)
    updateSession(sessionId, { status: 'done' })
  }

  const changedFilesRaw = useSessionStore((s) =>
    sessionId ? s.changedFiles.get(sessionId) : undefined
  )
  const changedFiles = changedFilesRaw ?? emptyFiles
  const [showChanges, setShowChanges] = useState(false)
  const [panelWidth, setPanelWidth] = useState(360)
  const dragging = useRef(false)
  const dragStartX = useRef(0)
  const dragStartWidth = useRef(0)

  const MIN_PANEL_WIDTH = 300
  const MAX_PANEL_WIDTH = 700

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    dragStartX.current = e.clientX
    dragStartWidth.current = panelWidth

    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'

    const handleMouseMove = (ev: MouseEvent) => {
      if (!dragging.current) return
      // Dragging left = making panel wider (panel is on the right)
      const delta = dragStartX.current - ev.clientX
      const newWidth = Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, dragStartWidth.current + delta))
      setPanelWidth(newWidth)
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
  }, [panelWidth])

  return (
    <div className="flex h-full">
      {/* Main chat column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex-1 min-h-0">
          {sessionId ? (
            <ChatView sessionId={sessionId} />
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-stone-600">Send a message to start</p>
            </div>
          )}
        </div>
        <div className="overflow-hidden">
          <div className={`transition-opacity duration-150 ${isProcessing ? 'opacity-100' : 'opacity-0'}`}>
            <ThinkingIndicator isCompacting={isCompacting} />
          </div>
        </div>
        <TasksPanel sessionId={sessionId ?? null} />
        <div>
          <InputBar
            sessionId={sessionId}
            isRunning={isRunning}
            model={currentModel}
            onModelChange={handleModelChange}
            permissionMode={permissionMode}
            onPermissionModeChange={handlePermissionModeChange}
            onSend={handleSend}
            onStop={handleStop}
          />
        </div>
      </div>
      {/* Persistent right-edge changes pane */}
      {sessionId && (
        <AnimatePresence mode="popLayout" initial={false}>
          {showChanges ? (
            <motion.div
              key="panel"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: panelWidth + 5, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
              className="flex flex-shrink-0 overflow-hidden"
            >
              {/* Drag handle */}
              <div
                onMouseDown={handleDragStart}
                className="flex w-1 flex-shrink-0 cursor-col-resize items-center justify-center border-l border-stone-800 bg-stone-950 transition-colors hover:bg-stone-700 active:bg-stone-600"
              />
              <div
                className="flex min-w-0 flex-1 flex-col bg-[var(--color-base-bg)]"
              >
                {/* Panel header with close button */}
                <div className="flex items-center justify-between border-b border-stone-800 px-3 py-2">
                  <div className="flex items-center gap-2 text-xs font-medium text-stone-400">
                    <GitCompareArrows size={13} />
                    Changes
                  </div>
                  <button
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
          ) : (
            /* Collapsed: persistent edge tab */
            <motion.button
              key="tab"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 32, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
              onClick={() => setShowChanges(true)}
              title="Show changed files"
              className="group flex flex-shrink-0 flex-col items-center gap-1 overflow-hidden border-l border-stone-800 bg-[var(--color-base-bg)] pt-3 transition-colors hover:bg-stone-900/80"
            >
              <GitCompareArrows size={14} className="text-stone-600 transition-colors group-hover:text-stone-300" />
              {changedFiles.length > 0 && (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-stone-700 px-1 text-[10px] font-medium text-stone-300">
                  {changedFiles.length}
                </span>
              )}
            </motion.button>
          )}
        </AnimatePresence>
      )}
    </div>
  )
}
