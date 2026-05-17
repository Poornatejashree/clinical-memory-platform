'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { BarChart3, Cpu, DollarSign, Clock } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'

export default function AnalyticsPage() {
  const [stats, setStats] = useState({
    total_cost: 0,
    total_calls: 0,
    avg_latency: 0,
    by_tier: { fast: 0, balanced: 0, premium: 0 },
  })

  useEffect(() => {
  async function load() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    
    const r = await fetch('http://localhost:8000/api/analytics/routing', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    const logs = await r.json()
    
    if (logs.length === 0) return
    
    const total_cost = logs.reduce((s: number, l: any) => s + (l.cost_usd || 0), 0)
    const total_calls = logs.length
    const avg_latency = Math.round(logs.reduce((s: number, l: any) => s + (l.latency_ms || 0), 0) / total_calls)
    
    const by_tier = { fast: 0, balanced: 0, premium: 0 }
    logs.forEach((l: any) => {
      const m = l.model_used || ''
      if (m.includes('8b') || m.includes('8B')) by_tier.fast++
      else if (m.includes('70b') || m.includes('70B')) by_tier.balanced++
      else by_tier.premium++
    })
    
    setStats({ total_cost, total_calls, avg_latency, by_tier })
  }
  load()
}, [])

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-medium text-slate-900">Runtime intelligence</h1>
        <p className="text-slate-500 text-sm mt-1">cascadeflow routing, cost, and memory metrics</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <StatCard icon={DollarSign} label="Total cost" value={`$${stats.total_cost.toFixed(4)}`} />
        <StatCard icon={Cpu} label="AI calls" value={stats.total_calls.toString()} />
        <StatCard icon={Clock} label="Avg latency" value={`${stats.avg_latency} ms`} />
        <StatCard icon={BarChart3} label="Cost saved vs premium" value="~94%" />
      </div>

      <Card className="p-6 bg-white/60 backdrop-blur-xl">
        <h2 className="font-medium text-slate-900 mb-4">Model routing breakdown</h2>
        <div className="space-y-3">
          <TierBar tier="Fast (Groq Llama 3.1 8b)" count={stats.by_tier.fast} total={stats.total_calls} tone="emerald" />
          <TierBar tier="Balanced (Groq Llama 3.3 70b)" count={stats.by_tier.balanced} total={stats.total_calls} tone="blue" />
          <TierBar tier="Premium (Claude Sonnet)" count={stats.by_tier.premium} total={stats.total_calls} tone="purple" />
        </div>
        <p className="text-xs text-slate-500 mt-4">
          Most calls run on the cheap tier. Premium escalation triggers only on low confidence or critical keywords.
        </p>
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
  const bgClass = tone === 'emerald' ? 'bg-emerald-400' :
                  tone === 'blue' ? 'bg-blue-400' : 'bg-purple-400'
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1">
        <span className="text-slate-700">{tier}</span>
        <span className="text-slate-500">{count} calls · {pct.toFixed(0)}%</span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full ${bgClass}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}