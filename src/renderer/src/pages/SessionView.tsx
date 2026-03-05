import { useEffect, useRef } from 'react'
import { useTabStore } from '../store/tab-store'
import { useSessionStore } from '../store/session-store'
import { ChatView } from '../components/messages/ChatView'
import { InputBar } from '../components/InputBar'
import { StatusBar } from '../components/StatusBar'
import type { Tab } from '../../../shared/types'
import type { Attachment, ImageAttachment } from '../../../shared/types'

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

  const sessionId = tab.sessionId
  const session = sessionId ? sessions.get(sessionId) : undefined
  const isRunning =
    session?.status === 'running' ||
    session?.status === 'starting' ||
    session?.status === 'waiting'

  useEffect(() => {
    // Session will be created lazily on first message
  }, [])

  async function ensureSession(): Promise<string> {
    if (sessionId) return sessionId
    if (creatingSession.current) {
      // Wait a bit and return whatever was created
      await new Promise((r) => setTimeout(r, 100))
      return tab.sessionId ?? ''
    }

    creatingSession.current = true
    const newSessionId = await window.api.createSession(tab.cwd)

    setSession({
      id: newSessionId,
      cwd: tab.cwd,
      status: 'empty',
      model: '',
      title: '',
      cost: { inputTokens: 0, outputTokens: 0, totalUsd: 0 },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    updateTab(tab.id, { sessionId: newSessionId })
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
        content: att.path,
        name: att.name,
      }
    })

    await window.api.sendMessage(sid, text, ipcAttachments)
  }

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
      <InputBar
        sessionId={sessionId}
        isRunning={isRunning}
        onSend={handleSend}
        onStop={handleStop}
      />
      <StatusBar session={session} />
    </div>
  )
}
