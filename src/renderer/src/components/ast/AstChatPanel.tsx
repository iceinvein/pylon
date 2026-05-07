import { Send } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAstStore } from '../../store/ast-store'

export function AstChatPanel() {
  const chatMessages = useAstStore((s) => s.chatMessages)
  const chatLoading = useAstStore((s) => s.chatLoading)
  const addChatMessage = useAstStore((s) => s.addChatMessage)
  const setChatLoading = useAstStore((s) => s.setChatLoading)
  const scope = useAstStore((s) => s.scope)
  const setSelectedEntity = useAstStore((s) => s.setSelectedEntity)

  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const messageCount = chatMessages.length
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll when messages change or loading state changes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messageCount, chatLoading])

  const handleSend = useCallback(() => {
    const text = input.trim()
    if (!text || chatLoading) return

    addChatMessage({ role: 'user', content: text })
    setChatLoading(true)
    setInput('')
    window.api.sendAstChat(text, scope).catch(() => {
      setChatLoading(false)
    })
  }, [input, chatLoading, addChatMessage, setChatLoading, scope])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend],
  )

  const handleSelectCitation = useCallback(
    (filePath: string) => {
      setSelectedEntity({ kind: 'file', filePath })
    },
    [setSelectedEntity],
  )

  return (
    <div className="flex flex-col border-base-border border-t bg-base-surface">
      {/* Messages */}
      <div className="flex max-h-48 flex-col gap-2 overflow-y-auto px-3 py-2">
        {chatMessages.length === 0 && !chatLoading && (
          <p className="py-2 text-center text-base-text-muted text-xs">
            Ask questions about this codebase
          </p>
        )}

        {chatMessages.map((msg, i) => (
          <div key={`msg-${i}-${msg.role}`} className="flex items-start gap-2">
            <div
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-bold text-[10px] ${
                msg.role === 'user'
                  ? 'bg-base-text-secondary/20 text-base-text-secondary'
                  : 'bg-special/20 text-special-text'
              }`}
            >
              {msg.role === 'user' ? 'U' : 'C'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="whitespace-pre-wrap text-base-text text-xs leading-relaxed">
                {msg.content}
              </p>
              {msg.role === 'assistant' && msg.highlights && msg.highlights.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {msg.highlights.map((highlight) => {
                    const fileName = highlight.filePath.split('/').pop() ?? highlight.filePath
                    const label = highlight.symbolName
                      ? `${fileName} · ${highlight.symbolName}`
                      : fileName
                    return (
                      <button
                        key={`${highlight.filePath}:${highlight.symbolName ?? ''}`}
                        type="button"
                        onClick={() => handleSelectCitation(highlight.filePath)}
                        className="max-w-full truncate rounded border border-base-border px-1.5 py-0.5 font-mono text-[10px] text-base-text-muted transition-colors hover:bg-base-raised hover:text-base-text"
                        title={highlight.filePath}
                      >
                        {label}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        ))}

        {chatLoading && (
          <div className="flex items-start gap-2">
            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-special/20 font-bold text-[10px] text-special-text">
              C
            </div>
            <p className="animate-pulse text-base-text-muted text-xs">Thinking...</p>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input bar */}
      <div className="flex items-center gap-2 border-base-border border-t px-3 py-2">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about the codebase..."
          disabled={chatLoading}
          className="min-w-0 flex-1 rounded-md border border-base-border bg-base-bg px-2.5 py-1.5 text-base-text text-xs placeholder:text-base-text-muted focus:border-accent-text focus:outline-none disabled:opacity-50"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={chatLoading || !input.trim()}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-base-text text-base-bg transition-colors hover:bg-base-text/80 disabled:opacity-40"
        >
          <Send size={12} />
        </button>
      </div>
    </div>
  )
}
