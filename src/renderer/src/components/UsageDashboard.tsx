import { useEffect, useState } from 'react'
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from 'recharts'
import { TrendingUp, Hash, DollarSign, Zap } from 'lucide-react'
import { formatCost, formatTokens, timeAgo } from '../lib/utils'
import type { UsageStats, UsagePeriod } from '../../../shared/types'

const PERIODS: Array<{ id: UsagePeriod; label: string }> = [
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: '90d', label: '90 days' },
  { id: 'all', label: 'All time' },
]

const MODEL_COLORS: Record<string, string> = {
  'claude-opus-4-6': '#d97706',
  'claude-sonnet-4-6': '#78716c',
  'claude-haiku-4-5': '#a8a29e',
}

const MODEL_LABELS: Record<string, string> = {
  'claude-opus-4-6': 'Opus 4.6',
  'claude-sonnet-4-6': 'Sonnet 4.6',
  'claude-haiku-4-5': 'Haiku 4.5',
}

function formatDay(day: string): string {
  const d = new Date(day + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function UsageDashboard() {
  const [period, setPeriod] = useState<UsagePeriod>('30d')
  const [stats, setStats] = useState<UsageStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    window.api.getUsageStats(period).then((data) => {
      setStats(data)
      setLoading(false)
    })
  }, [period])

  if (loading || !stats) {
    return (
      <div className="mt-12 flex items-center justify-center text-sm text-stone-500">
        Loading usage data...
      </div>
    )
  }

  const { summary, dailyCosts, costByModel, tokensByDay, topSessions } = stats

  return (
    <div className="mt-6 space-y-8 pb-12">
      {/* Period Selector */}
      <div className="flex gap-1.5">
        {PERIODS.map((p) => (
          <button
            key={p.id}
            onClick={() => setPeriod(p.id)}
            className={`rounded-md px-3 py-1.5 text-xs transition-colors ${
              period === p.id
                ? 'bg-stone-800 text-stone-100'
                : 'text-stone-500 hover:bg-stone-900 hover:text-stone-300'
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
        <SummaryCard icon={TrendingUp} label="Avg / Session" value={formatCost(summary.avgCostPerSession)} />
        <SummaryCard icon={Zap} label="Total Tokens" value={`${formatTokens(summary.totalInput)} in / ${formatTokens(summary.totalOutput)} out`} />
      </div>

      {/* Cost Over Time */}
      {dailyCosts.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-medium text-stone-300">Cost Over Time</h3>
          <div className="rounded-lg border border-stone-800 bg-stone-900/50 p-4">
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={dailyCosts}>
                <defs>
                  <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#d97706" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#d97706" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#292524" />
                <XAxis dataKey="day" tickFormatter={formatDay} tick={{ fill: '#78716c', fontSize: 11 }} axisLine={{ stroke: '#44403c' }} tickLine={false} />
                <YAxis tickFormatter={(v: number) => '$' + v.toFixed(2)} tick={{ fill: '#78716c', fontSize: 11 }} axisLine={false} tickLine={false} width={60} />
                <Tooltip contentStyle={{ backgroundColor: '#1c1917', border: '1px solid #44403c', borderRadius: '8px', fontSize: '12px', color: '#e7e5e4' }} formatter={(value) => [formatCost(Number(value)), 'Cost']} labelFormatter={(label) => formatDay(String(label))} />
                <Area type="monotone" dataKey="cost" stroke="#d97706" strokeWidth={2} fill="url(#costGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* Side-by-side: Cost by Model + Token Breakdown */}
      <div className="grid grid-cols-2 gap-4">
        {costByModel.length > 0 && (
          <section>
            <h3 className="mb-3 text-sm font-medium text-stone-300">Cost by Model</h3>
            <div className="rounded-lg border border-stone-800 bg-stone-900/50 p-4">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={costByModel} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#292524" horizontal={false} />
                  <XAxis type="number" tickFormatter={(v: number) => '$' + v.toFixed(2)} tick={{ fill: '#78716c', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="model" tickFormatter={(v: string) => MODEL_LABELS[v] ?? v} tick={{ fill: '#a8a29e', fontSize: 12 }} axisLine={false} tickLine={false} width={80} />
                  <Tooltip contentStyle={{ backgroundColor: '#1c1917', border: '1px solid #44403c', borderRadius: '8px', fontSize: '12px', color: '#e7e5e4' }} formatter={(value) => [formatCost(Number(value)), 'Cost']} labelFormatter={(label) => MODEL_LABELS[String(label)] ?? String(label)} />
                  <Bar dataKey="cost" radius={[0, 4, 4, 0]}>
                    {costByModel.map((entry) => (
                      <Cell key={entry.model} fill={MODEL_COLORS[entry.model] ?? '#78716c'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        )}

        {tokensByDay.length > 0 && (
          <section>
            <h3 className="mb-3 text-sm font-medium text-stone-300">Tokens by Day</h3>
            <div className="rounded-lg border border-stone-800 bg-stone-900/50 p-4">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={tokensByDay}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#292524" />
                  <XAxis dataKey="day" tickFormatter={formatDay} tick={{ fill: '#78716c', fontSize: 11 }} axisLine={{ stroke: '#44403c' }} tickLine={false} />
                  <YAxis tickFormatter={(v: number) => formatTokens(v)} tick={{ fill: '#78716c', fontSize: 11 }} axisLine={false} tickLine={false} width={50} />
                  <Tooltip contentStyle={{ backgroundColor: '#1c1917', border: '1px solid #44403c', borderRadius: '8px', fontSize: '12px', color: '#e7e5e4' }} formatter={(value) => [formatTokens(Number(value)), '']} labelFormatter={(label) => formatDay(String(label))} />
                  <Bar dataKey="input" stackId="tokens" fill="#78716c" name="Input" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="output" stackId="tokens" fill="#d97706" name="Output" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        )}
      </div>

      {/* Top Sessions Table */}
      {topSessions.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-medium text-stone-300">Most Expensive Sessions</h3>
          <div className="rounded-lg border border-stone-800 bg-stone-900/50 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-stone-800 text-stone-500">
                  <th className="px-4 py-2.5 text-left font-medium">Session</th>
                  <th className="px-4 py-2.5 text-left font-medium">Model</th>
                  <th className="px-4 py-2.5 text-right font-medium">Tokens</th>
                  <th className="px-4 py-2.5 text-right font-medium">Cost</th>
                  <th className="px-4 py-2.5 text-right font-medium">When</th>
                </tr>
              </thead>
              <tbody>
                {topSessions.map((s) => (
                  <tr key={s.id} className="border-b border-stone-800/50 text-stone-300 last:border-0">
                    <td className="max-w-[200px] truncate px-4 py-2.5">{s.title || 'Untitled'}</td>
                    <td className="px-4 py-2.5 text-stone-400">{MODEL_LABELS[s.model] ?? s.model}</td>
                    <td className="px-4 py-2.5 text-right text-stone-400">{formatTokens(s.inputTokens + s.outputTokens)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-amber-400/80">{formatCost(s.cost)}</td>
                    <td className="px-4 py-2.5 text-right text-stone-500">{timeAgo(s.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Empty State */}
      {summary.sessionCount === 0 && (
        <div className="mt-8 text-center text-sm text-stone-500">
          No usage data yet. Start a session to see analytics here.
        </div>
      )}
    </div>
  )
}

function SummaryCard({ icon: Icon, label, value }: { icon: typeof DollarSign; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-stone-800 bg-stone-900/50 px-4 py-3">
      <div className="flex items-center gap-1.5 text-stone-500">
        <Icon size={12} />
        <span className="text-xs">{label}</span>
      </div>
      <div className="mt-1 text-sm font-medium text-stone-200">{value}</div>
    </div>
  )
}
