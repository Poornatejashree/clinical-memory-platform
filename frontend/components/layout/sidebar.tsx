'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Users, Bell, BarChart3, Brain, Bot, Mic } from 'lucide-react'
import { cn } from '@/lib/utils'

const nav = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Overview' },
  { href: '/patients', icon: Users, label: 'Patients' },
  { href: '/voice-bot', icon: Bot, label: 'Voice Bot' },
  { href: '/outgoing-voice-bot', icon: Mic, label: 'Outgoing Bot' },
  { href: '/alerts', icon: Bell, label: 'Alerts' },
  { href: '/analytics', icon: BarChart3, label: 'Intelligence' },
]

export function Sidebar() {
  const path = usePathname()
  return (
    <aside className="w-64 border-r border-slate-200/60 bg-white/60 backdrop-blur-xl flex flex-col">
      <div className="px-6 py-6 flex items-center gap-2">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
          <Brain className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="font-medium text-slate-900 text-sm">ShiftBrain</h1>
          <p className="text-xs text-slate-500">Handoff memory agent</p>
        </div>
      </div>
      <nav className="px-3 flex-1">
        {nav.map(n => {
          const active = path.startsWith(n.href)
          return (
            <Link key={n.href} href={n.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors mb-1",
                active ? "bg-blue-50 text-blue-700 font-medium" : "text-slate-600 hover:bg-slate-50"
              )}>
              <n.icon className="w-4 h-4" /> {n.label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
