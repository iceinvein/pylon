import { useEffect, useState } from 'react'
import { ArrowLeft, ShieldCheck, ShieldAlert, Info } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useUiStore } from '../store/ui-store'
import { UsageDashboard } from './UsageDashboard'
import type { AppSettings } from '../../../shared/types'

const MODELS = [
  { id: 'claude-opus-4-6', label: 'Opus 4.6' },
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
  { id: 'claude-haiku-4-5', label: 'Haiku 4.5' },
] as const

const PERMISSION_MODES = [
  { id: 'default' as const, label: 'Default', icon: ShieldCheck, description: 'Ask before each tool use' },
  { id: 'auto-approve' as const, label: 'YOLO', icon: ShieldAlert, description: 'Auto-approve all tool permissions' },
]

const TABS = [
  { id: 'general', label: 'General' },
  { id: 'usage', label: 'Usage' },
] as const

type SettingsTab = (typeof TABS)[number]['id']

export function SettingsOverlay() {
  const { settingsOpen, setSettingsOpen } = useUiStore()
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [activeTab, setActiveTab] = useState<SettingsTab>('general')

  useEffect(() => {
    if (!settingsOpen) return
    window.api.getSettings().then((s) => setSettings(s as AppSettings))
  }, [settingsOpen])

  // Reset to General tab when overlay closes
  useEffect(() => {
    if (!settingsOpen) setActiveTab('general')
  }, [settingsOpen])

  async function updateSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    await window.api.updateSettings(key, value)
    setSettings((prev) => prev ? { ...prev, [key]: value } : prev)
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

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-3xl px-6 py-4">
              <button
                onClick={() => setSettingsOpen(false)}
                className="mb-6 flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-stone-400 transition-colors hover:bg-stone-800 hover:text-stone-200"
              >
                <ArrowLeft size={14} />
                <span>Back to app</span>
              </button>
              <h1 className="text-lg font-medium text-stone-100">Settings</h1>

              {/* Tab Bar */}
              <div className="mt-4 flex gap-1 border-b border-stone-800">
                {TABS.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`relative px-3 py-2 text-sm transition-colors ${
                      activeTab === tab.id
                        ? 'text-stone-100'
                        : 'text-stone-500 hover:text-stone-300'
                    }`}
                  >
                    {tab.label}
                    {activeTab === tab.id && (
                      <motion.div
                        layoutId="settings-tab-indicator"
                        className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-500"
                        transition={{ duration: 0.2 }}
                      />
                    )}
                  </button>
                ))}
              </div>

              {/* Tab Content */}
              {activeTab === 'general' && settings && (
                <div className="mt-8 space-y-8">
                  {/* Default Model */}
                  <section>
                    <label className="block text-sm font-medium text-stone-300">Default Model</label>
                    <p className="mt-0.5 text-xs text-stone-500">Model used when creating new sessions</p>
                    <div className="mt-3 flex gap-2">
                      {MODELS.map((m) => (
                        <button
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
                    <label className="block text-sm font-medium text-stone-300">Default Permission Mode</label>
                    <p className="mt-0.5 text-xs text-stone-500">Permission behavior for new sessions (can be overridden per-session)</p>
                    <div className="mt-3 space-y-2">
                      {PERMISSION_MODES.map((m) => {
                        const Icon = m.icon
                        const isSelected = settings.defaultPermissionMode === m.id
                        const isYolo = m.id === 'auto-approve'
                        return (
                          <button
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
                              <div className="text-sm font-medium">{m.label}</div>
                              <div className={`text-xs ${isSelected ? (isYolo ? 'text-amber-500/70' : 'text-stone-400') : 'text-stone-500'}`}>
                                {m.description}
                              </div>
                            </div>
                            <span className={`h-2 w-2 rounded-full ${isSelected ? (isYolo ? 'bg-amber-400' : 'bg-stone-300') : 'bg-transparent'}`} />
                          </button>
                        )
                      })}
                    </div>
                    <div className="mt-3 flex items-start gap-2 rounded-md border border-stone-800 bg-stone-900/50 px-3 py-2">
                      <Info size={13} className="mt-0.5 flex-shrink-0 text-stone-600" />
                      <p className="text-xs text-stone-500">
                        YOLO mode auto-approves all tool permissions but still prompts for questions that require your input. You can override the mode per-session from the input bar.
                      </p>
                    </div>
                  </section>
                </div>
              )}

              {activeTab === 'usage' && <UsageDashboard />}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
