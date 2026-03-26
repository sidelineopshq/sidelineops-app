'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createEvent } from './actions'

const EVENT_TYPES = [
  { value: 'game',       label: 'Game' },
  { value: 'practice',   label: 'Practice' },
  { value: 'scrimmage',  label: 'Scrimmage' },
  { value: 'tournament', label: 'Tournament' },
]

const STATUS_OPTIONS = [
  { value: 'scheduled',   label: 'Scheduled' },
  { value: 'postponed',   label: 'Postponed' },
  { value: 'cancelled',   label: 'Cancelled' },
  { value: 'rescheduled', label: 'Rescheduled' },
]

function Toggle({ enabled, onChange, label, description }: {
  enabled: boolean
  onChange: (v: boolean) => void
  label: string
  description: string
}) {
  return (
    <label className="flex items-center justify-between gap-4 cursor-pointer">
      <div>
        <p className="text-sm font-semibold text-slate-200">{label}</p>
        <p className="text-xs text-slate-500 mt-0.5">{description}</p>
      </div>
      <div className="relative shrink-0">
        <input
          type="checkbox"
          className="sr-only"
          checked={enabled}
          onChange={e => onChange(e.target.checked)}
        />
        <div className={`h-6 w-11 rounded-full transition-colors ${
          enabled ? 'bg-sky-500' : 'bg-slate-600'
        }`} />
        <div className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-transform ${
          enabled ? 'left-6' : 'left-1'
        }`} />
      </div>
    </label>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900 p-5">
      {children}
    </div>
  )
}

type Team = { id: string; name: string }

type TeamTimes = {
  start_time: string
  arrival_time: string
  end_time: string
}

export default function NewEventForm({ teams }: { teams: Team[] }) {
  const router = useRouter()

  const [eventType, setEventType]             = useState('game')
  const [eventDate, setEventDate]             = useState('')
  const [opponent, setOpponent]               = useState('')
  const [isHome, setIsHome]                   = useState(true)
  const [locationName, setLocationName]       = useState('')
  const [locationAddress, setLocationAddress] = useState('')
  const [status, setStatus]                   = useState('scheduled')
  const [notes, setNotes]                     = useState('')
  const [uniformNotes, setUniformNotes]       = useState('')
  const [mealRequired, setMealRequired]       = useState(false)
  const [mealNotes, setMealNotes]             = useState('')
  const [mealTime, setMealTime]               = useState('')
  const [isPublic, setIsPublic]               = useState(true)
  const [tournamentTitle, setTournamentTitle] = useState('')
  const [loading, setLoading]                 = useState(false)
  const [error, setError]                     = useState<string | null>(null)

  // Team assignment — all teams selected by default
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>(teams.map(t => t.id))

  // Per-team times: keyed by team_id
  const [teamTimes, setTeamTimes] = useState<Record<string, TeamTimes>>(() => {
    const init: Record<string, TeamTimes> = {}
    teams.forEach(t => {
      init[t.id] = { start_time: '', arrival_time: '', end_time: '' }
    })
    return init
  })

  const isGameLike   = eventType === 'game' || eventType === 'scrimmage'
  const isTournament = eventType === 'tournament'

  function toggleTeam(teamId: string) {
    setSelectedTeamIds(prev =>
      prev.includes(teamId) ? prev.filter(id => id !== teamId) : [...prev, teamId]
    )
  }

  function updateTeamTime(teamId: string, field: keyof TeamTimes, value: string) {
    setTeamTimes(prev => ({
      ...prev,
      [teamId]: { ...prev[teamId], [field]: value },
    }))
  }

  async function handleSubmit() {
    if (!eventDate)                              { setError('Event date is required.'); return }
    if (isGameLike && !opponent)                 { setError('Opponent is required for games and scrimmages.'); return }
    if (isTournament && !tournamentTitle)        { setError('Tournament name is required.'); return }
    if (selectedTeamIds.length === 0)            { setError('Select at least one team.'); return }

    setLoading(true)
    setError(null)

    const team_assignments = selectedTeamIds.map(teamId => ({
      team_id:      teamId,
      start_time:   teamTimes[teamId]?.start_time   || undefined,
      arrival_time: teamTimes[teamId]?.arrival_time || undefined,
      end_time:     teamTimes[teamId]?.end_time     || undefined,
    }))

    const result = await createEvent({
      event_type:           eventType,
      event_date:           eventDate,
      opponent:             isGameLike ? opponent : undefined,
      is_home:              isGameLike ? isHome : undefined,
      location_name:        locationName || undefined,
      location_address:     locationAddress || undefined,
      status,
      notes:                notes || undefined,
      uniform_notes:        uniformNotes || undefined,
      is_tournament:        isTournament,
      title:                isTournament ? tournamentTitle : undefined,
      meal_required:        mealRequired,
      meal_notes:           mealRequired ? mealNotes : undefined,
      meal_time:            mealRequired && mealTime ? mealTime : undefined,
      is_public:            isPublic,
      team_assignments,
    })

    if (result?.error) {
      setError(result.error)
      setLoading(false)
    }
  }

  const inputClass = "w-full rounded-xl border border-white/10 bg-slate-800 px-4 py-2.5 text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none text-sm"
  const labelClass = "block text-sm font-semibold text-slate-300 mb-2"
  const timeInputClass = "rounded-xl border border-white/10 bg-slate-800 px-4 py-2.5 text-white focus:border-sky-500 focus:outline-none text-sm"

  return (
    <div className="text-white">
      <div className="mx-auto max-w-7xl px-6 py-8">

        <div className="mb-6">
          <button
            onClick={() => router.back()}
            className="text-sm text-slate-400 hover:text-white transition-colors"
          >
            ← Back
          </button>
        </div>

        <div className="mb-8">
          <h1 className="text-2xl font-bold">New Event</h1>
          <p className="text-slate-400 text-sm mt-1">
            Fill in the details below to add an event to your schedule.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">

          {/* ── LEFT: Main form fields ── */}
          <div className="space-y-7">

            {/* Event Type */}
            <div>
              <label className={labelClass}>Event Type</label>
              <div className="flex flex-wrap gap-3">
                {EVENT_TYPES.map(type => (
                  <button
                    key={type.value}
                    type="button"
                    onClick={() => setEventType(type.value)}
                    className={`rounded-xl border px-5 py-2 text-sm font-semibold transition-colors ${
                      eventType === type.value
                        ? 'border-sky-500 bg-sky-500/20 text-sky-300'
                        : 'border-white/10 bg-slate-900 text-slate-300 hover:border-white/30'
                    }`}
                  >
                    {type.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tournament Name */}
            {isTournament && (
              <div>
                <label className={labelClass}>
                  Tournament Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={tournamentTitle}
                  onChange={e => setTournamentTitle(e.target.value)}
                  placeholder="e.g. Madison Invitational"
                  className={inputClass}
                />
                <p className="mt-2 text-xs text-slate-500">
                  Individual games can be added once the tournament schedule is released.
                </p>
              </div>
            )}

            {/* Opponent + Home/Away */}
            {isGameLike && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto]">
                <div>
                  <label className={labelClass}>
                    Opponent <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={opponent}
                    onChange={e => setOpponent(e.target.value)}
                    placeholder="e.g. Bob Jones High School"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Home or Away</label>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setIsHome(true)}
                      className={`rounded-xl border px-5 py-2.5 text-sm font-semibold transition-colors ${
                        isHome
                          ? 'border-green-500 bg-green-500/20 text-green-300'
                          : 'border-white/10 bg-slate-900 text-slate-300 hover:border-white/30'
                      }`}
                    >
                      🏠 Home
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsHome(false)}
                      className={`rounded-xl border px-5 py-2.5 text-sm font-semibold transition-colors ${
                        !isHome
                          ? 'border-amber-500 bg-amber-500/20 text-amber-300'
                          : 'border-white/10 bg-slate-900 text-slate-300 hover:border-white/30'
                      }`}
                    >
                      🚌 Away
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Date */}
            <div>
              <label className={labelClass}>
                Date <span className="text-red-400">*</span>
              </label>
              <input
                type="date"
                value={eventDate}
                onChange={e => setEventDate(e.target.value)}
                className={timeInputClass}
              />
            </div>

            {/* Team Assignment + Per-Team Times */}
            <div>
              <label className={labelClass}>Team Assignment & Times</label>
              <div className="space-y-3">
                {teams.map(team => {
                  const selected = selectedTeamIds.includes(team.id)
                  const times    = teamTimes[team.id]
                  return (
                    <div
                      key={team.id}
                      className={`rounded-xl border p-4 transition-colors ${
                        selected
                          ? 'border-sky-500/40 bg-sky-500/5'
                          : 'border-white/10 bg-slate-900 opacity-60'
                      }`}
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <input
                          type="checkbox"
                          id={`team-${team.id}`}
                          checked={selected}
                          onChange={() => toggleTeam(team.id)}
                          className="h-4 w-4 rounded border-white/20 bg-slate-700 accent-sky-500"
                        />
                        <label
                          htmlFor={`team-${team.id}`}
                          className="text-sm font-semibold text-white cursor-pointer"
                        >
                          {team.name}
                        </label>
                      </div>

                      {selected && (
                        <div className="flex flex-wrap gap-4 pl-7">
                          <div>
                            <p className="text-xs text-slate-400 mb-1.5">Start</p>
                            <input
                              type="time"
                              value={times.start_time}
                              onChange={e => updateTeamTime(team.id, 'start_time', e.target.value)}
                              className={timeInputClass}
                            />
                          </div>
                          <div>
                            <p className="text-xs text-slate-400 mb-1.5">Arrival</p>
                            <input
                              type="time"
                              value={times.arrival_time}
                              onChange={e => updateTeamTime(team.id, 'arrival_time', e.target.value)}
                              className={timeInputClass}
                            />
                          </div>
                          <div>
                            <p className="text-xs text-slate-400 mb-1.5">End</p>
                            <input
                              type="time"
                              value={times.end_time}
                              onChange={e => updateTeamTime(team.id, 'end_time', e.target.value)}
                              className={timeInputClass}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Location */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Location Name</label>
                <input
                  type="text"
                  value={locationName}
                  onChange={e => setLocationName(e.target.value)}
                  placeholder="e.g. JCHS Softball Field"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>
                  Address <span className="text-slate-500 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={locationAddress}
                  onChange={e => setLocationAddress(e.target.value)}
                  placeholder="e.g. 11306 County Line Rd"
                  className={inputClass}
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className={labelClass}>
                Notes <span className="text-slate-500 font-normal">(optional)</span>
              </label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
                placeholder="Any additional notes for this event..."
                className="w-full rounded-xl border border-white/10 bg-slate-800 px-4 py-2.5 text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none resize-none text-sm"
              />
            </div>

          </div>

          {/* ── RIGHT: Settings sidebar ── */}
          <div className="space-y-4">

            <Card>
              <label className={labelClass}>Status</label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-slate-800 px-4 py-2.5 text-white focus:border-sky-500 focus:outline-none text-sm"
                style={{ appearance: 'auto' }}
              >
                {STATUS_OPTIONS.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </Card>

            <Card>
              <label className={labelClass}>
                Uniform Notes{' '}
                <span className="text-slate-500 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={uniformNotes}
                onChange={e => setUniformNotes(e.target.value)}
                placeholder="e.g. White jerseys, navy pants"
                className="w-full rounded-xl border border-white/10 bg-slate-800 px-4 py-2.5 text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none text-sm"
              />
            </Card>

            <Card>
              <Toggle
                enabled={mealRequired}
                onChange={setMealRequired}
                label="Team Meal"
                description="This event includes a team meal"
              />
              {mealRequired && (
                <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
                  <div>
                    <p className="text-xs text-slate-400 mb-1.5">Meal Time</p>
                    <input
                      type="time"
                      value={mealTime}
                      onChange={e => setMealTime(e.target.value)}
                      className={timeInputClass}
                    />
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 mb-1.5">Meal Notes</p>
                    <input
                      type="text"
                      value={mealNotes}
                      onChange={e => setMealNotes(e.target.value)}
                      placeholder="e.g. Chick-fil-A, parents provide"
                      className="w-full rounded-xl border border-white/10 bg-slate-800 px-4 py-2.5 text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none text-sm"
                    />
                  </div>
                </div>
              )}
            </Card>

            <Card>
              <Toggle
                enabled={isPublic}
                onChange={setIsPublic}
                label="Public Schedule"
                description="Show this event on your public team page"
              />
              <p className={`mt-3 text-xs font-medium ${isPublic ? 'text-green-400' : 'text-slate-500'}`}>
                {isPublic ? '✓ Visible to parents and fans' : '✗ Hidden from public schedule'}
              </p>
            </Card>

            {error && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading}
                className="flex-1 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 px-6 py-3 text-sm font-semibold transition-colors"
              >
                {loading ? 'Saving...' : 'Save Event'}
              </button>
              <button
                type="button"
                onClick={() => router.back()}
                disabled={loading}
                className="rounded-xl border border-white/10 hover:bg-slate-800 disabled:opacity-50 px-5 py-3 text-sm font-semibold transition-colors"
              >
                Cancel
              </button>
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}
