'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateEvent, deleteEvent } from './actions'
import {
  VolunteerSlotsSection,
  type VolunteerRole,
  type VolunteerSlot,
} from '../../VolunteerSlotsSection'

const EVENT_TYPES = [
  { value: 'game',       label: 'Game' },
  { value: 'practice',   label: 'Practice' },
  { value: 'scrimmage',  label: 'Scrimmage' },
  { value: 'tournament', label: 'Tournament' },
]

const GLOBAL_STATUS_OPTIONS = [
  { value: 'scheduled',   label: 'Scheduled',   color: 'text-green-400' },
  { value: 'postponed',   label: 'Postponed',   color: 'text-yellow-400' },
  { value: 'rescheduled', label: 'Rescheduled', color: 'text-orange-400' },
  { value: 'completed',   label: 'Completed',   color: 'text-slate-400' },
  { value: 'cancelled',   label: 'Cancelled (all teams)', color: 'text-red-400' },
]

function statusColor(status: string) {
  const map: Record<string, string> = {
    scheduled:   'border-green-500/40 bg-green-500/10 text-green-300',
    postponed:   'border-yellow-500/40 bg-yellow-500/10 text-yellow-300',
    cancelled:   'border-red-500/40 bg-red-500/10 text-red-300',
    rescheduled: 'border-orange-500/40 bg-orange-500/10 text-orange-300',
    completed:   'border-slate-500/40 bg-slate-500/10 text-slate-300',
  }
  return map[status] ?? 'border-white/10 bg-slate-800 text-slate-300'
}

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
type TeamDetail = {
  team_id: string
  start_time: string | null
  arrival_time: string | null
  end_time: string | null
  status: string
}
type TeamAssignment = {
  team_id: string
  start_time: string
  arrival_time: string
  end_time: string
  status: string    // 'scheduled' | 'cancelled'
  assigned: boolean // true = has/will have an event_team_details row
}

export default function EditEventForm({
  event,
  teams,
  allTeamDetails,
  volunteerRoles,
  existingSlots,
}: {
  event:          any
  teams:          Team[]
  allTeamDetails: TeamDetail[]
  volunteerRoles: VolunteerRole[]
  existingSlots:  VolunteerSlot[]
}) {
  const router = useRouter()

  const [eventType, setEventType]             = useState(event.event_type ?? 'game')
  const [eventDate, setEventDate]             = useState(event.event_date ?? '')
  const [opponent, setOpponent]               = useState(event.opponent ?? '')
  const [isHome, setIsHome]                   = useState(event.is_home ?? true)
  const [locationName, setLocationName]       = useState(event.location_name ?? '')
  const [locationAddress, setLocationAddress] = useState(event.location_address ?? '')
  const [status, setStatus]                   = useState(event.status ?? 'scheduled')
  const [notes, setNotes]                     = useState(event.notes ?? '')
  const [uniformNotes, setUniformNotes]       = useState(event.uniform_notes ?? '')
  const [mealRequired, setMealRequired]       = useState(event.meal_required ?? false)
  const [mealNotes, setMealNotes]             = useState(event.meal_notes ?? '')
  const [mealTime, setMealTime]               = useState(event.meal_time ?? '')
  const [isPublic, setIsPublic]               = useState(event.is_public ?? true)
  const [tournamentTitle, setTournamentTitle] = useState(event.title ?? '')

  const [loading, setLoading]               = useState(false)
  const [deleteConfirm, setDeleteConfirm]   = useState(false)
  const [error, setError]                   = useState<string | null>(null)
  const [volunteerSlots, setVolunteerSlots] = useState<VolunteerSlot[]>(existingSlots)

  // Build initial team assignments from existing data
  const [teamAssignments, setTeamAssignments] = useState<TeamAssignment[]>(() =>
    teams.map(team => {
      const existing = allTeamDetails.find(d => d.team_id === team.id)
      return {
        team_id:      team.id,
        start_time:   existing?.start_time   ?? event.default_start_time   ?? '',
        arrival_time: existing?.arrival_time ?? event.default_arrival_time ?? '',
        end_time:     existing?.end_time     ?? event.default_end_time     ?? '',
        status:       existing?.status ?? 'scheduled',
        assigned:     !!existing,
      }
    })
  )

  const isGameLike   = eventType === 'game' || eventType === 'scrimmage'
  const isTournament = eventType === 'tournament'

  function updateAssignment(teamId: string, field: keyof TeamAssignment, value: string | boolean) {
    setTeamAssignments(prev => prev.map(a =>
      a.team_id === teamId ? { ...a, [field]: value } : a
    ))
  }

  function toggleTeamStatus(teamId: string) {
    setTeamAssignments(prev => prev.map(a =>
      a.team_id === teamId
        ? { ...a, status: a.status === 'cancelled' ? 'scheduled' : 'cancelled' }
        : a
    ))
  }

  async function handleSave() {
    if (!eventDate)                     { setError('Event date is required.'); return }
    if (isGameLike && !opponent)        { setError('Opponent is required for games and scrimmages.'); return }
    if (isTournament && !tournamentTitle) { setError('Tournament name is required.'); return }
    if (!teamAssignments.some(a => a.assigned)) { setError('This event must be assigned to at least one team.'); return }

    setLoading(true)
    setError(null)

    const result = await updateEvent(
      event.id,
      {
        event_type:     eventType,
        event_date:     eventDate,
        opponent:       isGameLike ? opponent : undefined,
        is_home:        isGameLike ? isHome : undefined,
        location_name:  locationName || undefined,
        location_address: locationAddress || undefined,
        status,
        notes:          notes || undefined,
        uniform_notes:  uniformNotes || undefined,
        is_tournament:  isTournament,
        title:          isTournament ? tournamentTitle : undefined,
        meal_required:  mealRequired,
        meal_notes:     mealRequired ? mealNotes : undefined,
        meal_time:      mealRequired && mealTime ? mealTime : undefined,
        is_public:      isPublic,
      },
      teamAssignments.filter(a => a.assigned).map(a => ({
        team_id:      a.team_id,
        start_time:   a.start_time   || undefined,
        arrival_time: a.arrival_time || undefined,
        end_time:     a.end_time     || undefined,
        status:       a.status,
      })),
      isGameLike ? volunteerSlots : undefined
    )

    if (result?.error) {
      setError(result.error)
      setLoading(false)
    }
  }

  async function handleDelete() {
    setLoading(true)
    // Use the first assigned team's id for the permission check
    const firstTeamId = teamAssignments.find(a => a.assigned)?.team_id ?? teams[0]?.id
    const result = await deleteEvent(event.id, firstTeamId)
    if (result?.error) {
      setError(result.error)
      setLoading(false)
      setDeleteConfirm(false)
    }
  }

  const inputClass   = "w-full rounded-xl border border-white/10 bg-slate-800 px-4 py-2.5 text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none text-sm"
  const labelClass   = "block text-sm font-semibold text-slate-300 mb-2"
  const timeInputCls = "rounded-xl border border-white/10 bg-slate-800 px-4 py-2.5 text-white focus:border-sky-500 focus:outline-none text-sm"

  return (
    <div className="text-white">

      {/* Delete confirm dialog */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
            <h3 className="text-base font-bold mb-2">Delete this event?</h3>
            <p className="text-sm text-slate-400 mb-5">
              This will permanently delete the event for all teams and cannot be undone.
              If you want to keep a record, cancel it per-team in the Team Assignments section instead.
            </p>
            <div className="flex gap-3">
              <button onClick={handleDelete} disabled={loading}
                className="flex-1 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 px-4 py-2.5 text-sm font-semibold transition-colors">
                {loading ? 'Deleting...' : 'Yes, Delete'}
              </button>
              <button onClick={() => setDeleteConfirm(false)} disabled={loading}
                className="flex-1 rounded-xl border border-white/10 hover:bg-slate-800 disabled:opacity-50 px-4 py-2.5 text-sm font-semibold transition-colors">
                Go Back
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-7xl px-6 py-8">

        <div className="mb-6">
          <button onClick={() => router.back()}
            className="text-sm text-slate-400 hover:text-white transition-colors">
            ← Back
          </button>
        </div>

        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Edit Event</h1>
            <p className="text-slate-400 text-sm mt-1">Update the details for this event.</p>
          </div>
          <div className={`rounded-xl border px-4 py-2 text-sm font-bold ${statusColor(status)}`}>
            {GLOBAL_STATUS_OPTIONS.find(s => s.value === status)?.label ?? status}
          </div>
        </div>

        {/* Global event status */}
        <div className="mb-8 rounded-2xl border border-white/10 bg-slate-900 p-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">
            Event Status
          </p>
          <p className="text-xs text-slate-600 mb-3">
            To cancel for one team only, use the Team Assignments section below.
          </p>
          <div className="flex flex-wrap gap-2">
            {GLOBAL_STATUS_OPTIONS.map(s => (
              <button key={s.value} type="button" onClick={() => setStatus(s.value)}
                className={`rounded-xl border px-4 py-2 text-sm font-semibold transition-colors ${
                  status === s.value
                    ? statusColor(s.value)
                    : 'border-white/10 bg-slate-800 text-slate-400 hover:text-white'
                }`}>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">

          {/* ── LEFT ── */}
          <div className="space-y-7">

            {/* Event Type */}
            <div>
              <label className={labelClass}>Event Type</label>
              <div className="flex flex-wrap gap-3">
                {EVENT_TYPES.map(type => (
                  <button key={type.value} type="button" onClick={() => setEventType(type.value)}
                    className={`rounded-xl border px-5 py-2 text-sm font-semibold transition-colors ${
                      eventType === type.value
                        ? 'border-sky-500 bg-sky-500/20 text-sky-300'
                        : 'border-white/10 bg-slate-900 text-slate-300 hover:border-white/30'
                    }`}>
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
                <input type="text" value={tournamentTitle}
                  onChange={e => setTournamentTitle(e.target.value)}
                  placeholder="e.g. Madison Invitational" className={inputClass} />
              </div>
            )}

            {/* Opponent + Home/Away */}
            {isGameLike && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto]">
                <div>
                  <label className={labelClass}>
                    Opponent <span className="text-red-400">*</span>
                  </label>
                  <input type="text" value={opponent}
                    onChange={e => setOpponent(e.target.value)}
                    placeholder="e.g. Bob Jones High School" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Home or Away</label>
                  <div className="flex gap-3">
                    <button type="button" onClick={() => setIsHome(true)}
                      className={`rounded-xl border px-5 py-2.5 text-sm font-semibold transition-colors ${
                        isHome
                          ? 'border-green-500 bg-green-500/20 text-green-300'
                          : 'border-white/10 bg-slate-900 text-slate-300 hover:border-white/30'
                      }`}>
                      🏠 Home
                    </button>
                    <button type="button" onClick={() => setIsHome(false)}
                      className={`rounded-xl border px-5 py-2.5 text-sm font-semibold transition-colors ${
                        !isHome
                          ? 'border-amber-500 bg-amber-500/20 text-amber-300'
                          : 'border-white/10 bg-slate-900 text-slate-300 hover:border-white/30'
                      }`}>
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
              <input type="date" value={eventDate}
                onChange={e => setEventDate(e.target.value)}
                className={timeInputCls} />
            </div>

            {/* Team Assignments — per-team times + status */}
            <div>
              <label className={labelClass}>Team Assignments</label>
              <div className="space-y-3">
                {teamAssignments.map(assignment => {
                  const team     = teams.find(t => t.id === assignment.team_id)
                  const isCancelled = assignment.status === 'cancelled'
                  return (
                    <div key={assignment.team_id}
                      className={`rounded-xl border p-4 transition-colors ${
                        !assignment.assigned
                          ? 'border-white/10 bg-slate-900/50 opacity-70'
                          : isCancelled
                            ? 'border-red-500/30 bg-red-500/5'
                            : 'border-sky-500/30 bg-sky-500/5'
                      }`}>

                      {/* Team header row */}
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            id={`team-${assignment.team_id}`}
                            checked={assignment.assigned}
                            onChange={e => updateAssignment(assignment.team_id, 'assigned', e.target.checked)}
                            className="h-4 w-4 rounded border-white/20 bg-slate-700 accent-sky-500"
                          />
                          <label htmlFor={`team-${assignment.team_id}`}
                            className="text-sm font-semibold text-white cursor-pointer">
                            {team?.name}
                          </label>
                        </div>

                        {/* Per-team cancel toggle — only visible when assigned */}
                        {assignment.assigned && (
                          <button
                            type="button"
                            onClick={() => toggleTeamStatus(assignment.team_id)}
                            className={`rounded-lg border px-3 py-1 text-xs font-semibold transition-colors ${
                              isCancelled
                                ? 'border-red-500/40 bg-red-500/20 text-red-300 hover:bg-red-500/30'
                                : 'border-white/10 bg-slate-800 text-slate-400 hover:text-red-300 hover:border-red-500/30'
                            }`}
                          >
                            {isCancelled ? '✕ Cancelled — Restore' : 'Cancel for this team'}
                          </button>
                        )}
                      </div>

                      {/* Per-team times — only visible when assigned and not cancelled */}
                      {assignment.assigned && !isCancelled && (
                        <div className="flex flex-wrap gap-4 pl-7">
                          <div>
                            <p className="text-xs text-slate-400 mb-1.5">Start</p>
                            <input type="time" value={assignment.start_time}
                              onChange={e => updateAssignment(assignment.team_id, 'start_time', e.target.value)}
                              className={timeInputCls} />
                          </div>
                          <div>
                            <p className="text-xs text-slate-400 mb-1.5">Arrival</p>
                            <input type="time" value={assignment.arrival_time}
                              onChange={e => updateAssignment(assignment.team_id, 'arrival_time', e.target.value)}
                              className={timeInputCls} />
                          </div>
                          <div>
                            <p className="text-xs text-slate-400 mb-1.5">End</p>
                            <input type="time" value={assignment.end_time}
                              onChange={e => updateAssignment(assignment.team_id, 'end_time', e.target.value)}
                              className={timeInputCls} />
                          </div>
                        </div>
                      )}

                      {/* Cancelled note */}
                      {assignment.assigned && isCancelled && (
                        <p className="pl-7 text-xs text-red-400">
                          This game is cancelled for {team?.name}. The other team's game is unaffected.
                        </p>
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
                <input type="text" value={locationName}
                  onChange={e => setLocationName(e.target.value)}
                  placeholder="e.g. JCHS Softball Field" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>
                  Address <span className="text-slate-500 font-normal">(optional)</span>
                </label>
                <input type="text" value={locationAddress}
                  onChange={e => setLocationAddress(e.target.value)}
                  placeholder="e.g. 11306 County Line Rd" className={inputClass} />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className={labelClass}>
                Notes <span className="text-slate-500 font-normal">(optional)</span>
              </label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                placeholder="Any additional notes for this event..."
                className="w-full rounded-xl border border-white/10 bg-slate-800 px-4 py-2.5 text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none resize-none text-sm" />
            </div>

            {/* Volunteer Slots — home games/scrimmages only */}
            {isGameLike && (
              <div>
                <label className={labelClass}>Volunteer Slots</label>
                {isHome ? (
                  <VolunteerSlotsSection
                    roles={volunteerRoles}
                    slots={volunteerSlots}
                    onChange={setVolunteerSlots}
                  />
                ) : (
                  <p className="text-sm text-slate-500">
                    Volunteer slots are only available for home games.
                  </p>
                )}
              </div>
            )}

          </div>

          {/* ── RIGHT ── */}
          <div className="space-y-4">

            <Card>
              <label className={labelClass}>
                Uniform Notes{' '}
                <span className="text-slate-500 font-normal">(optional)</span>
              </label>
              <input type="text" value={uniformNotes}
                onChange={e => setUniformNotes(e.target.value)}
                placeholder="e.g. White jerseys, navy pants"
                className="w-full rounded-xl border border-white/10 bg-slate-800 px-4 py-2.5 text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none text-sm" />
            </Card>

            <Card>
              <Toggle enabled={mealRequired} onChange={setMealRequired}
                label="Team Meal" description="This event includes a team meal" />
              {mealRequired && (
                <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
                  <div>
                    <p className="text-xs text-slate-400 mb-1.5">Meal Time</p>
                    <input type="time" value={mealTime}
                      onChange={e => setMealTime(e.target.value)}
                      className={timeInputCls} />
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 mb-1.5">Meal Notes</p>
                    <input type="text" value={mealNotes}
                      onChange={e => setMealNotes(e.target.value)}
                      placeholder="e.g. Chick-fil-A, parents provide"
                      className="w-full rounded-xl border border-white/10 bg-slate-800 px-4 py-2.5 text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none text-sm" />
                  </div>
                </div>
              )}
            </Card>

            <Card>
              <Toggle enabled={isPublic} onChange={setIsPublic}
                label="Public Schedule"
                description="Show this event on your public team page" />
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
              <button type="button" onClick={handleSave} disabled={loading}
                className="flex-1 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 px-6 py-3 text-sm font-semibold transition-colors">
                {loading ? 'Saving...' : 'Save Changes'}
              </button>
              <button type="button" onClick={() => router.back()} disabled={loading}
                className="rounded-xl border border-white/10 hover:bg-slate-800 disabled:opacity-50 px-5 py-3 text-sm font-semibold transition-colors">
                Cancel
              </button>
            </div>

            <div className="pt-2 border-t border-white/5">
              <button type="button" onClick={() => setDeleteConfirm(true)} disabled={loading}
                className="w-full rounded-xl border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-400 disabled:opacity-50 px-6 py-2.5 text-sm font-semibold transition-colors">
                Delete Event
              </button>
              <p className="text-xs text-slate-600 text-center mt-2">
                Deletes for all teams — cancel per-team instead to keep a record
              </p>
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}
