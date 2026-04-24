'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateEvent, deleteEvent, updateMealInfo } from './actions'
import {
  VolunteerSlotsSection,
  type VolunteerRole,
  type VolunteerSlot,
} from '../../VolunteerSlotsSection'
import type { TeamPlayerCount } from '@/lib/utils/get-team-player-count'

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
  isMealCoordinator = false,
  teamPlayerCounts = {},
}: {
  event:              any
  teams:              Team[]
  allTeamDetails:     TeamDetail[]
  volunteerRoles:     VolunteerRole[]
  existingSlots:      VolunteerSlot[]
  isMealCoordinator?: boolean
  teamPlayerCounts?:  Record<string, TeamPlayerCount>
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

  // Notification checkbox — auto-checked when event is within 48 hours (Central time)
  const autoNotify = (() => {
    const now        = new Date()
    const centralNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }))
    const eventDateObj = new Date(event.event_date + 'T00:00:00')
    return (eventDateObj.getTime() - centralNow.getTime()) / (1000 * 60 * 60) <= 48
  })()
  const [sendNotification, setSendNotification] = useState(autoNotify)

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
    const timeFields = ['start_time', 'arrival_time', 'end_time'] as const
    type TimeField = typeof timeFields[number]

    setTeamAssignments(prev => {
      const updated = prev.map(a => a.team_id === teamId ? { ...a, [field]: value } : a)
      // Auto-populate secondary teams for practice events
      if (
        eventType === 'practice' &&
        typeof value === 'string' && value &&
        timeFields.includes(field as TimeField) &&
        teamId === prev[0]?.team_id
      ) {
        return updated.map(a => {
          if (a.team_id !== teamId && a.assigned) {
            return { ...a, [field]: value }
          }
          return a
        })
      }
      return updated
    })
  }

  function toggleTeamStatus(teamId: string) {
    setTeamAssignments(prev => prev.map(a =>
      a.team_id === teamId
        ? { ...a, status: a.status === 'cancelled' ? 'scheduled' : 'cancelled' }
        : a
    ))
  }

  async function handleMealSave() {
    setLoading(true)
    setError(null)
    const result = await updateMealInfo(event.id, {
      meal_required: mealRequired,
      meal_time:     mealRequired && mealTime ? mealTime : null,
      meal_notes:    mealRequired && mealNotes ? mealNotes : null,
    })
    if (result?.error) {
      setError(result.error)
      setLoading(false)
    }
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
      isGameLike ? volunteerSlots : undefined,
      sendNotification,
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

  // ── Meal coordinator: show only meal fields ──────────────────────────────
  if (isMealCoordinator) {
    const eventTitle = event.event_type === 'practice'
      ? 'Practice'
      : event.event_type === 'meeting'
        ? 'Team Meeting'
        : event.event_type === 'tournament'
          ? (event.title ?? 'Tournament')
          : event.opponent
            ? `${event.is_home ? 'vs' : '@'} ${event.opponent}`
            : event.title ?? 'Event'

    const eventTypeLabel: Record<string, string> = {
      game: 'Game', practice: 'Practice', scrimmage: 'Scrimmage',
      tournament: 'Tournament', meeting: 'Meeting',
    }

    function fmt12(t: string | null): string | null {
      if (!t) return null
      const [h, m] = t.split(':')
      const hr = parseInt(h, 10)
      return `${hr % 12 || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`
    }

    const startTime = event.default_start_time ? fmt12(event.default_start_time) : null

    return (
      <div className="text-white">
        <div className="mx-auto max-w-xl px-6 py-8">
          <div className="mb-6">
            <button onClick={() => router.back()}
              className="text-sm text-slate-400 hover:text-white transition-colors">
              ← Back
            </button>
          </div>

          {/* Banner */}
          <div className="mb-6 rounded-2xl border border-sky-500/30 bg-sky-500/10 px-5 py-4">
            <p className="text-sm font-semibold text-sky-300">
              You are viewing this event as Meal Coordinator. You can only edit meal information.
            </p>
          </div>

          {/* Read-only event summary */}
          <div className="mb-6 rounded-2xl border border-white/10 bg-slate-900 px-5 py-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-white/10 bg-slate-800 px-3 py-0.5 text-xs font-semibold text-slate-300">
                {eventTypeLabel[event.event_type] ?? event.event_type}
              </span>
              {(event.event_type === 'game' || event.event_type === 'scrimmage') && event.is_home !== null && (
                <span className={`rounded-full border px-3 py-0.5 text-xs font-semibold ${
                  event.is_home
                    ? 'border-green-500/30 bg-green-500/10 text-green-300'
                    : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                }`}>
                  {event.is_home ? 'Home' : 'Away'}
                </span>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-0.5">Event</p>
              <p className="text-base font-bold text-white">{eventTitle}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-0.5">Date</p>
                <p className="text-sm text-slate-300">{event.event_date}</p>
              </div>
              {startTime && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-0.5">Time</p>
                  <p className="text-sm text-slate-300">{startTime}</p>
                </div>
              )}
            </div>
            {event.location_name && (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-0.5">Location</p>
                <p className="text-sm text-slate-300">{event.location_name}</p>
                {event.location_address && (
                  <p className="text-xs text-slate-500 mt-0.5">{event.location_address}</p>
                )}
              </div>
            )}
          </div>

          {/* Teams & Player Counts */}
          {Object.keys(teamPlayerCounts).length > 0 && (
            <div className="mb-6 rounded-2xl border border-white/10 bg-slate-900 px-5 py-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
                Teams &amp; Player Counts
              </p>
              <div className="space-y-2">
                {allTeamDetails.map(d => {
                  const team = teams.find(t => t.id === d.team_id)
                  const pc   = teamPlayerCounts[d.team_id]
                  if (!pc) return null
                  const hasCallUps = pc.called_up_in > 0 || pc.called_up_out > 0
                  return (
                    <div key={d.team_id} className="flex items-center justify-between">
                      <span className="text-sm text-slate-300">{team?.name ?? d.team_id}</span>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-semibold text-white">{pc.total}</span>
                        {hasCallUps && (
                          <span className="text-xs text-slate-500">
                            ({pc.base_count} base
                            {pc.called_up_in  > 0 && ` +${pc.called_up_in} up`}
                            {pc.called_up_out > 0 && ` -${pc.called_up_out} out`}
                            )
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
                {allTeamDetails.length > 1 && (
                  <div className="flex items-center justify-between border-t border-white/10 pt-2 mt-2">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Total</span>
                    <span className="font-bold text-white">
                      {allTeamDetails.reduce((sum, d) => sum + (teamPlayerCounts[d.team_id]?.total ?? 0), 0)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Meal fields */}
          <Card>
            <Toggle enabled={mealRequired} onChange={setMealRequired}
              label="Team Meal" description="This event includes a team meal" />
            {mealRequired && (
              <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
                <div>
                  <p className="text-xs text-slate-400 mb-1.5">Meal Time</p>
                  <input type="time" step="300" value={mealTime}
                    onChange={e => setMealTime(e.target.value)}
                    className={timeInputCls} />
                </div>
                <div>
                  <p className="text-xs text-slate-400 mb-1.5">Meal Notes</p>
                  <textarea value={mealNotes}
                    onChange={e => setMealNotes(e.target.value)}
                    rows={3}
                    placeholder="e.g. Chick-fil-A, parents provide"
                    className="w-full rounded-xl border border-white/10 bg-slate-800 px-4 py-2.5 text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none text-sm resize-none" />
                </div>
              </div>
            )}
          </Card>

          {error && (
            <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <div className="mt-4 flex gap-3">
            <button type="button" onClick={handleMealSave} disabled={loading}
              className="flex-1 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 px-6 py-3 text-sm font-semibold transition-colors">
              {loading ? 'Saving...' : 'Save Meal Info'}
            </button>
            <button type="button" onClick={() => router.back()} disabled={loading}
              className="rounded-xl border border-white/10 hover:bg-slate-800 disabled:opacity-50 px-5 py-3 text-sm font-semibold transition-colors">
              Cancel
            </button>
          </div>
        </div>
      </div>
    )
  }

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
                    placeholder="e.g. Riverside High School" className={inputClass} />
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
                        <div className="pl-7">
                          <div className="flex flex-wrap gap-4">
                            <div>
                              <p className="text-xs text-slate-400 mb-1.5">Start</p>
                              <input type="time" step="300" value={assignment.start_time}
                                onChange={e => updateAssignment(assignment.team_id, 'start_time', e.target.value)}
                                className={timeInputCls} />
                            </div>
                            <div>
                              <p className="text-xs text-slate-400 mb-1.5">Arrival</p>
                              <input type="time" step="300" value={assignment.arrival_time}
                                onChange={e => updateAssignment(assignment.team_id, 'arrival_time', e.target.value)}
                                className={timeInputCls} />
                            </div>
                            <div>
                              <p className="text-xs text-slate-400 mb-1.5">End</p>
                              <input type="time" step="300" value={assignment.end_time}
                                onChange={e => updateAssignment(assignment.team_id, 'end_time', e.target.value)}
                                className={timeInputCls} />
                            </div>
                          </div>
                          {eventType === 'practice' && assignment.team_id === teamAssignments[0]?.team_id && teamAssignments.filter(a => a.assigned).length > 1 && (
                            <p className="mt-1.5 text-xs text-slate-600">
                              Other team times will follow these values
                            </p>
                          )}
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
                  placeholder="e.g. Memorial Field" className={inputClass} />
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

            {/* Notification control */}
            <div className="rounded-2xl border border-white/10 bg-slate-900 p-4">
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={sendNotification}
                  onChange={e => setSendNotification(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/20 bg-slate-700 accent-sky-500"
                />
                <div>
                  <p className="text-sm font-semibold text-slate-200">Send change notifications</p>
                  <p className="text-xs text-slate-500 mt-0.5">Notify contacts and GroupMe about these changes</p>
                  {sendNotification && autoNotify && (
                    <p className="text-xs text-amber-400 mt-1.5">⚡ Auto-enabled — event is within 48 hours</p>
                  )}
                  {!sendNotification && !autoNotify && (
                    <p className="text-xs text-slate-600 mt-1.5">Event is more than 48 hours away</p>
                  )}
                </div>
              </label>
            </div>

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
