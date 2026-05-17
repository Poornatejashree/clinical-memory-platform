'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { motion } from 'framer-motion'

const ROLES = [
  { value: 'senior_doctor', label: 'Senior Doctor' },
  { value: 'incoming_doctor', label: 'Incoming Doctor' },
  { value: 'nurse', label: 'Nurse' },
  { value: 'icu_specialist', label: 'ICU Specialist' },
]

const DEPARTMENTS = [
  { value: 'icu', label: 'ICU' },
  { value: 'emergency', label: 'Emergency Room' },
  { value: 'cardiology', label: 'Cardiology' },
  { value: 'neurology', label: 'Neurology' },
  { value: 'pediatrics', label: 'Pediatrics' },
  { value: 'surgery', label: 'Surgery' },
]

export default function OnboardingPage() {
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState('senior_doctor')
  const [department, setDepartment] = useState('icu')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }
    
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: user.id,
        full_name: fullName,
        role,
        department,
      })
    
    if (profileError) {
      setError(profileError.message)
      setLoading(false)
      return
    }
    
    router.push('/dashboard')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-slate-50 p-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="w-[480px] p-8 bg-white/70 backdrop-blur-xl border-white/40 shadow-xl">
          <h1 className="text-2xl font-medium text-slate-900 mb-1">Welcome</h1>
          <p className="text-sm text-slate-500 mb-6">Tell us your role to personalize your experience</p>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1.5 block">Full name</label>
              <Input
                placeholder="Dr. Jane Smith"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>
            
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1.5 block">Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full h-10 px-3 rounded-md border border-slate-200 bg-white text-sm"
              >
                {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1.5 block">Department</label>
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full h-10 px-3 rounded-md border border-slate-200 bg-white text-sm"
              >
                {DEPARTMENTS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </div>
            
            {error && (
              <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</p>
            )}
            
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Setting up...' : 'Continue to dashboard'}
            </Button>
          </form>
        </Card>
      </motion.div>
    </div>
  )
}