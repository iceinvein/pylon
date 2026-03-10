import { Eye, Brain, Pencil, Terminal, Users, MessageCircle, RotateCcw, CheckCircle, ListChecks } from 'lucide-react'
import type { ActivityType } from '../../lib/flow-types'

type DotShape = 'filled' | 'hollow' | 'diamond'

type NodeStyle = {
  icon: typeof Eye
  color: string
  bgColor: string
  borderColor: string
  dotShape: DotShape
  /** Quiet nodes render as inline text instead of cards */
  isQuiet: boolean
  /** Hex color for gradient endpoint and dot fill */
  accentHex: string
}

const NODE_STYLES: Record<ActivityType, NodeStyle> = {
  explore:     { icon: Eye,           color: 'text-blue-400',   bgColor: 'bg-blue-400/10',   borderColor: 'border-blue-400/30',   dotShape: 'hollow',  isQuiet: true,  accentHex: '#60a5fa' },
  think:       { icon: Brain,         color: 'text-purple-400', bgColor: 'bg-purple-400/10', borderColor: 'border-purple-400/30', dotShape: 'hollow',  isQuiet: true,  accentHex: '#c084fc' },
  edit:        { icon: Pencil,        color: 'text-amber-400',  bgColor: 'bg-amber-400/10',  borderColor: 'border-amber-400/30',  dotShape: 'filled',  isQuiet: false, accentHex: '#fbbf24' },
  execute:     { icon: Terminal,      color: 'text-green-400',  bgColor: 'bg-green-400/10',  borderColor: 'border-green-400/30',  dotShape: 'filled',  isQuiet: false, accentHex: '#4ade80' },
  subagent:    { icon: Users,         color: 'text-cyan-400',   bgColor: 'bg-cyan-400/10',   borderColor: 'border-cyan-400/30',   dotShape: 'diamond', isQuiet: false, accentHex: '#22d3ee' },
  'ask-user':  { icon: MessageCircle, color: 'text-orange-400', bgColor: 'bg-orange-400/10', borderColor: 'border-orange-400/30', dotShape: 'filled',  isQuiet: false, accentHex: '#fb923c' },
  'error-fix': { icon: RotateCcw,     color: 'text-red-400',    bgColor: 'bg-red-400/10',    borderColor: 'border-red-400/30',    dotShape: 'filled',  isQuiet: false, accentHex: '#f87171' },
  'task-list': { icon: ListChecks,    color: 'text-yellow-400', bgColor: 'bg-yellow-400/10', borderColor: 'border-yellow-400/30', dotShape: 'filled',  isQuiet: false, accentHex: '#facc15' },
  result:      { icon: CheckCircle,   color: 'text-stone-400',  bgColor: 'bg-stone-400/10',  borderColor: 'border-stone-400/30',  dotShape: 'filled',  isQuiet: false, accentHex: '#a8a29e' },
}

export { NODE_STYLES }
export type { NodeStyle, DotShape }
