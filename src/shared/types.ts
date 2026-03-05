export type SessionStatus = 'empty' | 'starting' | 'running' | 'waiting' | 'done' | 'error'

export type Session = {
  id: string
  cwd: string
  sdkSessionId: string | null
  status: SessionStatus
  model: string
  title: string
  cost: SessionCost
  createdAt: number
  updatedAt: number
}

export type SessionCost = {
  inputTokens: number
  outputTokens: number
  totalUsd: number
}

export type Tab = {
  id: string
  sessionId: string | null
  cwd: string
  label: string
}

export type SerializedMessage = {
  id: string
  sessionId: string
  timestamp: number
  sdkMessage: string
}

export type ImageAttachment = {
  type: 'image'
  name: string
  mediaType: string
  base64: string
  previewUrl: string
}

export type FileAttachment = {
  type: 'file'
  name: string
  path: string
  size: number
}

export type Attachment = ImageAttachment | FileAttachment

export type PermissionRequest = {
  requestId: string
  sessionId: string
  toolName: string
  input: Record<string, unknown>
  suggestions?: Array<{ type: string; pattern: string }>
}

export type PermissionResponse = {
  requestId: string
  behavior: 'allow' | 'deny'
  message?: string
  alwaysAllow?: boolean
}

export type AppSettings = {
  defaultModel: string
  defaultPermissionMode: string
  theme: 'dark'
}
