import { DollarSign, FolderOpen, Hash, TrendingUp, Zap } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { UsagePeriod, UsageStats } from '../../../shared/types'
import { formatCost, formatTokens, timeAgo } from '../lib/utils'

const PERIODS: Array<{ id: UsagePeriod; label: string }> = [
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: '90d', label: '90 days' },
  { id: 'all', label: 'All time' },
]

const CHART_COLORS = {
  primary: '#c06540',
  primaryGlow: '#c0654040',
  muted: '#a49a8d',
  faint: '#948a7e',
  grid: '#3d3630',
  axisLine: '#4d443a',
  tooltipBg: '#1a1714',
  tooltipBorder: '#4d443a',
  tooltipText: '#ede6dc',
  warning: '#d4a854',
} as const

const MODEL_COLORS: Record<string, string> = {
  'claude-opus-4-6': CHART_COLORS.primary,
  'claude-sonnet-4-6': CHART_COLORS.muted,
  'claude-haiku-4-5': CHART_COLORS.faint,
}

const MODEL_LABELS: Record<string, string> = {
  'claude-opus-4-6': 'Opus 4.6',
  'claude-sonnet-4-6': 'Sonnet 4.6',
  'claude-haiku-4-5': 'Haiku 4.5',
}

function projectName(fullPath: string): string {
  const parts = fullPath.replace(/\/$/, '').split('/')
  return parts[parts.length - 1] || fullPath
}

function formatDay(day: string): string {
  const d = new Date(`${day}T00:00:00`)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function UsageDashboard() {
  const [period, setPeriod] = useState<UsagePeriod>('30d')
  const [stats, setStats] = useState<UsageStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)
    window.api
      .getUsageStats(period)
      .then((data) => {
        if (!cancelled) {
          setStats(data)
          setLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(true)
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [period])

  if (error) {
    return (
      <div className="mt-12 flex items-center justify-center text-error text-sm">
        Failed to load usage data. Try closing and reopening Settings.
      </div>
    )
  }

  if (loading || !stats) {
    return (
      <div className="mt-12 flex items-center justify-center text-base-text-muted text-sm">
        Loading usage data...
      </div>
    )
  }

  const { summary, dailyCosts, costByModel, costByProject = [], tokensByDay, topSessions } = stats

  return (
    <div className="mt-6 space-y-8 pb-12">
      {/* Period Selector */}
      <div className="flex gap-1.5">
        {PERIODS.map((p) => (
          <button
            type="button"
            key={p.id}
            onClick={() => setPeriod(p.id)}
            className={`rounded-md px-3 py-1.5 text-xs transition-colors ${
              period === p.id
                ? 'bg-base-raised text-base-text'
                : 'text-base-text-muted hover:bg-base-surface hover:text-base-text'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-3">
        <SummaryCard icon={DollarSign} label="Total Spent" value={formatCost(summary.totalCost)} />
        <SummaryCard icon={Hash} label="Sessions" value={String(summary.sessionCount)} />
        <SummaryCard
          icon={TrendingUp}
          label="Avg / Session"
          value={formatCost(summary.avgCostPerSession)}
        />
        <SummaryCard
          icon={Zap}
          label="Total Tokens"
          value={`${formatTokens(summary.totalInput)} in / ${formatTokens(summary.totalOutput)} out`}
        />
      </div>

      {/* Cost Over Time */}
      {dailyCosts.length > 0 && (
        <section>
          <h3 className="mb-3 font-medium text-base-text text-sm">Cost Over Time</h3>
          <div className="rounded-lg border border-base-border-subtle bg-base-surface/50 p-4">
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={dailyCosts}>
                <defs>
                  <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHART_COLORS.primary} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={CHART_COLORS.primary} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
                <XAxis
                  dataKey="day"
                  tickFormatter={formatDay}
                  tick={{ fill: CHART_COLORS.muted, fontSize: 11 }}
                  axisLine={{ stroke: CHART_COLORS.axisLine }}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v: number) => `$${v.toFixed(2)}`}
                  tick={{ fill: CHART_COLORS.muted, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={60}
                />
                <Tooltip
                  cursor={{ stroke: CHART_COLORS.muted, strokeWidth: 1 }}
                  wrapperStyle={{ outline: 'none' }}
                  contentStyle={{
                    backgroundColor: CHART_COLORS.tooltipBg,
                    border: `1px solid ${CHART_COLORS.tooltipBorder}`,
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: CHART_COLORS.tooltipText,
                  }}
                  formatter={(value) => [formatCost(Number(value)), 'Cost']}
                  labelFormatter={(label) => formatDay(String(label))}
                />
                <Area
                  type="monotone"
                  dataKey="cost"
                  stroke={CHART_COLORS.primary}
                  strokeWidth={2}
                  fill="url(#costGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* Side-by-side: Cost by Model + Token Breakdown */}
      <div className="grid grid-cols-2 gap-4">
        {costByModel.length > 0 && (
          <section>
            <h3 className="mb-3 font-medium text-base-text text-sm">Cost by Model</h3>
            <div className="rounded-lg border border-base-border-subtle bg-base-surface/50 p-4">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={costByModel} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} horizontal={false} />
                  <XAxis
                    type="number"
                    tickFormatter={(v: number) => `$${v.toFixed(2)}`}
                    tick={{ fill: CHART_COLORS.muted, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="model"
                    tickFormatter={(v: string) => MODEL_LABELS[v] ?? v}
                    tick={{ fill: CHART_COLORS.faint, fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                    width={80}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                    wrapperStyle={{ outline: 'none' }}
                    contentStyle={{
                      backgroundColor: CHART_COLORS.tooltipBg,
                      border: `1px solid ${CHART_COLORS.tooltipBorder}`,
                      borderRadius: '8px',
                      fontSize: '12px',
                      color: CHART_COLORS.tooltipText,
                    }}
                    itemStyle={{ color: CHART_COLORS.primary }}
                    formatter={(value) => [formatCost(Number(value)), 'Cost']}
                    labelFormatter={(label) => MODEL_LABELS[String(label)] ?? String(label)}
                  />
                  <Bar dataKey="cost" radius={[0, 4, 4, 0]}>
                    {costByModel.map((entry) => (
                      <Cell key={entry.model} fill={MODEL_COLORS[entry.model] ?? CHART_COLORS.muted} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        )}

        {tokensByDay.length > 0 && (
          <section>
            <h3 className="mb-3 font-medium text-base-text text-sm">Tokens by Day</h3>
            <div className="rounded-lg border border-base-border-subtle bg-base-surface/50 p-4">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={tokensByDay}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
                  <XAxis
                    dataKey="day"
                    tickFormatter={formatDay}
                    tick={{ fill: CHART_COLORS.muted, fontSize: 11 }}
                    axisLine={{ stroke: CHART_COLORS.axisLine }}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(v: number) => formatTokens(v)}
                    tick={{ fill: CHART_COLORS.muted, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={50}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                    wrapperStyle={{ outline: 'none' }}
                    contentStyle={{
                      backgroundColor: CHART_COLORS.tooltipBg,
                      border: `1px solid ${CHART_COLORS.tooltipBorder}`,
                      borderRadius: '8px',
                      fontSize: '12px',
                      color: CHART_COLORS.tooltipText,
                    }}
                    formatter={(value) => [formatTokens(Number(value)), '']}
                    labelFormatter={(label) => formatDay(String(label))}
                  />
                  <Bar
                    dataKey="input"
                    stackId="tokens"
                    fill={CHART_COLORS.muted}
                    name="Input"
                    radius={[0, 0, 0, 0]}
                  />
                  <Bar
                    dataKey="output"
                    stackId="tokens"
                    fill={CHART_COLORS.primary}
                    name="Output"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        )}
      </div>

      {/* Cost by Project */}
      {costByProject.length > 0 && (
        <section>
          <h3 className="mb-3 font-medium text-base-text text-sm">Cost by Project</h3>
          <div className="overflow-hidden rounded-lg border border-base-border-subtle bg-base-surface/50">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-base-border-subtle border-b text-base-text-muted">
                  <th className="px-4 py-2.5 text-left font-medium">Project</th>
                  <th className="px-4 py-2.5 text-right font-medium">Sessions</th>
                  <th className="px-4 py-2.5 text-right font-medium">Tokens</th>
                  <th className="px-4 py-2.5 text-right font-medium">Cost</th>
                </tr>
              </thead>
              <tbody>
                {costByProject.map((p) => (
                  <tr
                    key={p.project}
                    className="border-base-border-subtle/50 border-b text-base-text last:border-0"
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <FolderOpen size={12} className="shrink-0 text-base-text-muted" />
                        <div className="min-w-0">
                          <div className="truncate font-medium">{projectName(p.project)}</div>
                          <div className="truncate text-[10px] text-base-text-faint">
                            {p.project}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right text-base-text-secondary">
                      {p.sessions}
                    </td>
                    <td className="px-4 py-2.5 text-right text-base-text-secondary">
                      {formatTokens(p.inputTokens + p.outputTokens)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-warning/80">
                      {formatCost(p.cost)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Top Sessions Table */}
      {topSessions.length > 0 && (
        <section>
          <h3 className="mb-3 font-medium text-base-text text-sm">Most Expensive Sessions</h3>
          <div className="overflow-hidden rounded-lg border border-base-border-subtle bg-base-surface/50">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-base-border-subtle border-b text-base-text-muted">
                  <th className="px-4 py-2.5 text-left font-medium">Session</th>
                  <th className="px-4 py-2.5 text-left font-medium">Model</th>
                  <th className="px-4 py-2.5 text-right font-medium">Tokens</th>
                  <th className="px-4 py-2.5 text-right font-medium">Cost</th>
                  <th className="px-4 py-2.5 text-right font-medium">When</th>
                </tr>
              </thead>
              <tbody>
                {topSessions.map((s) => (
                  <tr
                    key={s.id}
                    className="border-base-border-subtle/50 border-b text-base-text last:border-0"
                  >
                    <td className="max-w-50 truncate px-4 py-2.5">{s.title || 'Untitled'}</td>
                    <td className="px-4 py-2.5 text-base-text-secondary">
                      {MODEL_LABELS[s.model] ?? s.model}
                    </td>
                    <td className="px-4 py-2.5 text-right text-base-text-secondary">
                      {formatTokens(s.inputTokens + s.outputTokens)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-warning/80">
                      {formatCost(s.cost)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-base-text-muted">
                      {timeAgo(s.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Empty State */}
      {summary.sessionCount === 0 && (
        <div className="mt-8 text-center text-base-text-muted text-sm">
          No usage data yet. Start a session to see analytics here.
        </div>
      )}
    </div>
  )
}

function SummaryCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof DollarSign
  label: string
  value: string
}) {
  return (
    <div className="rounded-lg border border-base-border-subtle bg-base-surface/50 px-4 py-3">
      <div className="flex items-center gap-1.5 text-base-text-muted">
        <Icon size={12} />
        <span className="text-xs">{label}</span>
      </div>
      <div className="mt-1 font-medium text-base-text text-sm">{value}</div>
    </div>
  )
}
