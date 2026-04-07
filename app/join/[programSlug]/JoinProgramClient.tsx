'use client'

import { useState, useMemo } from 'react'
import { joinProgram } from './actions'

type Player = {
  id:            string
  first_name:    string
  last_name:     string
  jersey_number: string | null
  team_id:       string
  team_level:    string
}

// ── Phone masking ─────────────────────────────────────────────

function maskPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 10)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

// ── Step indicator ────────────────────────────────────────────

function StepDots({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-2 justify-center mb-8">
      {[1, 2, 3].map(n => (
        <div
          key={n}
          className={`h-2 rounded-full transition-all ${
            n === step ? 'w-6 bg-sky-500' : n < step ? 'w-2 bg-sky-700' : 'w-2 bg-slate-700'
          }`}
        />
      ))}
    </div>
  )
}

// ── Player card ───────────────────────────────────────────────

function PlayerCard({
  player,
  selected,
  onSelect,
}: {
  player:   Player
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left rounded-xl border px-4 py-3 transition-colors flex items-center justify-between gap-3 ${
        selected
          ? 'border-sky-500 bg-sky-500/15'
          : 'border-white/10 bg-slate-800 hover:border-white/30'
      }`}
    >
      <div>
        <p className="text-sm font-semibold text-white">
          {player.first_name} {player.last_name}
          {player.jersey_number ? (
            <span className="ml-2 text-slate-400 font-normal">#{player.jersey_number}</span>
          ) : null}
        </p>
        {player.team_level && (
          <p className="text-xs text-slate-400 mt-0.5">{player.team_level}</p>
        )}
      </div>
      {selected && (
        <span className="shrink-0 text-sky-400 text-lg">✓</span>
      )}
    </button>
  )
}

// ── Main component ────────────────────────────────────────────

export default function JoinProgramClient({
  programId,
  programName,
  sport,
  schoolName,
  firstTeamSlug,
  brandPrimary,
  players,
}: {
  programId:     string
  programName:   string
  sport:         string
  schoolName:    string
  firstTeamSlug: string | null
  brandPrimary:  string | null
  players:       Player[]
}) {
  const [step, setStep]               = useState<1 | 2 | 3>(1)
  const [selectedPlayer, setPlayer]   = useState<Player | null>(null)
  const [search, setSearch]           = useState('')
  const [firstName, setFirstName]     = useState('')
  const [lastName, setLastName]       = useState('')
  const [phone, setPhone]             = useState('')
  const [email, setEmail]             = useState('')
  const [smsConsent, setSmsConsent]   = useState(false)
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [done, setDone]               = useState(false)

  const accent = brandPrimary ?? '#0284c7'

  const filteredPlayers = useMemo(() => {
    if (!search.trim()) return players
    const q = search.toLowerCase()
    return players.filter(p =>
      `${p.first_name} ${p.last_name}`.toLowerCase().includes(q) ||
      (p.jersey_number ?? '').includes(q)
    )
  }, [players, search])

  // Format phone on input
  function handlePhoneChange(raw: string) {
    setPhone(maskPhone(raw))
  }

  // ── Step 1: Find your player ────────────────────────────────

  function goToStep2() { setStep(2) }

  // ── Step 2: Contact info ────────────────────────────────────

  function validateStep2(): string | null {
    if (!firstName.trim()) return 'First name is required.'
    if (!lastName.trim())  return 'Last name is required.'
    const digits = phone.replace(/\D/g, '')
    if (digits.length !== 10) return 'Please enter a valid 10-digit phone number.'
    return null
  }

  function goToStep3() {
    const err = validateStep2()
    if (err) { setError(err); return }
    setError(null)
    setStep(3)
  }

  // ── Step 3: Submit ──────────────────────────────────────────

  async function handleSubmit() {
    setLoading(true)
    setError(null)
    const result = await joinProgram({
      programId,
      firstName,
      lastName,
      phone,
      email,
      smsConsent,
      playerId:     selectedPlayer?.id ?? null,
      playerName:   selectedPlayer ? `${selectedPlayer.first_name} ${selectedPlayer.last_name}` : null,
      playerLevel:  selectedPlayer?.team_level ?? null,
      schoolName,
      sportName:    sport,
      programName,
      firstTeamSlug,
    })
    setLoading(false)
    if (result.error) {
      setError(result.error)
    } else {
      setDone(true)
    }
  }

  const inputClass = 'w-full rounded-xl border border-white/10 bg-slate-800 px-4 py-3 text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none text-sm'

  // ── Success screen ──────────────────────────────────────────

  if (done) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center px-6">
        <div className="w-full max-w-sm text-center">
          <p className="text-5xl mb-4">🎉</p>
          <h1 className="text-2xl font-bold text-white mb-3">You're all set!</h1>
          {selectedPlayer ? (
            <p className="text-slate-400 text-sm mb-6 leading-relaxed">
              Schedule updates for{' '}
              <strong className="text-white">
                {selectedPlayer.first_name} {selectedPlayer.last_name}
              </strong>
              {selectedPlayer.team_level ? ` (${selectedPlayer.team_level})` : ''}{' '}
              will be sent to your {email ? 'phone and email' : 'phone'}.
            </p>
          ) : (
            <p className="text-slate-400 text-sm mb-6 leading-relaxed">
              You're signed up! Your coach will connect you to your player's team shortly.
            </p>
          )}
          {firstTeamSlug && (
            <a
              href={`/schedule/${firstTeamSlug}`}
              className="inline-block rounded-xl px-6 py-3 text-sm font-semibold text-white transition-colors"
              style={{ background: accent }}
            >
              View Schedule
            </a>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <div className="border-b border-white/10 bg-slate-900/80">
        <div className="mx-auto max-w-lg px-6 py-4 flex items-center gap-3">
          <img
            src="/sidelineops-logo-cropped.png"
            alt="SidelineOps"
            style={{ height: '22px', width: 'auto', opacity: 0.75 }}
          />
        </div>
      </div>

      <div className="mx-auto max-w-lg px-6 py-10">
        {/* Program title */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold">{programName}</h1>
          <p className="text-sm text-slate-400 mt-1">
            Sign up to receive schedule updates and notifications for your player
          </p>
        </div>

        <StepDots step={step} />

        {/* ── STEP 1: Find your player ── */}
        {step === 1 && (
          <div>
            <h2 className="text-lg font-bold mb-1">Is your child on the team?</h2>
            <p className="text-sm text-slate-400 mb-5">
              Search for your player to link them to your contact.
            </p>

            {players.length > 0 && (
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by player name..."
                className={`${inputClass} mb-4`}
              />
            )}

            {players.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-slate-900 px-4 py-6 text-center mb-4">
                <p className="text-sm text-slate-400">No players found for this program.</p>
              </div>
            ) : filteredPlayers.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-slate-900 px-4 py-4 text-center mb-4">
                <p className="text-sm text-slate-500">No players match your search.</p>
              </div>
            ) : (
              <div className="space-y-2 mb-4 max-h-72 overflow-y-auto pr-0.5">
                {filteredPlayers.map(p => (
                  <PlayerCard
                    key={p.id}
                    player={p}
                    selected={selectedPlayer?.id === p.id}
                    onSelect={() => setPlayer(prev => prev?.id === p.id ? null : p)}
                  />
                ))}
              </div>
            )}

            <div className="space-y-3 mt-6">
              <button
                type="button"
                onClick={goToStep2}
                disabled={!selectedPlayer}
                className="w-full rounded-xl py-3 text-sm font-semibold transition-colors disabled:opacity-40"
                style={{ background: accent }}
              >
                Continue with {selectedPlayer
                  ? `${selectedPlayer.first_name} ${selectedPlayer.last_name}`
                  : 'selected player'}
              </button>
              <button
                type="button"
                onClick={goToStep2}
                className="w-full rounded-xl border border-white/10 bg-transparent py-3 text-sm font-medium text-slate-400 hover:text-white hover:border-white/30 transition-colors"
              >
                Skip — I'm signing up without a player
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 2: Contact info ── */}
        {step === 2 && (
          <div>
            <h2 className="text-lg font-bold mb-1">Your contact information</h2>
            {selectedPlayer ? (
              <p className="text-sm text-slate-400 mb-5">
                Signing up as a contact for{' '}
                <span className="text-white font-medium">
                  {selectedPlayer.first_name} {selectedPlayer.last_name}
                </span>
                {selectedPlayer.team_level ? ` — ${selectedPlayer.team_level}` : ''}
              </p>
            ) : (
              <p className="text-sm text-slate-400 mb-5">
                Enter your information below.
              </p>
            )}

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                    First Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={e => setFirstName(e.target.value)}
                    autoComplete="given-name"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                    Last Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={e => setLastName(e.target.value)}
                    autoComplete="family-name"
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                  Phone <span className="text-red-400">*</span>
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => handlePhoneChange(e.target.value)}
                  placeholder="(555) 555-5555"
                  autoComplete="tel"
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                  Email <span className="text-slate-500 font-normal">(recommended)</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  autoComplete="email"
                  className={inputClass}
                />
                <p className="text-xs text-slate-600 mt-1">
                  For email notifications and weekly schedule updates
                </p>
              </div>

              {/* SMS consent — shown but disabled until SMS is live */}
              <div className="rounded-xl border border-white/10 bg-slate-900 px-4 py-3">
                <label className="flex items-center justify-between gap-4 cursor-not-allowed opacity-60">
                  <div>
                    <p className="text-sm font-semibold text-slate-300">
                      Receive text message notifications
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">SMS notifications coming soon</p>
                  </div>
                  <div className="relative shrink-0">
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={smsConsent}
                      disabled
                      onChange={e => setSmsConsent(e.target.checked)}
                    />
                    <div className="h-6 w-11 rounded-full bg-slate-600" />
                    <div className="absolute top-1 left-1 h-4 w-4 rounded-full bg-white shadow" />
                  </div>
                </label>
              </div>
            </div>

            {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

            <div className="space-y-3 mt-6">
              <button
                type="button"
                onClick={goToStep3}
                className="w-full rounded-xl py-3 text-sm font-semibold transition-colors"
                style={{ background: accent }}
              >
                Review & Confirm
              </button>
              <button
                type="button"
                onClick={() => { setStep(1); setError(null) }}
                className="w-full rounded-xl border border-white/10 py-3 text-sm font-medium text-slate-400 hover:text-white hover:border-white/30 transition-colors"
              >
                Back
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: Confirm ── */}
        {step === 3 && (
          <div>
            <h2 className="text-lg font-bold mb-1">Confirm your sign-up</h2>
            <p className="text-sm text-slate-400 mb-5">
              Review your information before completing.
            </p>

            {/* Summary card */}
            <div className="rounded-xl border border-white/10 bg-slate-900 px-5 py-4 space-y-2.5 mb-6">
              {selectedPlayer && (
                <div className="flex gap-3">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide w-24 shrink-0 pt-0.5">Player</span>
                  <span className="text-sm text-slate-200">
                    {selectedPlayer.first_name} {selectedPlayer.last_name}
                    {selectedPlayer.team_level ? ` — ${selectedPlayer.team_level}` : ''}
                  </span>
                </div>
              )}
              <div className="flex gap-3">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide w-24 shrink-0 pt-0.5">Your Name</span>
                <span className="text-sm text-slate-200">{firstName} {lastName}</span>
              </div>
              <div className="flex gap-3">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide w-24 shrink-0 pt-0.5">Phone</span>
                <span className="text-sm text-slate-200">{phone}</span>
              </div>
              {email && (
                <div className="flex gap-3">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide w-24 shrink-0 pt-0.5">Email</span>
                  <span className="text-sm text-slate-200 break-all">{email}</span>
                </div>
              )}
              <div className="flex gap-3">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide w-24 shrink-0 pt-0.5">Notifications</span>
                <span className="text-sm text-slate-200">
                  {email ? 'Email' : 'Schedule updates only'}
                </span>
              </div>
            </div>

            {/* What you'll receive */}
            <div className="rounded-xl border border-white/10 bg-slate-900/60 px-5 py-4 mb-6">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
                You'll receive
              </p>
              <ul className="space-y-1.5">
                {[
                  'Game schedule updates',
                  'Change alerts for cancellations and time changes',
                  'Weekly schedule digest (Sundays)',
                  'Volunteer opportunity notifications',
                ].map(item => (
                  <li key={item} className="flex items-start gap-2 text-sm text-slate-300">
                    <span className="text-sky-400 mt-0.5 shrink-0">•</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {error && <p className="mb-3 text-xs text-red-400">{error}</p>}

            <div className="space-y-3">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading}
                className="w-full rounded-xl py-3 text-sm font-semibold disabled:opacity-50 transition-colors"
                style={{ background: accent }}
              >
                {loading ? 'Signing up...' : 'Complete Sign-Up'}
              </button>
              <button
                type="button"
                onClick={() => { setStep(2); setError(null) }}
                disabled={loading}
                className="w-full rounded-xl border border-white/10 py-3 text-sm font-medium text-slate-400 hover:text-white hover:border-white/30 transition-colors"
              >
                Back
              </button>
            </div>

            <p className="text-xs text-slate-600 text-center mt-4 leading-relaxed">
              By signing up you agree to receive schedule notifications for {programName}.
              You can unsubscribe at any time.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
