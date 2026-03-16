import {
  Brain,
  CheckCircle,
  Eye,
  ListChecks,
  MessageCircle,
  Pencil,
  RotateCcw,
  Terminal,
  Users,
} from 'lucide-react'
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
  explore: {
    icon: Eye,
    color: 'text-[var(--color-info)]',
    bgColor: 'bg-[var(--color-info)]/10',
    borderColor: 'border-[var(--color-info)]/30',
    dotShape: 'hollow',
    isQuiet: true,
    accentHex: '#5a8ac4', // --color-info
  },
  think: {
    icon: Brain,
    color: 'text-[var(--color-base-text-secondary)]',
    bgColor: 'bg-[var(--color-base-text-secondary)]/10',
    borderColor: 'border-[var(--color-base-text-secondary)]/30',
    dotShape: 'hollow',
    isQuiet: true,
    accentHex: '#a89e93', // --color-base-text-secondary
  },
  edit: {
    icon: Pencil,
    color: 'text-[var(--color-warning)]',
    bgColor: 'bg-[var(--color-warning)]/10',
    borderColor: 'border-[var(--color-warning)]/30',
    dotShape: 'filled',
    isQuiet: false,
    accentHex: '#c49a4a', // --color-warning
  },
  execute: {
    icon: Terminal,
    color: 'text-[var(--color-accent-text)]',
    bgColor: 'bg-[var(--color-accent)]/10',
    borderColor: 'border-[var(--color-accent)]/30',
    dotShape: 'filled',
    isQuiet: false,
    accentHex: '#a85838', // --color-accent
  },
  subagent: {
    icon: Users,
    color: 'text-[var(--color-info)]',
    bgColor: 'bg-[var(--color-info)]/10',
    borderColor: 'border-[var(--color-info)]/30',
    dotShape: 'diamond',
    isQuiet: false,
    accentHex: '#5a8ac4', // --color-info
  },
  'ask-user': {
    icon: MessageCircle,
    color: 'text-[var(--color-accent-text)]',
    bgColor: 'bg-[var(--color-accent)]/10',
    borderColor: 'border-[var(--color-accent)]/30',
    dotShape: 'filled',
    isQuiet: false,
    accentHex: '#e8a080', // --color-accent-text
  },
  'error-fix': {
    icon: RotateCcw,
    color: 'text-[var(--color-error)]',
    bgColor: 'bg-[var(--color-error)]/10',
    borderColor: 'border-[var(--color-error)]/30',
    dotShape: 'filled',
    isQuiet: false,
    accentHex: '#d06464', // --color-error
  },
  'task-list': {
    icon: ListChecks,
    color: 'text-[var(--color-warning)]',
    bgColor: 'bg-[var(--color-warning)]/10',
    borderColor: 'border-[var(--color-warning)]/30',
    dotShape: 'filled',
    isQuiet: false,
    accentHex: '#c49a4a', // --color-warning
  },
  result: {
    icon: CheckCircle,
    color: 'text-[var(--color-base-text-muted)]',
    bgColor: 'bg-[var(--color-base-text-muted)]/10',
    borderColor: 'border-[var(--color-base-text-muted)]/30',
    dotShape: 'filled',
    isQuiet: false,
    accentHex: '#908578', // --color-base-text-muted
  },
}

export { NODE_STYLES }
export type { NodeStyle, DotShape }
