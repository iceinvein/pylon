import { useRef, useState, useCallback, type KeyboardEvent, type DragEvent, type ClipboardEvent } from 'react'
import { Send, Square, Paperclip, X, Image } from 'lucide-react'
import type { Attachment, ImageAttachment } from '../../../shared/types'
import { SlashCommandMenu } from './SlashCommandMenu'

type InputBarProps = {
  sessionId: string | null
  isRunning: boolean
  onSend: (text: string, attachments: Attachment[]) => void
  onStop: () => void
}

export function InputBar({ sessionId, isRunning, onSend, onStop }: InputBarProps) {
  const [text, setText] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [showSlash, setShowSlash] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function adjustHeight() {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'
  }

  function handleChange(value: string) {
    setText(value)
    adjustHeight()
    setShowSlash(value.startsWith('/'))
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (showSlash) return
      handleSend()
    }
    if (e.key === 'Escape') {
      setShowSlash(false)
    }
  }

  function handleSend() {
    const trimmed = text.trim()
    if (!trimmed && attachments.length === 0) return
    onSend(trimmed, attachments)
    setText('')
    setAttachments([])
    setShowSlash(false)
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
        newAttachments.push({
          type: 'file',
          name: file.name,
          path: file.name,
          size: file.size,
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
    const files = imageItems
      .map((item) => item.getAsFile())
      .filter((f): f is File => f !== null)
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

  const handleSlashSelect = useCallback((command: string) => {
    setText(command)
    setShowSlash(false)
    textareaRef.current?.focus()
  }, [])

  const canSend = (text.trim().length > 0 || attachments.length > 0) && !isRunning

  return (
    <div className="relative border-t border-zinc-800 bg-zinc-950">
      {showSlash && (
        <SlashCommandMenu
          query={text.slice(1)}
          onSelect={handleSlashSelect}
          onClose={() => setShowSlash(false)}
        />
      )}

      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 border-b border-zinc-800 px-3 py-2">
          {attachments.map((att, i) => (
            <div
              key={i}
              className="group relative flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5"
            >
              {att.type === 'image' ? (
                <>
                  <img
                    src={att.previewUrl}
                    alt={att.name}
                    className="h-8 w-8 rounded object-cover"
                  />
                  <span className="max-w-[100px] truncate text-xs text-zinc-400">{att.name}</span>
                </>
              ) : (
                <>
                  <Image size={14} className="text-zinc-500" />
                  <span className="max-w-[120px] truncate text-xs text-zinc-400">{att.name}</span>
                  <span className="text-xs text-zinc-600">
                    {(att.size / 1024).toFixed(0)}KB
                  </span>
                </>
              )}
              <button
                onClick={() => removeAttachment(i)}
                className="ml-1 flex h-4 w-4 items-center justify-center rounded-full bg-zinc-600 text-zinc-300 transition-colors hover:bg-zinc-500"
              >
                <X size={9} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`flex items-end gap-2 px-3 py-3 transition-colors ${
          isDragging ? 'bg-blue-950/20' : ''
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFilePickerChange}
          accept="image/*,text/*,.pdf,.json,.ts,.tsx,.js,.jsx,.py,.md,.yaml,.yml,.toml,.csv"
        />

        <button
          onClick={() => fileInputRef.current?.click()}
          title="Attach file"
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
        >
          <Paperclip size={16} />
        </button>

        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={sessionId ? 'Message Claude... (Enter to send, Shift+Enter for newline)' : 'Open a folder to start'}
          disabled={!sessionId && false}
          rows={1}
          className="min-h-[36px] flex-1 resize-none rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:ring-1 focus:ring-zinc-600"
        />

        {isRunning ? (
          <button
            onClick={onStop}
            title="Stop"
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-red-700 text-white transition-colors hover:bg-red-600"
          >
            <Square size={14} />
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!canSend}
            title="Send"
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-zinc-700 text-zinc-100 transition-colors hover:bg-zinc-600 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Send size={14} />
          </button>
        )}
      </div>
    </div>
  )
}
