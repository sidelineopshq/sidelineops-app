'use client'

import { useState, useTransition } from 'react'
import { publicSignup } from './actions'

function formatTime(time: string | null): string {
  if (!time) return ''
  const [hourStr, minuteStr] = time.split(':')
  const hour = parseInt(hourStr)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const hour12 = hour % 12 || 12
  return `${hour12}:${minuteStr} ${ampm}`
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })
}

type SuccessData = {
  eventDate:    string
  eventLabel:   string
  roleName:     string
  startTime:    string | null
  locationName: string | null
}

function SuccessView({ name, data }: { name: string; data: SuccessData }) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-green-500/30 bg-green-500/10 p-6 text-center">
        <p className="text-2xl font-bold text-green-400 mb-1">You're signed up!</p>
        <p className="text-sm text-slate-300 mt-1">See you on {formatDate(data.eventDate)}.</p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-slate-900 p-5 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-slate-400">Name</span>
          <span className="text-white font-semibold">{name}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-slate-400">Role</span>
          <span className="text-white font-semibold">{data.roleName}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-slate-400">Event</span>
          <span className="text-white font-semibold">{data.eventLabel}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-slate-400">Date</span>
          <span className="text-white font-semibold">{formatDate(data.eventDate)}</span>
        </div>
        {data.startTime && (
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">Time</span>
            <span className="text-white font-semibold">{formatTime(data.startTime)}</span>
          </div>
        )}
        {data.locationName && (
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">Location</span>
            <span className="text-white font-semibold">{data.locationName}</span>
          </div>
        )}
      </div>

      <p className="text-center text-xs text-slate-500">A confirmation email has been sent to you.</p>
    </div>
  )
}

export default function SignupForm({ token }: { token: string }) {
  const [name, setName]           = useState('')
  const [email, setEmail]         = useState('')
  const [error, setError]         = useState<string | null>(null)
  const [success, setSuccess]     = useState<SuccessData | null>(null)
  const [isPending, startTransition] = useTransition()

  if (success) {
    return <SuccessView name={name} data={success} />
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await publicSignup(token, {
        volunteer_name:  name,
        volunteer_email: email,
      })
      if (result?.error) {
        setError(result.error)
      } else if (result?.success) {
        setSuccess({
          eventDate:    result.eventDate,
          eventLabel:   result.eventLabel,
          roleName:     result.roleName,
          startTime:    result.startTime ?? null,
          locationName: result.locationName ?? null,
        })
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs font-semibold text-slate-400 mb-1">
          Name <span className="text-red-400">*</span>
        </label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Jane Smith"
          required
          autoFocus
          className="w-full rounded-xl border border-white/10 bg-slate-800 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-400 mb-1">
          Email <span className="text-red-400">*</span>
        </label>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="jane@example.com"
          required
          className="w-full rounded-xl border border-white/10 bg-slate-800 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none"
        />
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 px-4 py-3 text-sm font-semibold transition-colors"
      >
        {isPending ? 'Signing up...' : 'Sign Me Up!'}
      </button>
    </form>
  )
}
