'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createEvent } from './actions'
import {
  VolunteerSlotsSection,
  type VolunteerRole,
  type VolunteerSlot,
} from '../VolunteerSlotsSection'

type TemplateSlot = {
  id:                string
  volunteer_role_id: string
  role_name:         string
  slot_count:        number
  start_time:        string | null
  end_time:          string | null
  notes:             string | null
}

function formatTime(time: string | null): string {
  if (!time) return ''
  const [h, m] = time.split(':')
  const hour = parseInt(h)
  return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`
}

function slotLabel(roleName: string, startTime: string | null, endTime: string | null): string {
  if (!startTime && !endTime) return roleName
  const parts = [startTime && formatTime(startTime), endTime && formatTime(endTime)].filter(Boolean)
  return `${roleName} (${parts.join(' – ')})`
}

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

export default function NewEventForm({
  teams,
  volunteerRoles,
  templateSlots,
}: {
  teams:           Team[]
  volunteerRoles:  VolunteerRole[]
  templateSlots:   TemplateSlot[]
}) {
  const router = useRouter()

  const [eventType, setEventType]             = useState('game')
  const [eventDate, setEventDate]             = useState(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }))
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
  const [volunteerSlots, setVolunteerSlots]   = useState<VolunteerSlot[]>([])

  // Template prompt state: 'idle' | 'prompt' | 'preview' | 'dismissed'
  const [templateState,   setTemplateState]   = useState<'idle' | 'prompt' | 'preview' | 'dismissed'>('idle')
  const [tplChecked,      setTplChecked]      = useState<boolean[]>([])
  // Editable copies of template slots for the preview (keyed by index)
  const [tplEdits,        setTplEdits]        = useState<VolunteerSlot[]>([])

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

  function handleSetIsHome(val: boolean) {
    setIsHome(val)
    if (val && templateSlots.length > 0) {
      // Only show prompt if not already interacted with
      if (templateState === 'idle') {
        setTemplateState('prompt')
      }
    } else if (!val) {
      // Toggled OFF — clear any applied template state
      setTemplateState('idle')
      setVolunteerSlots([])
      setTplChecked([])
      setTplEdits([])
    }
  }

  function handleApplyTemplate() {
    const edits: VolunteerSlot[] = templateSlots.map(ts => ({
      volunteer_role_id: ts.volunteer_role_id,
      slot_count:        ts.slot_count,
      start_time: ts.start_time ?? '',
      end_time:   ts.end_time   ?? '',
      notes:      ts.notes      ?? '',
    }))
    setTplEdits(edits)
    setTplChecked(templateSlots.map(() => true))
    setTemplateState('preview')
  }

  function handleConfirmTemplate() {
    const confirmed = tplEdits.filter((_, i) => tplChecked[i])
    setVolunteerSlots(confirmed)
    setTemplateState('dismissed')
  }

  function toggleTeam(teamId: string) {
    setSelectedTeamIds(prev =>
      prev.includes(teamId) ? prev.filter(id => id !== teamId) : [...prev, teamId]
    )
  }

  function updateTeamTime(teamId: string, field: keyof TeamTimes, value: string) {
    setTeamTimes(prev => {
      const updated: Record<string, TeamTimes> = {
        ...prev,
        [teamId]: { ...prev[teamId], [field]: value },
      }
      // Auto-populate secondary teams for practice events
      if (eventType === 'practice' && teamId === teams[0]?.id) {
        for (const team of teams.slice(1)) {
          if (selectedTeamIds.includes(team.id)) {
            updated[team.id] = { ...updated[team.id], [field]: value }
          }
        }
      }
      return updated
    })
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
      volunteer_slots:      (isGameLike && isHome) ? volunteerSlots : [],
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
                      onClick={() => handleSetIsHome(true)}
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
                      onClick={() => handleSetIsHome(false)}
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
                        <div className="pl-7">
                          <div className="flex flex-wrap gap-4">
                            <div>
                              <p className="text-xs text-slate-400 mb-1.5">Start</p>
                              <input
                                type="time"
                                step="300"
                                value={times.start_time}
                                onChange={e => updateTeamTime(team.id, 'start_time', e.target.value)}
                                className={timeInputClass}
                              />
                            </div>
                            <div>
                              <p className="text-xs text-slate-400 mb-1.5">Arrival</p>
                              <input
                                type="time"
                                step="300"
                                value={times.arrival_time}
                                onChange={e => updateTeamTime(team.id, 'arrival_time', e.target.value)}
                                className={timeInputClass}
                              />
                            </div>
                            <div>
                              <p className="text-xs text-slate-400 mb-1.5">End</p>
                              <input
                                type="time"
                                step="300"
                                value={times.end_time}
                                onChange={e => updateTeamTime(team.id, 'end_time', e.target.value)}
                                className={timeInputClass}
                              />
                            </div>
                          </div>
                          {eventType === 'practice' && team.id === teams[0]?.id && teams.length > 1 && (
                            <p className="mt-1.5 text-xs text-slate-600">
                              Other team times will follow these values
                            </p>
                          )}
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
                  placeholder="e.g. Memorial Field"
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

            {/* Volunteer Slots — home games only */}
            {isGameLike && (
              <div>
                <label className={labelClass}>Volunteer Slots</label>
                {!isHome ? (
                  <p className="text-sm text-slate-500">
                    Volunteer slots are only available for home games.
                  </p>
                ) : (
                  <div className="space-y-3">

                    {/* ── Template prompt banner ── */}
                    {templateState === 'prompt' && (
                      <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-4">
                        <p className="text-sm font-semibold text-sky-300 mb-1">
                          📋 You have a volunteer template set up.
                        </p>
                        <p className="text-sm text-slate-300 mb-3">
                          Apply your standard volunteer slots to this game?
                        </p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={handleApplyTemplate}
                            className="rounded-xl bg-sky-600 hover:bg-sky-500 px-4 py-2 text-xs font-semibold transition-colors"
                          >
                            Apply Template
                          </button>
                          <button
                            type="button"
                            onClick={() => setTemplateState('dismissed')}
                            className="rounded-xl border border-white/10 hover:bg-white/5 px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
                          >
                            Skip
                          </button>
                        </div>
                      </div>
                    )}

                    {/* ── Template preview with checkboxes ── */}
                    {templateState === 'preview' && (
                      <div className="rounded-xl border border-white/10 bg-slate-900/80 overflow-hidden">
                        <div className="px-4 py-3 border-b border-white/10">
                          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                            Select slots to apply
                          </p>
                        </div>
                        <div className="divide-y divide-white/5">
                          {templateSlots.map((ts, i) => (
                            <div key={ts.id} className="flex items-start gap-3 px-4 py-3">
                              <input
                                type="checkbox"
                                id={`tpl-${i}`}
                                checked={tplChecked[i] ?? true}
                                onChange={e => {
                                  const next = [...tplChecked]
                                  next[i] = e.target.checked
                                  setTplChecked(next)
                                }}
                                className="mt-0.5 h-4 w-4 rounded border-white/20 bg-slate-700 accent-sky-500"
                              />
                              <label htmlFor={`tpl-${i}`} className="flex-1 cursor-pointer">
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                                  <span className={`text-sm font-medium ${tplChecked[i] !== false ? 'text-white' : 'text-slate-500'}`}>
                                    {slotLabel(ts.role_name, ts.start_time, ts.end_time)}
                                  </span>
                                  <span className="text-xs text-slate-400">
                                    {tplEdits[i]?.slot_count ?? ts.slot_count}{' '}
                                    {(tplEdits[i]?.slot_count ?? ts.slot_count) === 1 ? 'volunteer' : 'volunteers'}
                                  </span>
                                </div>
                                {ts.notes && (
                                  <p className="text-xs text-slate-500 mt-0.5">{ts.notes}</p>
                                )}
                              </label>
                            </div>
                          ))}
                        </div>
                        <div className="px-4 py-3 border-t border-white/10 flex gap-2">
                          <button
                            type="button"
                            onClick={handleConfirmTemplate}
                            disabled={!tplChecked.some(Boolean)}
                            className="rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-40 px-4 py-2 text-xs font-semibold transition-colors"
                          >
                            Confirm Selected Slots
                          </button>
                          <button
                            type="button"
                            onClick={() => { setTemplateState('dismissed'); setVolunteerSlots([]) }}
                            className="rounded-xl border border-white/10 hover:bg-white/5 px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
                          >
                            Skip
                          </button>
                        </div>
                      </div>
                    )}

                    {/* ── Slot section (shown after template dismissed/applied, or when no template) ── */}
                    {(templateState === 'dismissed' || templateSlots.length === 0) && (
                      <VolunteerSlotsSection
                        roles={volunteerRoles}
                        slots={volunteerSlots}
                        onChange={setVolunteerSlots}
                      />
                    )}

                  </div>
                )}
              </div>
            )}

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
                      step="300"
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
