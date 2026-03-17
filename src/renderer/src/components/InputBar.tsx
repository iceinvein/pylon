import {
  ArrowUp,
  Image,
  Paperclip,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
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
import type {
  Attachment,
  EffortLevel,
  FileAttachment,
  ImageAttachment,
  PermissionMode,
} from '../../../shared/types'
import { useDraftStore } from '../store/draft-store'
import { useUiStore } from '../store/ui-store'
import { ContextIndicator } from './ContextIndicator'
import { DropdownMenu } from './DropdownMenu'

const PERMISSION_MODES = [
  { id: 'default' as const, label: 'Default', icon: ShieldCheck },
  { id: 'auto-approve' as const, label: 'YOLO', icon: ShieldAlert },
]

const MODELS = [
  { id: 'claude-opus-4-6', label: 'Opus 4.6' },
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
  { id: 'claude-haiku-4-5', label: 'Haiku 4.5' },
] as const

const EFFORT_LEVELS: { id: EffortLevel; label: string }[] = [
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
  { id: 'max', label: 'Max' },
]

type InputBarProps = {
  tabId: string
  sessionId: string | null
  isActive: boolean
  isRunning: boolean
  model: string
  onModelChange: (model: string) => void
  effort: EffortLevel
  onEffortChange: (effort: EffortLevel) => void
  permissionMode: PermissionMode
  onPermissionModeChange: (mode: PermissionMode) => void
  onSend: (text: string, attachments: Attachment[]) => void
  onStop: () => void
  behindCount?: number
}

export function InputBar({
  tabId,
  sessionId,
  isActive,
  isRunning,
  model,
  onModelChange,
  effort,
  onEffortChange,
  permissionMode,
  onPermissionModeChange,
  onSend,
  onStop,
  behindCount,
}: InputBarProps) {
  // Restore draft from previous tab switch (if any)
  const savedDraft = useDraftStore.getState().getDraft(tabId)
  const [text, setText] = useState(savedDraft?.text ?? '')
  const [attachments, setAttachments] = useState<Attachment[]>(savedDraft?.attachments ?? [])
  const [isDragging, setIsDragging] = useState(false)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Auto-focus textarea when this tab becomes active (new tab or tab switch)
  useEffect(() => {
    if (isActive) {
      requestAnimationFrame(() => textareaRef.current?.focus())
    }
  }, [isActive])

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

  // Save draft to module-level Map on unmount (tab switch)
  const textRef = useRef(text)
  const attachmentsRef = useRef(attachments)
  textRef.current = text
  attachmentsRef.current = attachments

  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once on mount/unmount per tab — adjustHeight reads a ref, savedDraft is captured at render time
  useEffect(() => {
    if (savedDraft?.text) {
      requestAnimationFrame(() => adjustHeight())
    }
    return () => {
      const t = textRef.current
      const fileAtts = attachmentsRef.current.filter((a): a is FileAttachment => a.type === 'file')
      if (t || fileAtts.length > 0) {
        useDraftStore.getState().setDraft(tabId, { text: t, attachments: fileAtts })
      } else {
        useDraftStore.getState().clearDraft(tabId)
      }
    }
  }, [tabId])

  function adjustHeight() {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }

  const toggleCommandPalette = useUiStore((s) => s.toggleCommandPalette)

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
    useDraftStore.getState().clearDraft(tabId)
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

  // Build dropdown items with filtering
  const effortItems = EFFORT_LEVELS.filter((e) => e.id !== 'max' || model === 'claude-opus-4-6')
  const permissionItems = PERMISSION_MODES.map((m) => ({
    id: m.id,
    label: m.label,
    icon: <m.icon size={13} className="shrink-0" />,
  }))

  const isYolo = permissionMode === 'auto-approve'
  const currentMode = PERMISSION_MODES.find((m) => m.id === permissionMode) ?? PERMISSION_MODES[0]

  // Effort trigger styling — purple for max, muted for low, default otherwise
  const effortTriggerClass =
    effort === 'max'
      ? 'flex h-7 items-center gap-1 rounded-full border border-[var(--color-special)]/50 px-2.5 text-[var(--color-special)] text-xs transition-colors hover:border-[var(--color-special)] hover:text-[var(--color-special)]'
      : effort === 'low'
        ? 'flex h-7 items-center gap-1 rounded-full border border-[var(--color-base-border)]/50 px-2.5 text-[var(--color-base-text-muted)] text-xs transition-colors hover:border-[var(--color-base-border)] hover:text-[var(--color-base-text-secondary)]'
        : undefined // use DropdownMenu default

  // Permission trigger styling — amber for YOLO
  const permissionTriggerClass = isYolo
    ? 'flex h-7 items-center gap-1 rounded-full border border-[var(--color-accent)]/50 px-2.5 text-[var(--color-warning)] text-xs transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent-text)]'
    : undefined

  const canSend = (text.trim().length > 0 || attachments.length > 0) && !isRunning

  return (
    <div className="relative bg-base-bg">
      {behindCount != null && behindCount > 0 && (
        <div className="flex items-center gap-2 border-warning/20 border-b bg-warning/5 px-3 py-1.5 text-warning text-xs">
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
              className="fixed inset-0 z-100 flex cursor-zoom-out items-center justify-center bg-black/80 backdrop-blur-sm"
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
            className={`rounded-2xl border border-base-border/60 bg-base-surface transition-colors focus-within:border-accent/40 ${
              isDragging ? 'border-accent/50 bg-accent/5' : ''
            }`}
          >
            {/* Attachments */}
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 border-base-border/50 border-b px-4 py-2">
                <AnimatePresence>
                  {attachments.map((att, i) => (
                    <motion.div
                      key={att.name + i}
                      className={`group relative overflow-hidden rounded-lg border border-base-border bg-base-raised ${
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
                          <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/70 to-transparent px-1 pt-2 pb-0.5">
                            <span className="block truncate text-[10px] text-base-text leading-tight">
                              {att.name}
                            </span>
                          </div>
                        </button>
                      ) : (
                        <>
                          <Image size={14} className="text-base-text-muted" />
                          <span className="max-w-30 truncate text-base-text-secondary text-xs">
                            {att.name}
                          </span>
                          <span className="text-base-text-faint text-xs">
                            {(att.size / 1024).toFixed(0)}KB
                          </span>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => removeAttachment(i)}
                        className="absolute top-0.5 right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/60 text-base-text opacity-0 transition-opacity group-hover:opacity-100"
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
              placeholder={sessionId ? 'Ask Claude anything...' : 'Open a project to begin'}
              disabled={!sessionId && false}
              rows={3}
              className="min-h-20 w-full resize-none bg-transparent px-4 pt-3 pb-2 text-base-text text-sm leading-relaxed placeholder-base-text-faint outline-none"
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
                title="Attach file"
                aria-label="Attach file"
                className="flex h-7 w-7 items-center justify-center rounded-full border border-base-border/50 text-base-text-secondary transition-colors hover:border-base-border hover:text-base-text"
              >
                <Paperclip size={13} />
              </button>

              <DropdownMenu
                items={MODELS.map((m) => ({ id: m.id, label: m.label }))}
                value={model}
                onChange={onModelChange}
              />

              <DropdownMenu
                items={effortItems}
                value={effort}
                onChange={(id) => onEffortChange(id as EffortLevel)}
                triggerIcon={<SlidersHorizontal size={13} />}
                triggerClassName={effortTriggerClass}
                minWidth={140}
              />

              <DropdownMenu
                items={permissionItems}
                value={permissionMode}
                onChange={(id) => onPermissionModeChange(id as PermissionMode)}
                triggerIcon={<currentMode.icon size={13} />}
                triggerClassName={permissionTriggerClass}
                minWidth={160}
              />

              <div className="flex-1" />

              <ContextIndicator sessionId={sessionId} />

              <div className="w-1.5" />

              <AnimatePresence mode="wait">
                {isRunning ? (
                  <motion.button
                    key="stop"
                    onClick={onStop}
                    title="Stop"
                    className="flex h-7 w-7 items-center justify-center rounded-lg bg-error text-white transition-colors hover:brightness-110"
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
                    className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-30"
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
