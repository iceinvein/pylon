import { Eye, Brain, Pencil, Terminal, Users, MessageCircle, RotateCcw, CheckCircle } from 'lucide-react'
import type { ActivityType } from '../../lib/flow-types'

type NodeStyle = {
  icon: typeof Eye
  color: string
  bgColor: string
  borderColor: string
}

const NODE_STYLES: Record<ActivityType, NodeStyle> = {
  explore:    { icon: Eye,           color: 'text-blue-400',   bgColor: 'bg-blue-400/10',   borderColor: 'border-blue-400/30' },
  think:      { icon: Brain,         color: 'text-purple-400', bgColor: 'bg-purple-400/10', borderColor: 'border-purple-400/30' },
  edit:       { icon: Pencil,        color: 'text-amber-400',  bgColor: 'bg-amber-400/10',  borderColor: 'border-amber-400/30' },
  execute:    { icon: Terminal,      color: 'text-green-400',  bgColor: 'bg-green-400/10',  borderColor: 'border-green-400/30' },
  subagent:   { icon: Users,         color: 'text-cyan-400',   bgColor: 'bg-cyan-400/10',   borderColor: 'border-cyan-400/30' },
  'ask-user': { icon: MessageCircle, color: 'text-orange-400', bgColor: 'bg-orange-400/10', borderColor: 'border-orange-400/30' },
  'error-fix':{ icon: RotateCcw,     color: 'text-red-400',    bgColor: 'bg-red-400/10',    borderColor: 'border-red-400/30' },
  result:     { icon: CheckCircle,   color: 'text-stone-400',  bgColor: 'bg-stone-400/10',  borderColor: 'border-stone-400/30' },
}

export { NODE_STYLES }
export type { NodeStyle }
