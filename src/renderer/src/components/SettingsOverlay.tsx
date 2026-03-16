import {
  ArrowLeft,
  BarChart3,
  Blocks,
  Bot,
  HardDrive,
  Info,
  Plug,
  Settings,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { lazy, Suspense, useEffect, useState } from 'react'
import type {
  AppSettings,
  GhCliStatus,
  InstalledPlugin,
  PluginManagementData,
  PluginMarketplace,
} from '../../../shared/types'
import { useUiStore } from '../store/ui-store'

const UsageDashboard = lazy(() =>
  import('./UsageDashboard').then((m) => ({ default: m.UsageDashboard })),
)

const MODELS = [
  { id: 'claude-opus-4-6', label: 'Opus 4.6' },
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
  { id: 'claude-haiku-4-5', label: 'Haiku 4.5' },
] as const

const PERMISSION_MODES = [
  {
    id: 'default' as const,
    label: 'Default',
    icon: ShieldCheck,
    description: 'Ask before each tool use',
  },
  {
    id: 'auto-approve' as const,
    label: 'YOLO',
    icon: ShieldAlert,
    description: 'Auto-approve all tool permissions',
  },
]

const TABS = [
  { id: 'general', label: 'General', icon: Settings },
  { id: 'plugins', label: 'Plugins', icon: Blocks },
  { id: 'usage', label: 'Usage', icon: BarChart3 },
  { id: 'agents', label: 'Review Agents', icon: Bot },
  { id: 'integrations', label: 'Integrations', icon: Plug },
  { id: 'storage', label: 'Storage', icon: HardDrive },
] as const

type SettingsTab = (typeof TABS)[number]['id']

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

function PluginToggle({
  enabled,
  onToggle,
}: {
  enabled: boolean
  onToggle: (enabled: boolean) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(!enabled)}
      className={`relative h-5 w-9 rounded-full transition-colors ${
        enabled ? 'bg-[var(--color-success)]' : 'bg-[var(--color-base-border)]'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
          enabled ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

function PluginsTabContent({
  plugins,
  marketplaces,
  onToggle,
}: {
  plugins: InstalledPlugin[]
  marketplaces: PluginMarketplace[]
  onToggle: (pluginId: string, enabled: boolean) => void
}) {
  // Deduplicate: show user-scope install if both user + project exist
  const deduped = new Map<string, InstalledPlugin>()
  for (const p of plugins) {
    const existing = deduped.get(p.id)
    if (!existing || p.scope === 'user') {
      deduped.set(p.id, p)
    }
  }

  // Group by marketplace
  const byMarketplace = new Map<string, InstalledPlugin[]>()
  for (const p of deduped.values()) {
    const group = byMarketplace.get(p.marketplace) ?? []
    group.push(p)
    byMarketplace.set(p.marketplace, group)
  }

  // Build marketplace display names
  const mpInfo = new Map(marketplaces.map((m) => [m.id, m]))

  return (
    <div className="mt-5 space-y-6">
      {[...byMarketplace.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([marketplaceId, marketplacePlugins]) => {
          const mp = mpInfo.get(marketplaceId)
          const source = mp?.source
          const repoLabel = source?.repo ?? source?.url ?? marketplaceId

          return (
            <section key={marketplaceId}>
              <div className="mb-3 flex items-center gap-2">
                <h3 className="font-medium text-[var(--color-base-text)] text-sm">
                  {marketplaceId}
                </h3>
                {repoLabel !== marketplaceId && (
                  <span className="text-[10px] text-[var(--color-base-text-faint)]">
                    {repoLabel}
                  </span>
                )}
              </div>
              <div className="space-y-1">
                {marketplacePlugins
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((plugin) => (
                    <div
                      key={plugin.id}
                      className="flex items-center gap-3 rounded-lg border border-[var(--color-base-border-subtle)]/50 bg-[var(--color-base-surface)]/30 px-4 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-[var(--color-base-text)] text-sm">
                            {plugin.name}
                          </span>
                          <span className="text-[10px] text-[var(--color-base-text-faint)] tabular-nums">
                            {plugin.version}
                          </span>
                          {plugin.scope === 'project' && (
                            <span className="rounded bg-[var(--color-base-raised)] px-1.5 py-0.5 text-[10px] text-[var(--color-base-text-muted)]">
                              project
                            </span>
                          )}
                        </div>
                      </div>
                      <PluginToggle
                        enabled={plugin.enabled}
                        onToggle={(enabled) => onToggle(plugin.id, enabled)}
                      />
                    </div>
                  ))}
              </div>
            </section>
          )
        })}

      <div className="flex items-start gap-2 rounded-md border border-[var(--color-base-border-subtle)] bg-[var(--color-base-surface)]/50 px-3 py-2">
        <Info size={13} className="mt-0.5 flex-shrink-0 text-[var(--color-base-text-faint)]" />
        <p className="text-[var(--color-base-text-muted)] text-xs">
          Plugin changes take effect on the next session start. Plugins are managed via{' '}
          <code className="text-[var(--color-base-text-secondary)]">~/.claude/settings.json</code>.
        </p>
      </div>
    </div>
  )
}

export function SettingsOverlay() {
  const { settingsOpen, setSettingsOpen } = useUiStore()
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [activeTab, setActiveTab] = useState<SettingsTab>('general')
  const [ghStatus, setGhStatus] = useState<GhCliStatus | null>(null)
  const [ghPath, setGhPath] = useState('')
  const [ghChecking, setGhChecking] = useState(false)
  const [agentPrompts, setAgentPrompts] = useState<
    Array<{ id: string; name: string; prompt: string; isCustom: boolean }>
  >([])
  const [activeAgent, setActiveAgent] = useState<string | null>(null)
  const [pluginData, setPluginData] = useState<PluginManagementData | null>(null)
  const [pluginsLoading, setPluginsLoading] = useState(false)
  const [worktreeUsage, setWorktreeUsage] = useState<{ count: number; sizeBytes: number } | null>(
    null,
  )
  const [cleanupResult, setCleanupResult] = useState<{
    removed: number
    freedBytes: number
  } | null>(null)
  const [cleaning, setCleaning] = useState(false)

  async function loadPlugins() {
    setPluginsLoading(true)
    const data = await window.api.listPlugins()
    setPluginData(data)
    setPluginsLoading(false)
  }

  async function handleTogglePlugin(pluginId: string, enabled: boolean) {
    const ok = await window.api.togglePlugin(pluginId, enabled)
    if (ok && pluginData) {
      setPluginData({
        ...pluginData,
        plugins: pluginData.plugins.map((p) => (p.id === pluginId ? { ...p, enabled } : p)),
      })
    }
  }

  async function recheckGh() {
    setGhChecking(true)
    const status = await window.api.checkGhStatus()
    setGhStatus(status)
    setGhChecking(false)
  }

  async function updateGhPath() {
    if (!ghPath) return
    setGhChecking(true)
    const status = await window.api.setGhPath(ghPath)
    setGhStatus(status)
    setGhChecking(false)
  }

  useEffect(() => {
    if (!settingsOpen) return
    window.api.getSettings().then((s) => setSettings(s as AppSettings))
  }, [settingsOpen])

  // biome-ignore lint/correctness/useExhaustiveDependencies: recheckGh is stable intent
  useEffect(() => {
    if (settingsOpen && activeTab === 'integrations') recheckGh()
  }, [settingsOpen, activeTab])

  // biome-ignore lint/correctness/useExhaustiveDependencies: loadPlugins is stable intent
  useEffect(() => {
    if (settingsOpen && activeTab === 'plugins') loadPlugins()
  }, [settingsOpen, activeTab])

  useEffect(() => {
    if (settingsOpen && activeTab === 'storage') {
      setCleanupResult(null)
      window.api.getWorktreeUsage().then(setWorktreeUsage)
    }
  }, [settingsOpen, activeTab])

  useEffect(() => {
    if (settingsOpen && activeTab === 'agents') {
      window.api.getAgentPrompts().then((prompts) => {
        setAgentPrompts(prompts)
        if (prompts.length > 0) {
          setActiveAgent((prev) => prev ?? prompts[0].id)
        }
      })
    }
  }, [settingsOpen, activeTab])

  async function handleCleanupWorktrees() {
    setCleaning(true)
    setCleanupResult(null)
    const result = await window.api.cleanupAllWorktrees()
    setCleanupResult(result)
    const usage = await window.api.getWorktreeUsage()
    setWorktreeUsage(usage)
    setCleaning(false)
  }

  async function updateAgentPrompt(id: string, prompt: string) {
    await window.api.updateSettings(`reviewAgent.${id}`, prompt)
    setAgentPrompts((prev) => prev.map((a) => (a.id === id ? { ...a, prompt, isCustom: true } : a)))
  }

  async function resetAgentPrompt(id: string) {
    await window.api.resetAgentPrompt(id)
    const refreshed = await window.api.getAgentPrompts()
    setAgentPrompts(refreshed)
  }

  // Reset to General tab when overlay closes
  useEffect(() => {
    if (!settingsOpen) {
      setActiveTab('general')
      setActiveAgent(null)
    }
  }, [settingsOpen])

  async function updateSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    await window.api.updateSettings(key, value)
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  return (
    <AnimatePresence>
      {settingsOpen && (
        <motion.div
          className="fixed inset-0 z-40 flex flex-col bg-[var(--color-base-bg)]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {/* Spacer for macOS traffic lights / drag region */}
          <div className="h-12 flex-shrink-0" />

          {/* Two-column layout */}
          <div className="flex flex-1 overflow-hidden">
            {/* Sidebar */}
            <aside className="flex w-[200px] flex-shrink-0 flex-col border-[var(--color-base-border-subtle)] border-r px-3 py-4">
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="mb-4 flex items-center gap-1.5 rounded-md px-2 py-1 text-[var(--color-base-text-secondary)] text-xs transition-colors hover:bg-[var(--color-base-raised)] hover:text-[var(--color-base-text)]"
              >
                <ArrowLeft size={14} />
                <span>Back</span>
              </button>
              <h1 className="mb-4 px-2 font-medium text-[var(--color-base-text)] text-lg">
                Settings
              </h1>
              <nav className="flex flex-col gap-0.5">
                {TABS.map((tab) => {
                  const Icon = tab.icon
                  return (
                    <button
                      type="button"
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors ${
                        activeTab === tab.id
                          ? 'bg-[var(--color-base-raised)] text-[var(--color-base-text)]'
                          : 'text-[var(--color-base-text-muted)] hover:bg-[var(--color-base-raised)]/50 hover:text-[var(--color-base-text)]'
                      }`}
                    >
                      {activeTab === tab.id && (
                        <motion.div
                          layoutId="settings-sidebar-indicator"
                          className="absolute top-1/2 left-0 h-4 w-0.5 -translate-y-1/2 rounded-r bg-[var(--color-accent-hover)]"
                          transition={{ duration: 0.2 }}
                        />
                      )}
                      <Icon size={16} className="flex-shrink-0" />
                      <span>{tab.label}</span>
                    </button>
                  )
                })}
              </nav>
            </aside>

            {/* Content Area */}
            <div className="flex flex-1 flex-col overflow-y-auto">
              <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-8 py-6">
                {activeTab === 'general' && settings && (
                  <div className="mt-8 space-y-8">
                    {/* Default Model */}
                    <section>
                      <span className="block font-medium text-[var(--color-base-text)] text-sm">
                        Default Model
                      </span>
                      <p className="mt-0.5 text-[var(--color-base-text-muted)] text-xs">
                        Model used when creating new sessions
                      </p>
                      <div className="mt-3 flex gap-2">
                        {MODELS.map((m) => (
                          <button
                            type="button"
                            key={m.id}
                            onClick={() => updateSetting('defaultModel', m.id)}
                            className={`rounded-lg border px-3 py-2 text-xs transition-colors ${
                              settings.defaultModel === m.id
                                ? 'border-[var(--color-accent)]/60 bg-[var(--color-base-raised)] text-[var(--color-base-text)]'
                                : 'border-[var(--color-base-border)]/50 text-[var(--color-base-text-secondary)] hover:border-[var(--color-base-border)] hover:text-[var(--color-base-text)]'
                            }`}
                          >
                            {m.label}
                          </button>
                        ))}
                      </div>
                    </section>

                    {/* Default Permission Mode */}
                    <section>
                      <span className="block font-medium text-[var(--color-base-text)] text-sm">
                        Default Permission Mode
                      </span>
                      <p className="mt-0.5 text-[var(--color-base-text-muted)] text-xs">
                        Permission behavior for new sessions (can be overridden per-session)
                      </p>
                      <div className="mt-3 space-y-2">
                        {PERMISSION_MODES.map((m) => {
                          const Icon = m.icon
                          const isSelected = settings.defaultPermissionMode === m.id
                          const isYolo = m.id === 'auto-approve'
                          return (
                            <button
                              type="button"
                              key={m.id}
                              onClick={() => updateSetting('defaultPermissionMode', m.id)}
                              className={`flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors ${
                                isSelected
                                  ? isYolo
                                    ? 'border-[var(--color-accent)]/50 bg-[var(--color-accent-muted)]/20 text-[var(--color-accent-text)]'
                                    : 'border-[var(--color-accent)]/60 bg-[var(--color-base-raised)] text-[var(--color-base-text)]'
                                  : 'border-[var(--color-base-border)]/50 text-[var(--color-base-text-secondary)] hover:border-[var(--color-base-border)] hover:text-[var(--color-base-text)]'
                              }`}
                            >
                              <Icon size={16} className="flex-shrink-0" />
                              <div className="flex-1">
                                <div className="font-medium text-sm">{m.label}</div>
                                <div
                                  className={`text-xs ${isSelected ? (isYolo ? 'text-[var(--color-warning)]/70' : 'text-[var(--color-base-text-secondary)]') : 'text-[var(--color-base-text-muted)]'}`}
                                >
                                  {m.description}
                                </div>
                              </div>
                              <span
                                className={`h-2 w-2 rounded-full ${isSelected ? (isYolo ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-base-text)]') : 'bg-transparent'}`}
                              />
                            </button>
                          )
                        })}
                      </div>
                      <div className="mt-3 flex items-start gap-2 rounded-md border border-[var(--color-base-border-subtle)] bg-[var(--color-base-surface)]/50 px-3 py-2">
                        <Info
                          size={13}
                          className="mt-0.5 flex-shrink-0 text-[var(--color-base-text-faint)]"
                        />
                        <p className="text-[var(--color-base-text-muted)] text-xs">
                          YOLO mode auto-approves all tool permissions but still prompts for
                          questions that require your input. You can override the mode per-session
                          from the input bar.
                        </p>
                      </div>
                    </section>
                  </div>
                )}

                {activeTab === 'plugins' && (
                  <div className="mt-6">
                    <p className="text-[var(--color-base-text-secondary)] text-sm">
                      Manage installed Claude Code plugins. Toggle plugins on/off — changes take
                      effect on the next session.
                    </p>

                    {pluginsLoading ? (
                      <div className="mt-8 flex items-center justify-center text-[var(--color-base-text-faint)] text-sm">
                        Loading plugins...
                      </div>
                    ) : !pluginData || pluginData.plugins.length === 0 ? (
                      <div className="mt-8 text-center">
                        <p className="text-[var(--color-base-text-muted)] text-sm">
                          No plugins installed
                        </p>
                        <p className="mt-1 text-[var(--color-base-text-faint)] text-xs">
                          Install plugins via Claude Code CLI:{' '}
                          <code className="text-[var(--color-base-text-secondary)]">
                            claude mcp add-marketplace &lt;repo&gt;
                          </code>
                        </p>
                      </div>
                    ) : (
                      <PluginsTabContent
                        plugins={pluginData.plugins}
                        marketplaces={pluginData.marketplaces}
                        onToggle={handleTogglePlugin}
                      />
                    )}
                  </div>
                )}

                {activeTab === 'usage' && (
                  <Suspense
                    fallback={
                      <div className="flex items-center justify-center py-12 text-[var(--color-base-text-faint)] text-sm">
                        Loading...
                      </div>
                    }
                  >
                    <UsageDashboard />
                  </Suspense>
                )}

                {activeTab === 'agents' && (
                  <div className="mt-6 flex flex-1 flex-col">
                    <p className="text-[var(--color-base-text-secondary)] text-sm">
                      Customize the specialist prompt for each review agent. Each agent reviews the
                      PR diff with its own focus area. The standard review template (PR context,
                      diff, output format) is injected automatically — you only edit the specialist
                      guidance.
                    </p>

                    {/* Horizontal agent tabs */}
                    <div className="mt-4 flex gap-1 border-[var(--color-base-border-subtle)] border-b">
                      {agentPrompts.map((agent) => (
                        <button
                          type="button"
                          key={agent.id}
                          onClick={() => setActiveAgent(agent.id)}
                          className={`relative px-3 py-2 text-sm transition-colors ${
                            activeAgent === agent.id
                              ? 'text-[var(--color-base-text)]'
                              : 'text-[var(--color-base-text-muted)] hover:text-[var(--color-base-text)]'
                          }`}
                        >
                          {agent.name}
                          {agent.isCustom && (
                            <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-accent-hover)]" />
                          )}
                          {activeAgent === agent.id && (
                            <motion.div
                              layoutId="agent-tab-indicator"
                              className="absolute right-0 bottom-0 left-0 h-0.5 bg-[var(--color-accent-hover)]"
                              transition={{ duration: 0.2 }}
                            />
                          )}
                        </button>
                      ))}
                    </div>

                    {/* Selected agent content */}
                    {agentPrompts
                      .filter((agent) => agent.id === activeAgent)
                      .map((agent) => (
                        <div key={agent.id} className="mt-5 flex flex-1 flex-col">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <h3 className="font-medium text-[var(--color-base-text)] text-sm">
                                {agent.name}
                              </h3>
                              {agent.isCustom && (
                                <span className="rounded bg-[var(--color-base-raised)] px-1.5 py-0.5 text-[10px] text-[var(--color-base-text-secondary)]">
                                  customized
                                </span>
                              )}
                            </div>
                            {agent.isCustom && (
                              <button
                                type="button"
                                onClick={() => resetAgentPrompt(agent.id)}
                                className="text-[11px] text-[var(--color-base-text-muted)] transition-colors hover:text-[var(--color-base-text)]"
                              >
                                Reset to default
                              </button>
                            )}
                          </div>
                          <textarea
                            value={agent.prompt}
                            onChange={(e) => updateAgentPrompt(agent.id, e.target.value)}
                            className="mt-3 min-h-[200px] w-full flex-1 resize-y rounded-md bg-[var(--color-base-bg)] px-3 py-2 text-[var(--color-base-text)] text-xs leading-relaxed outline-none ring-1 ring-[var(--color-base-border-subtle)] focus:ring-[var(--color-base-border)]"
                          />
                        </div>
                      ))}
                  </div>
                )}

                {activeTab === 'integrations' && (
                  <div className="mt-8 space-y-8">
                    <section>
                      <span className="block font-medium text-[var(--color-base-text)] text-sm">
                        GitHub CLI (gh)
                      </span>
                      <p className="mt-0.5 text-[var(--color-base-text-muted)] text-xs">
                        Required for PR Review feature
                      </p>

                      <div className="mt-3 space-y-3 rounded-lg border border-[var(--color-base-border-subtle)] bg-[var(--color-base-surface)]/50 p-4">
                        <div className="flex items-center gap-2 text-sm">
                          <span
                            className={`h-2 w-2 rounded-full ${
                              ghStatus?.available && ghStatus?.authenticated
                                ? 'bg-[var(--color-success)]'
                                : ghStatus?.available
                                  ? 'bg-[var(--color-accent-hover)]'
                                  : 'bg-[var(--color-error)]'
                            }`}
                          />
                          <span className="text-[var(--color-base-text)]">
                            {ghStatus?.available && ghStatus?.authenticated
                              ? `Connected as ${ghStatus.username}`
                              : ghStatus?.available
                                ? 'Found but not authenticated'
                                : ghStatus
                                  ? 'Not detected'
                                  : 'Checking...'}
                          </span>
                        </div>

                        {ghStatus?.binaryPath && (
                          <div className="text-[var(--color-base-text-muted)] text-xs">
                            Path:{' '}
                            <code className="text-[var(--color-base-text-secondary)]">
                              {ghStatus.binaryPath}
                            </code>
                          </div>
                        )}

                        {ghStatus?.error && (
                          <div className="text-[var(--color-error)] text-xs">{ghStatus.error}</div>
                        )}

                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={ghPath}
                            onChange={(e) => setGhPath(e.target.value)}
                            placeholder="Custom path (e.g. /usr/local/bin/gh)"
                            className="flex-1 rounded bg-[var(--color-base-bg)] px-3 py-1.5 text-[var(--color-base-text)] text-xs placeholder-[var(--color-base-text-faint)] outline-none ring-1 ring-[var(--color-base-border-subtle)] focus:ring-[var(--color-base-border)]"
                          />
                          <button
                            type="button"
                            onClick={updateGhPath}
                            disabled={!ghPath}
                            className="rounded bg-[var(--color-base-raised)] px-3 py-1.5 text-[var(--color-base-text)] text-xs hover:bg-[var(--color-base-border)] disabled:opacity-30"
                          >
                            Set
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={recheckGh}
                          disabled={ghChecking}
                          className="rounded bg-[var(--color-base-raised)] px-3 py-1.5 text-[var(--color-base-text)] text-xs hover:bg-[var(--color-base-border)] disabled:opacity-50"
                        >
                          {ghChecking ? 'Checking...' : 'Re-check'}
                        </button>
                      </div>
                    </section>
                  </div>
                )}

                {activeTab === 'storage' && (
                  <div className="mt-8 space-y-8">
                    <section>
                      <span className="block font-medium text-[var(--color-base-text)] text-sm">
                        Git Worktrees
                      </span>
                      <p className="mt-0.5 text-[var(--color-base-text-muted)] text-xs">
                        Isolated git worktrees created for sessions. Worktrees older than 7 days are
                        automatically cleaned up on app startup.
                      </p>

                      <div className="mt-3 space-y-3 rounded-lg border border-[var(--color-base-border-subtle)] bg-[var(--color-base-surface)]/50 p-4">
                        {worktreeUsage ? (
                          <>
                            <div className="flex items-center justify-between">
                              <div className="space-y-1">
                                <div className="text-[var(--color-base-text)] text-sm">
                                  {worktreeUsage.count}{' '}
                                  {worktreeUsage.count === 1 ? 'worktree' : 'worktrees'}
                                </div>
                                <div className="text-[var(--color-base-text-muted)] text-xs">
                                  {formatBytes(worktreeUsage.sizeBytes)} on disk
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={handleCleanupWorktrees}
                                disabled={cleaning || worktreeUsage.count === 0}
                                className="rounded bg-[var(--color-base-raised)] px-3 py-1.5 text-[var(--color-base-text)] text-xs hover:bg-[var(--color-base-border)] disabled:opacity-30"
                              >
                                {cleaning ? 'Cleaning...' : 'Clean up all'}
                              </button>
                            </div>

                            {cleanupResult && (
                              <div className="rounded-md border border-[var(--color-success)]/50 bg-[var(--color-success)]/30 px-3 py-2 text-[var(--color-success)] text-xs">
                                Removed {cleanupResult.removed}{' '}
                                {cleanupResult.removed === 1 ? 'worktree' : 'worktrees'}, freed{' '}
                                {formatBytes(cleanupResult.freedBytes)}
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="text-[var(--color-base-text-faint)] text-sm">
                            Loading...
                          </div>
                        )}
                      </div>

                      <div className="mt-3 flex items-start gap-2 rounded-md border border-[var(--color-base-border-subtle)] bg-[var(--color-base-surface)]/50 px-3 py-2">
                        <Info
                          size={13}
                          className="mt-0.5 flex-shrink-0 text-[var(--color-base-text-faint)]"
                        />
                        <p className="text-[var(--color-base-text-muted)] text-xs">
                          Worktrees are created in{' '}
                          <code className="text-[var(--color-base-text-secondary)]">
                            ~/.pylon/worktrees/
                          </code>{' '}
                          when sessions use git isolation. Stale worktrees older than 7 days are
                          automatically removed on app startup.
                        </p>
                      </div>
                    </section>
                  </div>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
