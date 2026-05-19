'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Plus, Users } from 'lucide-react'

export default function PatientsPage() {
  const [patients, setPatients] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    name: '',
    age: '',
    bed: '',
    diagnosis: '',
    current_status: '',
    assigned_doctor: '',
  })

  async function load() {
    try {
      const data = await api.get<any[]>('/api/patients/')
      setPatients(data || [])
    } catch (err: any) {
      setError(err.message || 'Could not load patients.')
      setPatients([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function addPatient(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const data = await api.post<any>('/api/patients/', {
        ...form,
        age: form.age ? Number(form.age) : null,
      })
      setPatients((prev) => [data, ...prev])
      setForm({ name: '', age: '', bed: '', diagnosis: '', current_status: '', assigned_doctor: '' })
      setOpen(false)
    } catch (err: any) {
      const message = err.message === 'Failed to fetch'
        ? 'Could not reach the backend. Confirm FastAPI is running on NEXT_PUBLIC_API_URL, usually http://localhost:8000.'
        : err.message
      setError(message || 'Could not add patient.')
    } finally {
      setSaving(false)
    }
  }

  function stabilityPill(score: number) {
    const tone = score >= 80 ? 'bg-emerald-50 text-emerald-700' :
                 score >= 60 ? 'bg-amber-50 text-amber-700' :
                 'bg-red-50 text-red-700'
    return <span className={`px-2 py-1 rounded-md text-xs font-medium ${tone}`}>Stability {score}</span>
  }

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-medium text-slate-900">Patients on shift</h1>
          <p className="text-slate-500 text-sm mt-1">Add real patients, then record handoffs linked to each profile.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" /> Add Patient</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add patient</DialogTitle>
            </DialogHeader>
            <form onSubmit={addPatient} className="space-y-3">
              <Input required placeholder="Patient name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <div className="grid grid-cols-2 gap-3">
                <Input placeholder="Age" type="number" value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} />
                <Input required placeholder="Room / bed" value={form.bed} onChange={(e) => setForm({ ...form, bed: e.target.value })} />
              </div>
              <Textarea required placeholder="Condition / diagnosis" value={form.diagnosis} onChange={(e) => setForm({ ...form, diagnosis: e.target.value })} />
              <Input placeholder="Current status, e.g. stable, guarded, critical" value={form.current_status} onChange={(e) => setForm({ ...form, current_status: e.target.value })} />
              <Input placeholder="Assigned doctor" value={form.assigned_doctor} onChange={(e) => setForm({ ...form, assigned_doctor: e.target.value })} />
              {error && <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</p>}
              <Button type="submit" disabled={saving} className="w-full">{saving ? 'Saving...' : 'Save patient'}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {loading && <p className="text-sm text-slate-500">Loading...</p>}

      {!loading && patients.length === 0 && (
        <Card className="p-8 bg-white/60 backdrop-blur-xl flex flex-col items-center justify-center">
          <Users className="w-10 h-10 text-slate-400 mb-3" />
          <p className="text-slate-700 font-medium">No patients yet</p>
          <p className="text-slate-500 text-sm">Use Add Patient to create your first real patient.</p>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {patients.map((patient) => (
          <Link key={patient.id} href={`/patients/${patient.id}`}>
            <Card className="p-5 bg-white/60 backdrop-blur-xl hover:bg-white/80 transition-colors cursor-pointer">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium text-slate-900">{patient.name}</p>
                  <p className="text-sm text-slate-500 mt-0.5">
                    MRN {patient.mrn} - Bed {patient.bed} - Age {patient.age || 'n/a'}
                  </p>
                  <p className="text-sm text-slate-600 mt-2">{patient.diagnosis}</p>
                </div>
                {stabilityPill(patient.stability_score || 0)}
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
