import {
  ArrowLeft,
  BarChart3,
  Blocks,
  Bot,
  Info,
  Plug,
  Settings,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import type {
  AppSettings,
  GhCliStatus,
  InstalledPlugin,
  PluginManagementData,
  PluginMarketplace,
} from '../../../shared/types'
import { useUiStore } from '../store/ui-store'
import { UsageDashboard } from './UsageDashboard'

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
] as const

type SettingsTab = (typeof TABS)[number]['id']

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
        enabled ? 'bg-green-600' : 'bg-stone-700'
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
                <h3 className="font-medium text-sm text-stone-300">{marketplaceId}</h3>
                {repoLabel !== marketplaceId && (
                  <span className="text-[10px] text-stone-600">{repoLabel}</span>
                )}
              </div>
              <div className="space-y-1">
                {marketplacePlugins
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((plugin) => (
                    <div
                      key={plugin.id}
                      className="flex items-center gap-3 rounded-lg border border-stone-800/50 bg-stone-900/30 px-4 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm text-stone-200">{plugin.name}</span>
                          <span className="text-[10px] text-stone-600 tabular-nums">
                            {plugin.version}
                          </span>
                          {plugin.scope === 'project' && (
                            <span className="rounded bg-stone-800 px-1.5 py-0.5 text-[10px] text-stone-500">
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

      <div className="flex items-start gap-2 rounded-md border border-stone-800 bg-stone-900/50 px-3 py-2">
        <Info size={13} className="mt-0.5 flex-shrink-0 text-stone-600" />
        <p className="text-stone-500 text-xs">
          Plugin changes take effect on the next session start. Plugins are managed via{' '}
          <code className="text-stone-400">~/.claude/settings.json</code>.
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
    if (settingsOpen && activeTab === 'agents') {
      window.api.getAgentPrompts().then((prompts) => {
        setAgentPrompts(prompts)
        if (prompts.length > 0) {
          setActiveAgent((prev) => prev ?? prompts[0].id)
        }
      })
    }
  }, [settingsOpen, activeTab])

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
          className="fixed inset-0 z-40 flex flex-col bg-stone-950"
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
            <aside className="flex w-[200px] flex-shrink-0 flex-col border-stone-800 border-r px-3 py-4">
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="mb-4 flex items-center gap-1.5 rounded-md px-2 py-1 text-stone-400 text-xs transition-colors hover:bg-stone-800 hover:text-stone-200"
              >
                <ArrowLeft size={14} />
                <span>Back</span>
              </button>
              <h1 className="mb-4 px-2 font-medium text-lg text-stone-100">Settings</h1>
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
                          ? 'bg-stone-800 text-stone-100'
                          : 'text-stone-500 hover:bg-stone-800/50 hover:text-stone-300'
                      }`}
                    >
                      {activeTab === tab.id && (
                        <motion.div
                          layoutId="settings-sidebar-indicator"
                          className="absolute top-1/2 left-0 h-4 w-0.5 -translate-y-1/2 rounded-r bg-amber-500"
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
                      <span className="block font-medium text-sm text-stone-300">
                        Default Model
                      </span>
                      <p className="mt-0.5 text-stone-500 text-xs">
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
                                ? 'border-stone-500 bg-stone-800 text-stone-100'
                                : 'border-stone-700/50 text-stone-400 hover:border-stone-600 hover:text-stone-300'
                            }`}
                          >
                            {m.label}
                          </button>
                        ))}
                      </div>
                    </section>

                    {/* Default Permission Mode */}
                    <section>
                      <span className="block font-medium text-sm text-stone-300">
                        Default Permission Mode
                      </span>
                      <p className="mt-0.5 text-stone-500 text-xs">
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
                                    ? 'border-amber-700/50 bg-amber-950/20 text-amber-300'
                                    : 'border-stone-500 bg-stone-800 text-stone-100'
                                  : 'border-stone-700/50 text-stone-400 hover:border-stone-600 hover:text-stone-300'
                              }`}
                            >
                              <Icon size={16} className="flex-shrink-0" />
                              <div className="flex-1">
                                <div className="font-medium text-sm">{m.label}</div>
                                <div
                                  className={`text-xs ${isSelected ? (isYolo ? 'text-amber-500/70' : 'text-stone-400') : 'text-stone-500'}`}
                                >
                                  {m.description}
                                </div>
                              </div>
                              <span
                                className={`h-2 w-2 rounded-full ${isSelected ? (isYolo ? 'bg-amber-400' : 'bg-stone-300') : 'bg-transparent'}`}
                              />
                            </button>
                          )
                        })}
                      </div>
                      <div className="mt-3 flex items-start gap-2 rounded-md border border-stone-800 bg-stone-900/50 px-3 py-2">
                        <Info size={13} className="mt-0.5 flex-shrink-0 text-stone-600" />
                        <p className="text-stone-500 text-xs">
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
                    <p className="text-sm text-stone-400">
                      Manage installed Claude Code plugins. Toggle plugins on/off — changes take
                      effect on the next session.
                    </p>

                    {pluginsLoading ? (
                      <div className="mt-8 flex items-center justify-center text-sm text-stone-600">
                        Loading plugins...
                      </div>
                    ) : !pluginData || pluginData.plugins.length === 0 ? (
                      <div className="mt-8 text-center">
                        <p className="text-sm text-stone-500">No plugins installed</p>
                        <p className="mt-1 text-stone-600 text-xs">
                          Install plugins via Claude Code CLI:{' '}
                          <code className="text-stone-400">
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

                {activeTab === 'usage' && <UsageDashboard />}

                {activeTab === 'agents' && (
                  <div className="mt-6 flex flex-1 flex-col">
                    <p className="text-sm text-stone-400">
                      Customize the specialist prompt for each review agent. Each agent reviews the
                      PR diff with its own focus area. The standard review template (PR context,
                      diff, output format) is injected automatically — you only edit the specialist
                      guidance.
                    </p>

                    {/* Horizontal agent tabs */}
                    <div className="mt-4 flex gap-1 border-stone-800 border-b">
                      {agentPrompts.map((agent) => (
                        <button
                          type="button"
                          key={agent.id}
                          onClick={() => setActiveAgent(agent.id)}
                          className={`relative px-3 py-2 text-sm transition-colors ${
                            activeAgent === agent.id
                              ? 'text-stone-100'
                              : 'text-stone-500 hover:text-stone-300'
                          }`}
                        >
                          {agent.name}
                          {agent.isCustom && (
                            <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />
                          )}
                          {activeAgent === agent.id && (
                            <motion.div
                              layoutId="agent-tab-indicator"
                              className="absolute right-0 bottom-0 left-0 h-0.5 bg-amber-500"
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
                              <h3 className="font-medium text-sm text-stone-200">{agent.name}</h3>
                              {agent.isCustom && (
                                <span className="rounded bg-stone-800 px-1.5 py-0.5 text-[10px] text-stone-400">
                                  customized
                                </span>
                              )}
                            </div>
                            {agent.isCustom && (
                              <button
                                type="button"
                                onClick={() => resetAgentPrompt(agent.id)}
                                className="text-[11px] text-stone-500 transition-colors hover:text-stone-300"
                              >
                                Reset to default
                              </button>
                            )}
                          </div>
                          <textarea
                            value={agent.prompt}
                            onChange={(e) => updateAgentPrompt(agent.id, e.target.value)}
                            className="mt-3 min-h-[200px] w-full flex-1 resize-y rounded-md bg-stone-950 px-3 py-2 text-stone-300 text-xs leading-relaxed outline-none ring-1 ring-stone-800 focus:ring-stone-600"
                          />
                        </div>
                      ))}
                  </div>
                )}

                {activeTab === 'integrations' && (
                  <div className="mt-8 space-y-8">
                    <section>
                      <span className="block font-medium text-sm text-stone-300">
                        GitHub CLI (gh)
                      </span>
                      <p className="mt-0.5 text-stone-500 text-xs">
                        Required for PR Review feature
                      </p>

                      <div className="mt-3 space-y-3 rounded-lg border border-stone-800 bg-stone-900/50 p-4">
                        <div className="flex items-center gap-2 text-sm">
                          <span
                            className={`h-2 w-2 rounded-full ${
                              ghStatus?.available && ghStatus?.authenticated
                                ? 'bg-green-500'
                                : ghStatus?.available
                                  ? 'bg-amber-500'
                                  : 'bg-red-500'
                            }`}
                          />
                          <span className="text-stone-300">
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
                          <div className="text-stone-500 text-xs">
                            Path: <code className="text-stone-400">{ghStatus.binaryPath}</code>
                          </div>
                        )}

                        {ghStatus?.error && (
                          <div className="text-red-400 text-xs">{ghStatus.error}</div>
                        )}

                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={ghPath}
                            onChange={(e) => setGhPath(e.target.value)}
                            placeholder="Custom path (e.g. /usr/local/bin/gh)"
                            className="flex-1 rounded bg-stone-950 px-3 py-1.5 text-stone-300 text-xs placeholder-stone-600 outline-none ring-1 ring-stone-800 focus:ring-stone-600"
                          />
                          <button
                            type="button"
                            onClick={updateGhPath}
                            disabled={!ghPath}
                            className="rounded bg-stone-800 px-3 py-1.5 text-stone-300 text-xs hover:bg-stone-700 disabled:opacity-30"
                          >
                            Set
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={recheckGh}
                          disabled={ghChecking}
                          className="rounded bg-stone-800 px-3 py-1.5 text-stone-300 text-xs hover:bg-stone-700 disabled:opacity-50"
                        >
                          {ghChecking ? 'Checking...' : 'Re-check'}
                        </button>
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
