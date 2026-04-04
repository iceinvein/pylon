import type { LucideIcon } from 'lucide-react'
import {
  Archive,
  DollarSign,
  Eraser,
  FolderOpen,
  GitCommit,
  HelpCircle,
  Info,
  Keyboard,
  Network,
  Settings,
} from 'lucide-react'
import { useSessionStore } from '../store/session-store'
import { useUiStore } from '../store/ui-store'

export type CommandContext = {
  sessionId: string | null
  activeSessionId: string | null
  model: string
  permissionMode: string
}

export type SlashCommand = {
  id: string
  label: string
  description: string
  icon: LucideIcon
  section: 'session' | 'global'
  requiresSession: boolean
  keywords?: string[]
  execute: (context: CommandContext) => void | Promise<void>
}

export const COMMANDS: SlashCommand[] = [
  // ── Session commands ──
  {
    id: 'clear',
    label: 'Clear chat',
    description: 'Clear conversation and start fresh in this session',
    icon: Eraser,
    section: 'session',
    requiresSession: true,
    execute: async (ctx) => {
      if (!ctx.sessionId) return
      try {
        await window.api.stopSession(ctx.sessionId)
      } catch {}
      useSessionStore.getState().setMessages(ctx.sessionId, [])
      useSessionStore.getState().clearTasks(ctx.sessionId)
      useUiStore.getState().deselectSession()
    },
  },
  {
    id: 'commit',
    label: 'Commit',
    description: 'Commit current changes with AI-generated message',
    icon: GitCommit,
    section: 'session',
    requiresSession: true,
    keywords: ['git'],
    execute: async (ctx) => {
      if (!ctx.sessionId) return
      useSessionStore.getState().appendMessage(ctx.sessionId, { type: 'user', content: 'commit' })
      await window.api.sendMessage(ctx.sessionId, 'commit', [])
    },
  },
  {
    id: 'compact',
    label: 'Compact conversation',
    description: 'Summarize and compress history to save context',
    icon: Archive,
    section: 'session',
    requiresSession: true,
    keywords: ['summarize', 'compress'],
    execute: async (ctx) => {
      if (!ctx.sessionId) return
      await window.api.sendMessage(ctx.sessionId, '/compact', [])
    },
  },
  {
    id: 'cost',
    label: 'Show cost',
    description: 'Display token usage and cost',
    icon: DollarSign,
    section: 'session',
    requiresSession: true,
    keywords: ['tokens', 'usage', 'price'],
    execute: async (ctx) => {
      if (!ctx.sessionId) return
      await window.api.sendMessage(ctx.sessionId, '/cost', [])
    },
  },
  {
    id: 'status',
    label: 'Show status',
    description: 'Display session info, model, and cwd',
    icon: Info,
    section: 'session',
    requiresSession: true,
    keywords: ['info', 'session'],
    execute: (ctx) => {
      if (!ctx.sessionId) return
      const lines = [
        `**Model:** ${ctx.model}`,
        `**Directory:** ${ctx.cwd ?? 'unknown'}`,
        `**Permission mode:** ${ctx.permissionMode}`,
      ]
      useSessionStore.getState().appendMessage(ctx.sessionId, {
        type: 'system',
        content: lines.join('\n'),
      })
    },
  },
  {
    id: 'help',
    label: 'Help',
    description: 'Show available commands',
    icon: HelpCircle,
    section: 'session',
    requiresSession: true,
    keywords: ['commands', 'list'],
    execute: (ctx) => {
      if (!ctx.sessionId) return
      const available = getCommands(ctx)
      const lines = available.map((c) => `**/${c.id}** — ${c.description}`)
      const content = `**Available commands**\n\n${lines.join('\n')}`
      useSessionStore.getState().appendMessage(ctx.sessionId, {
        type: 'system',
        content,
      })
    },
  },

  // ── Global commands ──
  {
    id: 'config',
    label: 'Settings',
    description: 'Open settings',
    icon: Settings,
    section: 'global',
    requiresSession: false,
    keywords: ['preferences', 'options'],
    execute: () => {
      useUiStore.getState().setSettingsOpen(true)
    },
  },
  {
    id: 'open-folder',
    label: 'Open folder',
    description: 'Open a project folder in a new tab',
    icon: FolderOpen,
    section: 'global',
    requiresSession: false,
    keywords: ['project', 'directory'],
    execute: async () => {
      const path = await window.api.openFolder()
      if (path) useTabStore.getState().addTab(path)
    },
  },
  {
    id: 'keyboard-shortcuts',
    label: 'Keyboard Shortcuts',
    description: 'Show all keyboard shortcuts',
    icon: Keyboard,
    section: 'global',
    requiresSession: false,
    keywords: ['keys', 'hotkeys', 'bindings', 'help'],
    execute: () => {
      useUiStore.getState().setShortcutsOpen(true)
    },
  },
  {
    id: 'explore-codebase',
    label: 'Explore Codebase',
    description: 'Visualize code structure and architecture',
    icon: Network,
    section: 'global',
    requiresSession: false,
    keywords: ['ast', 'architecture', 'visualization', 'graph', 'dependencies'],
    execute: () => {
      useUiStore.getState().setSidebarView('ast')
    },
  },
]

export function getCommands(context: CommandContext): SlashCommand[] {
  return COMMANDS.filter((cmd) => {
    if (cmd.requiresSession && !context.sessionId) return false
    return true
  })
}

export function findCommand(id: string): SlashCommand | undefined {
  return COMMANDS.find((cmd) => cmd.id === id)
}
