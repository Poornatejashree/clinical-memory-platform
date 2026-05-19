'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { BarChart3, Clock, Cpu, DollarSign } from 'lucide-react'
import { api } from '@/lib/api'

const EMPTY_STATS = {
  total_cost: 0,
  total_calls: 0,
  avg_latency: 0,
  by_tier: { fast: 0, balanced: 0, premium: 0 },
}

export default function AnalyticsPage() {
  const [stats, setStats] = useState(EMPTY_STATS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError('')
      try {
        const logs = await api.get<any[]>('/api/analytics/routing')
        const rows = Array.isArray(logs) ? logs : []
        if (rows.length === 0) {
          setStats(EMPTY_STATS)
          return
        }

        const total_cost = rows.reduce((sum: number, log: any) => sum + Number(log.cost_usd || 0), 0)
        const total_calls = rows.length
        const avg_latency = Math.round(rows.reduce((sum: number, log: any) => sum + Number(log.latency_ms || 0), 0) / total_calls)
        const by_tier = { fast: 0, balanced: 0, premium: 0 }

        rows.forEach((log: any) => {
          const model = String(log.model_used || '').toLowerCase()
          if (model.includes('8b') || model.includes('instant')) by_tier.fast += 1
          else if (model.includes('70b') || model.includes('versatile')) by_tier.balanced += 1
          else by_tier.premium += 1
        })

        setStats({ total_cost, total_calls, avg_latency, by_tier })
      } catch (err: any) {
        setStats(EMPTY_STATS)
        setError(err.message || 'Could not load analytics right now.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-medium text-slate-900">Runtime intelligence</h1>
        <p className="text-slate-500 text-sm mt-1">CascadeFlow routing, cost, and latency from saved backend audit logs.</p>
      </div>

      {error && (
        <Card className="p-4 bg-amber-50/70 border-amber-100">
          <p className="text-sm text-amber-800">{error}</p>
        </Card>
      )}

      {loading && <p className="text-sm text-slate-500">Loading analytics...</p>}

      {!loading && stats.total_calls === 0 && !error && (
        <Card className="p-8 bg-white/60 backdrop-blur-xl text-center">
          <BarChart3 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-700 font-medium">No analytics data yet</p>
          <p className="text-slate-500 text-sm">Submit handoffs or ask patient questions to generate routing logs.</p>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={DollarSign} label="Total cost" value={`$${stats.total_cost.toFixed(4)}`} />
        <StatCard icon={Cpu} label="AI calls" value={stats.total_calls.toString()} />
        <StatCard icon={Clock} label="Avg latency" value={`${stats.avg_latency} ms`} />
        <StatCard icon={BarChart3} label="Est. cost / handoff" value="$0.003" />
      </div>

      <Card className="p-6 bg-white/60 backdrop-blur-xl">
        <h2 className="font-medium text-slate-900 mb-4">Model routing breakdown</h2>
        <div className="space-y-3">
          <TierBar tier="Fast model" count={stats.by_tier.fast} total={stats.total_calls} tone="emerald" />
          <TierBar tier="Reasoning model" count={stats.by_tier.balanced} total={stats.total_calls} tone="blue" />
          <TierBar tier="Deeper analysis model" count={stats.by_tier.premium} total={stats.total_calls} tone="purple" />
        </div>
      </Card>
    </div>
  )
}

function StatCard({ icon: Icon, label, value }: any) {
  return (
    <Card className="p-5 bg-white/60 backdrop-blur-xl">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500 uppercase tracking-wide">{label}</p>
        <Icon className="w-4 h-4 text-slate-400" />
      </div>
      <p className="text-2xl font-medium text-slate-900 mt-2">{value}</p>
    </Card>
  )
}

function TierBar({ tier, count, total, tone }: any) {
  const pct = total > 0 ? (count / total) * 100 : 0
  const bgClass = tone === 'emerald' ? 'bg-emerald-400' : tone === 'blue' ? 'bg-blue-400' : 'bg-purple-400'
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1">
        <span className="text-slate-700">{tier}</span>
        <span className="text-slate-500">{count} calls - {pct.toFixed(0)}%</span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full ${bgClass}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
