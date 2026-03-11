import {
  ArrowUp,
  ChevronDown,
  Image,
  Info,
  Paperclip,
  ShieldAlert,
  ShieldCheck,
  Square,
  X,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import {
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from 'react'
import type { Attachment, ImageAttachment, PermissionMode } from '../../../shared/types'
import { useUiStore } from '../store/ui-store'

const PERMISSION_MODES = [
  {
    id: 'default' as const,
    label: 'Default',
    icon: ShieldCheck,
    description: 'Ask before each tool use',
  },
  {
    id: 'auto-approve' as const,
    label: 'YOLO',
    icon: ShieldAlert,
    description: 'Auto-approve all tool permissions',
  },
]

const MODELS = [
  { id: 'claude-opus-4-6', label: 'Opus 4.6' },
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
  { id: 'claude-haiku-4-5', label: 'Haiku 4.5' },
] as const

type InputBarProps = {
  sessionId: string | null
  isRunning: boolean
  model: string
  onModelChange: (model: string) => void
  permissionMode: PermissionMode
  onPermissionModeChange: (mode: PermissionMode) => void
  onSend: (text: string, attachments: Attachment[]) => void
  onStop: () => void
  behindCount?: number
}

export function InputBar({
  sessionId,
  isRunning,
  model,
  onModelChange,
  permissionMode,
  onPermissionModeChange,
  onSend,
  onStop,
  behindCount,
}: InputBarProps) {
  const [text, setText] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [showModelMenu, setShowModelMenu] = useState(false)
  const [showPermissionMenu, setShowPermissionMenu] = useState(false)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const modelMenuRef = useRef<HTMLDivElement>(null)
  const permissionMenuRef = useRef<HTMLDivElement>(null)

  const currentModelLabel = MODELS.find((m) => m.id === model)?.label ?? model

  useEffect(() => {
    if (!showModelMenu) return
    function handleClick(e: MouseEvent) {
      if (modelMenuRef.current && !modelMenuRef.current.contains(e.target as Node)) {
        setShowModelMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showModelMenu])

  useEffect(() => {
    if (!showPermissionMenu) return
    function handleClick(e: MouseEvent) {
      if (permissionMenuRef.current && !permissionMenuRef.current.contains(e.target as Node)) {
        setShowPermissionMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showPermissionMenu])

  useEffect(() => {
    if (!lightboxUrl) return
    function handleKey(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape') setLightboxUrl(null)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [lightboxUrl])

  const draftText = useUiStore((s) => s.draftText)
  // biome-ignore lint/correctness/useExhaustiveDependencies: adjustHeight only reads a ref and doesn't need to trigger re-runs
  useEffect(() => {
    if (draftText !== null) {
      setText(draftText)
      useUiStore.getState().setDraftText(null)
      requestAnimationFrame(() => {
        textareaRef.current?.focus()
        adjustHeight()
      })
    }
  }, [draftText])

  function adjustHeight() {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }

  const { toggleCommandPalette } = useUiStore()

  function handleChange(value: string) {
    // Typing "/" as the first character opens the command palette
    if (value === '/') {
      toggleCommandPalette()
      setText('')
      return
    }
    setText(value)
    adjustHeight()
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleSend() {
    const trimmed = text.trim()
    if (!trimmed && attachments.length === 0) return
    onSend(trimmed, attachments)
    setText('')
    setAttachments([])
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  async function processImageFile(file: File): Promise<ImageAttachment> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const base64 = (e.target?.result as string).split(',')[1]
        const previewUrl = URL.createObjectURL(file)
        resolve({
          type: 'image',
          name: file.name,
          mediaType: file.type,
          base64,
          previewUrl,
        })
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  async function addFiles(files: File[]) {
    const newAttachments: Attachment[] = []
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        const img = await processImageFile(file)
        newAttachments.push(img)
      } else {
        // Read text/data files as text content
        const content = await file.text()
        newAttachments.push({
          type: 'file',
          name: file.name,
          path: file.name,
          size: file.size,
          content,
        })
      }
    }
    setAttachments((prev) => [...prev, ...newAttachments])
  }

  async function handlePaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const items = Array.from(e.clipboardData.items)
    const imageItems = items.filter((item) => item.type.startsWith('image/'))
    if (imageItems.length === 0) return

    e.preventDefault()
    const files = imageItems.map((item) => item.getAsFile()).filter((f): f is File => f !== null)
    await addFiles(files)
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragging(true)
  }

  function handleDragLeave() {
    setIsDragging(false)
  }

  async function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragging(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      await addFiles(files)
    }
  }

  function handleFilePickerChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length > 0) {
      addFiles(files)
    }
    e.target.value = ''
  }

  function removeAttachment(idx: number) {
    setAttachments((prev) => {
      const next = [...prev]
      const removed = next.splice(idx, 1)[0]
      if (removed.type === 'image') {
        URL.revokeObjectURL(removed.previewUrl)
      }
      return next
    })
  }

  const canSend = (text.trim().length > 0 || attachments.length > 0) && !isRunning

  return (
    <div className="relative bg-[var(--color-base-bg)]">
      {behindCount != null && behindCount > 0 && (
        <div className="flex items-center gap-2 border-amber-800/30 border-b bg-amber-950/20 px-3 py-1.5 text-amber-400 text-xs">
          <span>⚠</span>
          <span>
            Branch is {behindCount} commit{behindCount !== 1 ? 's' : ''} behind origin
          </span>
        </div>
      )}
      <div className="px-4 pt-2 pb-4">
        <AnimatePresence>
          {lightboxUrl && (
            <motion.div
              className="fixed inset-0 z-[100] flex cursor-zoom-out items-center justify-center bg-black/80 backdrop-blur-sm"
              onClick={() => setLightboxUrl(null)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <motion.img
                src={lightboxUrl}
                alt="Preview"
                className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ duration: 0.15 }}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mx-auto max-w-3xl">
          {/* biome-ignore lint/a11y/noStaticElementInteractions: drag-and-drop zone does not need keyboard interaction */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`rounded-2xl border border-stone-700/60 bg-[var(--color-base-surface)] transition-colors focus-within:border-stone-600 ${
              isDragging ? 'border-amber-700/50 bg-amber-950/10' : ''
            }`}
          >
            {/* Attachments */}
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 border-stone-800/50 border-b px-4 py-2">
                <AnimatePresence>
                  {attachments.map((att, i) => (
                    <motion.div
                      key={att.name + i}
                      className={`group relative overflow-hidden rounded-lg border border-stone-700 bg-stone-800 ${
                        att.type === 'image' ? 'h-16 w-16' : 'flex items-center gap-1.5 px-2 py-1.5'
                      }`}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      transition={{ duration: 0.15 }}
                    >
                      {att.type === 'image' ? (
                        <button
                          type="button"
                          onClick={() => setLightboxUrl(att.previewUrl)}
                          className="h-full w-full cursor-zoom-in"
                        >
                          <img
                            src={att.previewUrl}
                            alt={att.name}
                            className="h-full w-full object-cover"
                          />
                          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-1 pt-2 pb-0.5">
                            <span className="block truncate text-[10px] text-stone-300 leading-tight">
                              {att.name}
                            </span>
                          </div>
                        </button>
                      ) : (
                        <>
                          <Image size={14} className="text-stone-500" />
                          <span className="max-w-[120px] truncate text-stone-400 text-xs">
                            {att.name}
                          </span>
                          <span className="text-stone-600 text-xs">
                            {(att.size / 1024).toFixed(0)}KB
                          </span>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => removeAttachment(i)}
                        className="absolute top-0.5 right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/60 text-stone-300 opacity-0 transition-opacity group-hover:opacity-100"
                      >
                        <X size={9} />
                      </button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}

            {/* Textarea */}
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => handleChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={sessionId ? 'Type your message here...' : 'Open a folder to start'}
              disabled={!sessionId && false}
              rows={3}
              className="min-h-[80px] w-full resize-none bg-transparent px-4 pt-3 pb-2 text-sm text-stone-100 placeholder-stone-500 outline-none"
            />

            {/* Toolbar row */}
            <div className="flex items-center gap-1 px-3 pb-3">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFilePickerChange}
                accept="image/*,text/*,.pdf,.json,.ts,.tsx,.js,.jsx,.py,.md,.yaml,.yml,.toml,.csv"
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title="Attach"
                className="flex h-7 items-center gap-1.5 rounded-full border border-stone-700/50 px-2.5 text-stone-400 text-xs transition-colors hover:border-stone-600 hover:text-stone-300"
              >
                <Paperclip size={13} />
                <span>Attach</span>
              </button>

              <div className="relative" ref={modelMenuRef}>
                <button
                  type="button"
                  onClick={() => setShowModelMenu((v) => !v)}
                  className="flex h-7 items-center gap-1 rounded-full border border-stone-700/50 px-2.5 text-stone-400 text-xs transition-colors hover:border-stone-600 hover:text-stone-300"
                >
                  <span>{currentModelLabel}</span>
                  <ChevronDown size={12} />
                </button>
                <AnimatePresence>
                  {showModelMenu && (
                    <motion.div
                      className="absolute bottom-full left-0 z-50 mb-1 min-w-[160px] overflow-hidden rounded-lg border border-stone-700 bg-stone-800 py-1 shadow-xl"
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 4 }}
                      transition={{ duration: 0.12 }}
                    >
                      {MODELS.map((m) => (
                        <button
                          type="button"
                          key={m.id}
                          onClick={() => {
                            onModelChange(m.id)
                            setShowModelMenu(false)
                          }}
                          className={`flex w-full items-center px-3 py-1.5 text-left text-xs transition-colors hover:bg-stone-700 ${
                            m.id === model ? 'text-stone-100' : 'text-stone-400'
                          }`}
                        >
                          <span
                            className={`mr-2 h-1.5 w-1.5 rounded-full ${m.id === model ? 'bg-stone-300' : 'bg-transparent'}`}
                          />
                          {m.label}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="relative" ref={permissionMenuRef}>
                {(() => {
                  const currentMode =
                    PERMISSION_MODES.find((m) => m.id === permissionMode) ?? PERMISSION_MODES[0]
                  const ModeIcon = currentMode.icon
                  const isYolo = permissionMode === 'auto-approve'
                  return (
                    <button
                      type="button"
                      onClick={() => setShowPermissionMenu((v) => !v)}
                      className={`flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs transition-colors ${
                        isYolo
                          ? 'border-amber-700/50 text-amber-400 hover:border-amber-600 hover:text-amber-300'
                          : 'border-stone-700/50 text-stone-400 hover:border-stone-600 hover:text-stone-300'
                      }`}
                    >
                      <ModeIcon size={13} />
                      <span>{currentMode.label}</span>
                      <ChevronDown size={12} />
                    </button>
                  )
                })()}
                <AnimatePresence>
                  {showPermissionMenu && (
                    <motion.div
                      className="absolute bottom-full left-0 z-50 mb-1 min-w-[220px] overflow-hidden rounded-lg border border-stone-700 bg-stone-800 py-1 shadow-xl"
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 4 }}
                      transition={{ duration: 0.12 }}
                    >
                      {PERMISSION_MODES.map((m) => {
                        const Icon = m.icon
                        return (
                          <button
                            type="button"
                            key={m.id}
                            onClick={() => {
                              onPermissionModeChange(m.id)
                              setShowPermissionMenu(false)
                            }}
                            className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-stone-700 ${
                              m.id === permissionMode ? 'text-stone-100' : 'text-stone-400'
                            }`}
                          >
                            <span
                              className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${m.id === permissionMode ? 'bg-stone-300' : 'bg-transparent'}`}
                            />
                            <Icon size={13} className="flex-shrink-0" />
                            <div>
                              <div>{m.label}</div>
                              <div className="text-[10px] text-stone-500">{m.description}</div>
                            </div>
                          </button>
                        )
                      })}
                      <div className="mx-3 mt-1 border-stone-700/50 border-t pt-1.5 pb-1">
                        <div className="flex items-start gap-1.5 text-[10px] text-stone-500">
                          <Info size={11} className="mt-0.5 flex-shrink-0 text-stone-600" />
                          <span>
                            YOLO mode auto-approves tool permissions but still prompts for questions
                            that require your input.
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="flex-1" />

              <AnimatePresence mode="wait">
                {isRunning ? (
                  <motion.button
                    key="stop"
                    onClick={onStop}
                    title="Stop"
                    className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-700 text-white transition-colors hover:bg-red-600"
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    transition={{ duration: 0.12 }}
                  >
                    <Square size={12} />
                  </motion.button>
                ) : (
                  <motion.button
                    key="send"
                    onClick={handleSend}
                    disabled={!canSend}
                    title="Send"
                    className="flex h-7 w-7 items-center justify-center rounded-lg bg-stone-600 text-stone-200 transition-colors hover:bg-stone-500 disabled:cursor-not-allowed disabled:opacity-30"
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    transition={{ duration: 0.12 }}
                  >
                    <ArrowUp size={14} strokeWidth={2.5} />
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
