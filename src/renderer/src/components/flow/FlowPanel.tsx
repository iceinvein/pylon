import { Workflow } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { buildFlowGraph } from '../../lib/flow-graph'
import type { FlowElement, FlowNode as FlowNodeType } from '../../lib/flow-types'
import { useSessionStore } from '../../store/session-store'
import { useTabStore } from '../../store/tab-store'
import { FlowNode } from './FlowNode'
import type { DotShape as DotShapeType } from './flow-constants'
import { NODE_STYLES } from './flow-constants'

const emptyMessages: unknown[] = []

/** Spine left offset in px */
const SPINE_LEFT = 20
/** Content left padding (past the spine + connector) */
const CONTENT_LEFT = 40
/** Parallel sub-lane indent from spine */
const PARALLEL_INDENT = 16

function Dot({
  node,
  isActive,
  isParallel,
}: {
  node: FlowNodeType
  isActive?: boolean
  isParallel?: boolean
}) {
  const style = NODE_STYLES[node.type]
  const size = isParallel ? 4 : 6

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: size * 2, height: size * 2 }}
    >
      {isActive && (
        <div
          className="flow-dot-pulse absolute rounded-full"
          style={{
            width: size * 3,
            height: size * 3,
            backgroundColor: `${style.accentHex}20`,
            border: `1.5px solid ${style.accentHex}60`,
          }}
        />
      )}
      <DotIcon shape={style.dotShape} size={size} color={style.accentHex} isQuiet={style.isQuiet} />
    </div>
  )
}

function DotIcon({
  shape,
  size,
  color,
  isQuiet,
}: {
  shape: DotShapeType
  size: number
  color: string
  isQuiet: boolean
}) {
  if (shape === 'diamond') {
    return (
      <div
        className="rotate-45"
        style={{
          width: size + 2,
          height: size + 2,
          backgroundColor: color,
        }}
      />
    )
  }

  if (shape === 'hollow' || isQuiet) {
    return (
      <div
        className="rounded-full"
        style={{
          width: size,
          height: size,
          border: `1.5px solid #57534e`,
          backgroundColor: 'transparent',
        }}
      />
    )
  }

  // filled
  return (
    <div
      className="rounded-full"
      style={{
        width: size,
        height: size,
        backgroundColor: color,
      }}
    />
  )
}

/** Compute the gradient bottom color from the last element */
function getBottomAccent(elements: FlowElement[], isStreaming: boolean): string {
  if (!isStreaming) return '#706660' // --color-base-text-muted
  // Walk backwards to find the last node
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i]
    if (el.kind === 'node') return NODE_STYLES[el.node.type].accentHex
    if (el.kind === 'parallel' && el.nodes.length > 0)
      return NODE_STYLES[el.nodes[0].type].accentHex
  }
  return '#78716c'
}

export function FlowPanel() {
  const activeTab = useTabStore((s) => s.tabs.find((t) => t.id === s.activeTabId))
  const sessionId = activeTab?.sessionId
  const messages =
    useSessionStore((s) => (sessionId ? s.messages.get(sessionId) : undefined)) ?? emptyMessages
  const isStreaming = useSessionStore((s) => (sessionId ? !!s.streamingText.get(sessionId) : false))

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
  }, [])

  const handleNodeClick = useCallback((messageIndices: number[]) => {
    if (messageIndices.length === 0) return
    window.dispatchEvent(
      new CustomEvent('flow-scroll-to-message', {
        detail: { messageIndex: messageIndices[0] },
      }),
    )
  }, [])

  if (!sessionId) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <p className="text-[var(--color-base-text-faint)] text-xs">No active session</p>
      </div>
    )
  }

  const nodeCount = graph.elements.filter((e) => e.kind === 'node' || e.kind === 'parallel').length

  if (nodeCount === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-4">
        <Workflow size={20} className="text-[var(--color-base-text-faint)]" />
        <p className="text-[var(--color-base-text-faint)] text-xs">
          Flow will appear as the agent works
        </p>
      </div>
    )
  }

  const bottomAccent = getBottomAccent(graph.elements, isStreaming)

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto overflow-x-hidden">
      {/* Timeline container */}
      <div className="relative py-3" style={{ paddingLeft: CONTENT_LEFT }}>
        {/* Gradient spine */}
        <div
          className="absolute top-3 bottom-3"
          style={{
            left: SPINE_LEFT,
            width: 1.5,
            background: `linear-gradient(to bottom, #44403c, ${bottomAccent})`,
          }}
        />

        {/* Flow elements */}
        <div className="flex flex-col">
          {graph.elements.map((element, i) => {
            if (element.kind === 'edge') {
              // Edges are implicit in the timeline — spacing between nodes handles it
              // For retry edges, we add a subtle dashed indicator
              if (element.type === 'retry') {
                return (
                  <div key={`edge-${i}`} className="relative" style={{ height: 4 }}>
                    <div
                      className="absolute border-[var(--color-error)]/40 border-l border-dashed"
                      style={{ left: SPINE_LEFT - CONTENT_LEFT, top: 0, bottom: 0 }}
                    />
                  </div>
                )
              }
              return null // Sequential edges are implicit via spacing
            }

            if (element.kind === 'parallel') {
              return (
                <div
                  key={`par-${i}`}
                  className="relative"
                  style={{ marginTop: 16, marginBottom: 16 }}
                >
                  {/* Sub-lane line */}
                  <div
                    className="absolute top-0 bottom-0 bg-[var(--color-base-border)]/50"
                    style={{
                      left: SPINE_LEFT - CONTENT_LEFT + PARALLEL_INDENT,
                      width: 1,
                    }}
                  />
                  <div className="flex flex-col" style={{ paddingLeft: PARALLEL_INDENT }}>
                    {element.nodes.map((node) => (
                      <div
                        key={node.id}
                        className="relative flex items-start gap-2"
                        style={{ marginBottom: 6 }}
                      >
                        {/* Parallel dot */}
                        <div
                          className="relative flex flex-shrink-0 items-center"
                          style={{
                            width: 12,
                            marginLeft: SPINE_LEFT - CONTENT_LEFT + PARALLEL_INDENT - 6,
                            marginTop: 6,
                          }}
                        >
                          <Dot node={node} isActive={node.isActive} isParallel />
                        </div>
                        {/* Parallel node content */}
                        <div className="min-w-0 flex-1 pr-3">
                          <FlowNode node={node} onClick={handleNodeClick} isParallel />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            }

            // Single node
            const style = NODE_STYLES[element.node.type]
            const isQuiet = style.isQuiet
            const spacing = isQuiet ? 8 : 12

            return (
              <div
                key={element.node.id}
                className="relative flex items-start gap-2"
                style={{ marginBottom: spacing }}
              >
                {/* Dot on the spine */}
                <div
                  className="relative flex flex-shrink-0 items-center"
                  style={{
                    width: 20,
                    marginLeft: SPINE_LEFT - CONTENT_LEFT - 4,
                    marginTop: isQuiet ? 4 : 8,
                  }}
                >
                  <Dot node={element.node} isActive={element.node.isActive} />
                  {/* Horizontal connector for loud nodes */}
                  {!isQuiet && (
                    <div
                      className="absolute bg-[var(--color-base-border)]/40"
                      style={{ left: 16, width: 8, height: 1, top: '50%' }}
                    />
                  )}
                </div>
                {/* Node content */}
                <div className="min-w-0 flex-1 pr-3">
                  <FlowNode node={element.node} onClick={handleNodeClick} />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
