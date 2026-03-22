'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Player = {
  id: string
  first_name: string
  last_name: string
  jersey_number: string | null
}

export default function SignupForm({
  token,
  teamId,
  teamName,
  programName,
  sport,
  seasonYear,
  schoolName,
  players,
}: {
  token: string
  teamId: string
  teamName: string
  programName: string
  sport: string
  seasonYear: string | number
  schoolName: string
  players: Player[]
}) {
  const router = useRouter()

  const [playerId, setPlayerId]           = useState('')
  const [playerNameManual, setPlayerNameManual] = useState('')
  const [parentFirstName, setParentFirstName]   = useState('')
  const [parentLastName, setParentLastName]     = useState('')
  const [phone, setPhone]                 = useState('')
  const [email, setEmail]                 = useState('')
  const [smsConsent, setSmsConsent]       = useState(false)
  const [loading, setLoading]             = useState(false)
  const [error, setError]                 = useState<string | null>(null)

  const playerNotListed = playerId === 'not_listed'

  const inputClass = "w-full rounded-xl border border-white/10 bg-slate-800 px-4 py-3 text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none text-sm"
  const labelClass = "block text-sm font-semibold text-slate-300 mb-2"

  function formatPhone(val: string) {
    // Strip non-digits and format as (xxx) xxx-xxxx
    const digits = val.replace(/\D/g, '').slice(0, 10)
    if (digits.length <= 3) return digits
    if (digits.length <= 6) return `(${digits.slice(0,3)}) ${digits.slice(3)}`
    return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`
  }

  async function handleSubmit() {
    // Validation
    if (!playerId) {
      setError('Please select your player from the list.')
      return
    }
    if (playerNotListed && !playerNameManual.trim()) {
      setError('Please enter your player\'s name.')
      return
    }
    if (!parentFirstName.trim() || !parentLastName.trim()) {
      setError('Please enter your full name.')
      return
    }
    const digits = phone.replace(/\D/g, '')
    if (digits.length !== 10) {
      setError('Please enter a valid 10-digit phone number.')
      return
    }
    if (!smsConsent) {
      setError('You must agree to receive SMS messages to sign up.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/team/${teamId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          player_id:          playerNotListed ? null : playerId,
          player_name_manual: playerNotListed ? playerNameManual : null,
          parent_first_name:  parentFirstName.trim(),
          parent_last_name:   parentLastName.trim(),
          phone:              digits,
          email:              email.trim() || null,
          sms_consent:        smsConsent,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Something went wrong. Please try again.')
        setLoading(false)
        return
      }

      router.push(`/join/${token}/confirmed`)
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
          <p className="text-slate-400 text-sm mt-0.5">
            {teamName} · {sport} · {seasonYear} Season
          </p>
          {schoolName && (
            <p className="text-slate-500 text-xs mt-0.5">{schoolName}</p>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-lg px-6 py-8">

        <div className="mb-6">
          <h2 className="text-lg font-bold">Parent / Guardian Sign Up</h2>
          <p className="text-slate-400 text-sm mt-1">
            Sign up to receive schedule updates and team notifications.
          </p>
        </div>

        <div className="space-y-5">

          {/* Player selection */}
          <div>
            <label className={labelClass}>
              Select Your Player <span className="text-red-400">*</span>
            </label>
            <select
              value={playerId}
              onChange={e => setPlayerId(e.target.value)}
              className={inputClass}
              style={{ appearance: 'auto' }}
            >
              <option value="">— Select a player —</option>
              {players.map(p => (
                <option key={p.id} value={p.id}>
                  {p.last_name}, {p.first_name}
                  {p.jersey_number ? ` (#${p.jersey_number})` : ''}
                </option>
              ))}
              <option value="not_listed">My player isn't listed</option>
            </select>
          </div>

          {/* Manual player name entry */}
          {playerNotListed && (
            <div>
              <label className={labelClass}>
                Player's Full Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={playerNameManual}
                onChange={e => setPlayerNameManual(e.target.value)}
                placeholder="e.g. Sarah Johnson"
                className={inputClass}
              />
              <p className="mt-1.5 text-xs text-slate-500">
                Your coach will link you to the roster manually.
              </p>
            </div>
          )}

          {/* Parent name */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>
                Your First Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={parentFirstName}
                onChange={e => setParentFirstName(e.target.value)}
                placeholder="e.g. Jennifer"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>
                Your Last Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={parentLastName}
                onChange={e => setParentLastName(e.target.value)}
                placeholder="e.g. Johnson"
                className={inputClass}
              />
            </div>
          </div>

          {/* Phone */}
          <div>
            <label className={labelClass}>
              Mobile Phone <span className="text-red-400">*</span>
            </label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(formatPhone(e.target.value))}
              placeholder="(256) 555-1234"
              className={inputClass}
              inputMode="numeric"
            />
          </div>

          {/* Email */}
          <div>
            <label className={labelClass}>
              Email Address{' '}
              <span className="text-slate-500 font-normal">(optional)</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="jennifer@email.com"
              className={inputClass}
            />
          </div>

          {/* SMS Consent — required */}
          <div className="rounded-2xl border border-white/10 bg-slate-900 p-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={smsConsent}
                onChange={e => setSmsConsent(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-white/20 accent-sky-500"
              />
              <div>
                <p className="text-sm font-semibold text-white">
                  I agree to receive SMS messages <span className="text-red-400">*</span>
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  By checking this box, I consent to receive text messages from{' '}
                  {programName} via SidelineOps regarding schedules, updates, and
                  team communications. Message and data rates may apply.
                  Reply STOP to unsubscribe at any time.
                </p>
              </div>
            </label>
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
            {loading ? 'Signing up...' : 'Sign Up'}
          </button>

          <p className="text-xs text-slate-600 text-center">
            Your information is only shared with your team's coaching staff.
            It will never be sold or shared with third parties.
          </p>

        </div>
      </div>
    </main>
  )
}