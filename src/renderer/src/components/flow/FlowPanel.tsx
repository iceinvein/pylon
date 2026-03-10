import { useMemo, useRef, useEffect, useCallback } from 'react'
import { useSessionStore } from '../../store/session-store'
import { useTabStore } from '../../store/tab-store'
import { buildFlowGraph } from '../../lib/flow-graph'
import { FlowNode } from './FlowNode'
import { FlowEdge } from './FlowEdge'
import { NODE_HEIGHT, SVG_PADDING } from './flow-constants'
import { Workflow } from 'lucide-react'
import type { FlowNode as FlowNodeType } from '../../lib/flow-types'

const emptyMessages: unknown[] = []

export function FlowPanel() {
  const activeTab = useTabStore((s) => s.tabs.find((t) => t.id === s.activeTabId))
  const sessionId = activeTab?.sessionId
  const messages = useSessionStore((s) => sessionId ? s.messages.get(sessionId) : undefined) ?? emptyMessages
  const isStreaming = useSessionStore((s) => sessionId ? !!s.streamingText.get(sessionId) : false)

  const graph = useMemo(() => buildFlowGraph(messages, isStreaming), [messages, isStreaming])

  const nodeMap = useMemo(() => {
    const map = new Map<string, FlowNodeType>()
    for (const node of graph.nodes) {
      map.set(node.id, node)
    }
    return map
  }, [graph.nodes])

  const svgHeight = useMemo(() => {
    if (graph.nodes.length === 0) return 200
    const maxY = Math.max(...graph.nodes.map((n) => n.y))
    return maxY + NODE_HEIGHT + SVG_PADDING * 2
  }, [graph.nodes])

  const svgWidth = useMemo(() => {
    if (graph.nodes.length === 0) return 200
    const maxX = Math.max(...graph.nodes.map((n) => n.x))
    return maxX + SVG_PADDING * 2 + 100
  }, [graph.nodes])

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
  }, [graph.nodes.length])

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

  if (graph.nodes.length === 0) {
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
        <span className="text-[10px] text-stone-600">{graph.nodes.length} steps</span>
      </div>
      <svg
        width={svgWidth}
        height={svgHeight}
        className="w-full"
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        preserveAspectRatio="xMidYMin meet"
      >
        {graph.edges.map((edge) => (
          <FlowEdge key={edge.id} edge={edge} nodes={nodeMap} />
        ))}
        {graph.nodes.map((node) => (
          <FlowNode key={node.id} node={node} onClick={handleNodeClick} />
        ))}
      </svg>
    </div>
  )
}
