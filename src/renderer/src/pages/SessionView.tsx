import { useEffect, useRef, useState, useCallback } from 'react'
import { useTabStore } from '../store/tab-store'
import { useSessionStore } from '../store/session-store'
import { ChatView } from '../components/messages/ChatView'
import { InputBar } from '../components/InputBar'
import { ThinkingIndicator } from '../components/ThinkingIndicator'
import { TasksPanel } from '../components/layout/TasksPanel'
import type { AppSettings, Tab, Attachment, ImageAttachment, PermissionMode } from '../../../shared/types'

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
  const { sessions, setSession, updateSession } = useSessionStore()
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

  return (
    <div className="flex h-full flex-col">
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
  )
}
