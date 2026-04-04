import { Send } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAstStore } from '../../store/ast-store'

export function AstChatPanel() {
  const chatMessages = useAstStore((s) => s.chatMessages)
  const chatLoading = useAstStore((s) => s.chatLoading)
  const addChatMessage = useAstStore((s) => s.addChatMessage)
  const setChatLoading = useAstStore((s) => s.setChatLoading)
  const scope = useAstStore((s) => s.scope)

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
                  : 'bg-purple-500/20 text-purple-400'
              }`}
            >
              {msg.role === 'user' ? 'U' : 'C'}
            </div>
            <p className="min-w-0 whitespace-pre-wrap text-base-text text-xs leading-relaxed">
              {msg.content}
            </p>
          </div>
        ))}

        {chatLoading && (
          <div className="flex items-start gap-2">
            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-purple-500/20 font-bold text-[10px] text-purple-400">
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
