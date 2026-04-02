'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

function joinTeamNames(names: string[]): string {
  if (names.length === 0) return 'your team'
  if (names.length === 1) return names[0]
  return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1]
}

export default function AcceptInviteForm({
  token,
  email,
  role,
  teamNames,
  programName,
  sport,
  inviterName,
}: {
  token: string
  email: string
  role: 'admin' | 'coach'
  teamNames: string[]
  programName: string
  sport: string
  inviterName: string
}) {
  const router = useRouter()

  const [password, setPassword]     = useState('')
  const [firstName, setFirstName]   = useState('')
  const [lastName, setLastName]     = useState('')
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState<string | null>(null)

  const teamList  = joinTeamNames(teamNames)
  const roleLabelMap: Record<string, string> = {
    admin:            'Admin',
    coach:            'Coach',
    volunteer_admin:  'Volunteer Admin',
    meal_coordinator: 'Meal Coordinator',
  }
  const roleLabel = roleLabelMap[role] ?? role

  const inputClass = "w-full rounded-xl border border-white/10 bg-slate-800 px-4 py-3 text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none text-sm"
  const labelClass = "block text-sm font-semibold text-slate-300 mb-2"

  async function handleSubmit() {
    if (!password.trim()) {
      setError('Please enter a password.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/accept-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, email, password, firstName, lastName }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Something went wrong. Please try again.')
        setLoading(false)
        return
      }

      router.push('/dashboard')
    } catch {
      setError('Network error. Please check your connection and try again.')
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">

      {/* Header */}
      <div className="border-b border-white/10 bg-slate-900">
        <div className="mx-auto max-w-lg px-6 py-5">
          <img
            src="/sidelineops-logo-cropped.png"
            alt="SidelineOps"
            style={{ height: '28px', width: 'auto', opacity: 0.7 }}
            className="mb-3"
          />
          <h1 className="text-xl font-bold text-white">{programName}</h1>
          <p className="text-slate-400 text-sm mt-0.5">{sport}</p>
        </div>
      </div>

      <div className="mx-auto max-w-lg px-6 py-8">

        {/* Invite summary */}
        <div className="mb-6 rounded-2xl border border-white/10 bg-slate-900 p-5">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Invitation from {inviterName}</p>
          <h2 className="text-lg font-bold text-white">Join {programName}</h2>
          <p className="text-slate-400 text-sm mt-1">
            You&apos;ve been invited to manage <strong className="text-white">{teamList}</strong> as a{' '}
            <strong className="text-white">{roleLabel}</strong>.
          </p>
        </div>

        <div className="space-y-5">

          {/* Email — read only */}
          <div>
            <label className={labelClass}>Email Address</label>
            <input
              type="email"
              value={email}
              readOnly
              className={`${inputClass} opacity-60 cursor-not-allowed`}
            />
          </div>

          {/* Name fields — only shown for new users (we always collect just in case) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>
                First Name <span className="text-slate-500 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                placeholder="Alex"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>
                Last Name <span className="text-slate-500 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={lastName}
                onChange={e => setLastName(e.target.value)}
                placeholder="Smith"
                className={inputClass}
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label className={labelClass}>
              Password <span className="text-red-400">*</span>
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              className={inputClass}
              autoComplete="new-password"
            />
            <p className="mt-1.5 text-xs text-slate-500">
              If you already have a SidelineOps account, enter your existing password to sign in.
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 px-6 py-3 text-sm font-semibold transition-colors"
          >
            {loading ? 'Setting up your account...' : 'Accept Invitation'}
          </button>

        </div>
      </div>
    </main>
  )
}
