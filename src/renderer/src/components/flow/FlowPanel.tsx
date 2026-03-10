import { useMemo, useRef, useEffect, useCallback } from 'react'
import { useSessionStore } from '../../store/session-store'
import { useTabStore } from '../../store/tab-store'
import { buildFlowGraph } from '../../lib/flow-graph'
import { FlowNode } from './FlowNode'
import { Workflow } from 'lucide-react'

const emptyMessages: unknown[] = []

export function FlowPanel() {
  const activeTab = useTabStore((s) => s.tabs.find((t) => t.id === s.activeTabId))
  const sessionId = activeTab?.sessionId
  const messages = useSessionStore((s) => sessionId ? s.messages.get(sessionId) : undefined) ?? emptyMessages
  const isStreaming = useSessionStore((s) => sessionId ? !!s.streamingText.get(sessionId) : false)

  const graph = useMemo(() => buildFlowGraph(messages, isStreaming), [messages, isStreaming])

  // Auto-scroll to bottom during streaming
  const scrollRef = useRef<HTMLDivElement>(null)
  const isNearBottomRef = useRef(true)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => {
      isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (isNearBottomRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [graph.elements.length])

  const handleNodeClick = useCallback((messageIndices: number[]) => {
    if (messageIndices.length === 0) return
    window.dispatchEvent(new CustomEvent('flow-scroll-to-message', {
      detail: { messageIndex: messageIndices[0] },
    }))
  }, [])

  if (!sessionId) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <p className="text-xs text-stone-600">No active session</p>
      </div>
    )
  }

  const nodeCount = graph.elements.filter((e) => e.kind === 'node' || e.kind === 'parallel').length

  if (nodeCount === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-4">
        <Workflow size={20} className="text-stone-700" />
        <p className="text-xs text-stone-600">Flow will appear as the agent works</p>
      </div>
    )
  }

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto overflow-x-hidden">
      <div className="flex items-center gap-2 border-b border-stone-800 px-3 py-2">
        <Workflow size={13} className="text-stone-500" />
        <span className="text-xs font-medium text-stone-400">Flow</span>
        <span className="text-[10px] text-stone-600">{nodeCount} steps</span>
      </div>
      <div className="flex flex-col items-center px-3 py-3">
        {graph.elements.map((element, i) => {
          if (element.kind === 'edge') {
            return (
              <div
                key={`edge-${i}`}
                className={`h-4 w-px ${element.type === 'retry' ? 'border-l border-dashed border-red-500' : 'bg-stone-700'}`}
              />
            )
          }

          if (element.kind === 'parallel') {
            return (
              <div key={`par-${i}`} className="flex w-full gap-2">
                {element.nodes.map((node) => (
                  <div key={node.id} className="min-w-0 flex-1">
                    <FlowNode node={node} onClick={handleNodeClick} />
                  </div>
                ))}
              </div>
            )
          }

          return (
            <div key={element.node.id} className="w-full">
              <FlowNode node={element.node} onClick={handleNodeClick} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
