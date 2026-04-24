'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { cancelEvent, cancelEventForTeam } from './actions'
import { addTournamentGame, deleteTournamentGame } from './tournament-actions'

// ── Helpers ──────────────────────────────────────────────────

function formatTime(time: string | null): string {
  if (!time) return ''
  const [hourStr, minuteStr] = time.split(':')
  const hour = parseInt(hourStr)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const hour12 = hour % 12 || 12
  return `${hour12}:${minuteStr} ${ampm}`
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month:   'short',
    day:     'numeric',
  })
}

function eventLabel(event: any): string {
  if (event.event_type === 'practice')   return 'Practice'
  if (event.event_type === 'meeting')    return 'Team Meeting'
  if (event.event_type === 'tournament') return event.title ?? 'Tournament'
  if (event.opponent) return `${event.is_home ? 'vs' : '@'} ${event.opponent}`
  return event.title ?? 'Event'
}

function eventTypeBadge(type: string) {
  const map: Record<string, string> = {
    game:       'bg-sky-500/20 text-sky-300 border-sky-500/30',
    practice:   'bg-slate-700 text-slate-300 border-white/10',
    scrimmage:  'bg-purple-500/20 text-purple-300 border-purple-500/30',
    tournament: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    meeting:    'bg-green-500/20 text-green-300 border-green-500/30',
  }
  const label: Record<string, string> = {
    game: 'Game', practice: 'Practice', scrimmage: 'Scrimmage',
    tournament: 'Tournament', meeting: 'Meeting',
  }
  const cls = map[type] ?? 'bg-slate-700 text-slate-300 border-white/10'
  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-semibold tracking-wide ${cls}`}>
      {label[type] ?? type}
    </span>
  )
}

function statusBadge(status: string) {
  if (status === 'scheduled') return null
  const map: Record<string, string> = {
    postponed:   'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
    rescheduled: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
    completed:   'bg-green-500/20 text-green-300 border-green-500/30',
  }
  const cls = map[status] ?? 'bg-slate-700 text-slate-300'
  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${cls}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}

function eventTypeColor(type: string): string {
  const map: Record<string, string> = {
    game:       'bg-sky-500/20 text-sky-300 border-sky-500/40',
    practice:   'bg-slate-700/80 text-slate-300 border-white/10',
    scrimmage:  'bg-purple-500/20 text-purple-300 border-purple-500/40',
    tournament: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    meeting:    'bg-green-500/20 text-green-300 border-green-500/40',
  }
  return map[type] ?? 'bg-slate-700 text-slate-300 border-white/10'
}

// ── Confirm Dialog ────────────────────────────────────────────

function ConfirmDialog({ message, onConfirm, onCancel }: {
  message: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
        <p className="text-sm text-slate-300">{message}</p>
        <div className="mt-5 flex gap-3">
          <button onClick={onConfirm}
            className="flex-1 rounded-xl bg-red-600 hover:bg-red-500 px-4 py-2.5 text-sm font-semibold transition-colors">
            Yes, Cancel Event
          </button>
          <button onClick={onCancel}
            className="flex-1 rounded-xl border border-white/10 hover:bg-slate-800 px-4 py-2.5 text-sm font-semibold transition-colors">
            Go Back
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Add Tournament Game Modal ─────────────────────────────────

function AddTournamentGameModal({ tournament, defaultTeamId, teams, onClose, onAdded }: {
  tournament: any
  defaultTeamId: string
  teams: { id: string; name: string }[]
  onClose: () => void
  onAdded: (game: any) => void
}) {
  const [selectedTeamId, setSelectedTeamId] = useState(defaultTeamId)
  const [opponent, setOpponent]             = useState('')
  const [startTime, setStartTime]           = useState('')
  const [locationName, setLocationName]     = useState('')
  const [gameDate, setGameDate]             = useState(tournament.event_date)
  const [loading, setLoading]               = useState(false)
  const [error, setError]                   = useState<string | null>(null)

  async function handleAdd() {
    setLoading(true)
    setError(null)
    const result = await addTournamentGame({
      parent_event_id: tournament.id,
      opponent:        opponent || undefined,
      start_time:      startTime || undefined,
      location_name:   locationName || undefined,
      event_date:      gameDate,
      team_id:         selectedTeamId,
    })
    if (result?.error) {
      setError(result.error)
      setLoading(false)
    } else {
      onAdded({
        id:               result.eventId,
        parent_event_id:  tournament.id,
        event_type:       'game',
        opponent:         opponent || null,
        location_name:    locationName || null,
        event_date:       gameDate,
        team_details:     [{ team_id: selectedTeamId, start_time: startTime || null }],
        team_start_time:  startTime || null,
        status:           'scheduled',
      })
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-white/10 bg-slate-900 p-4 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold">Add Tournament Game</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none">×</button>
        </div>
        <p className="text-xs text-slate-500 mb-4">
          Adding game to: <span className="text-slate-300">{tournament.title ?? 'Tournament'}</span>
        </p>

        <div className="space-y-3">
          {/* Team selector — only shown when coach manages multiple teams */}
          {teams.length > 1 && (
            <div className="w-full">
              <label className="block text-xs font-semibold text-slate-400 mb-1">Team</label>
              <select
                value={selectedTeamId}
                onChange={e => setSelectedTeamId(e.target.value)}
                className="block w-full min-w-0 rounded-xl border border-white/10 bg-slate-800 px-4 py-2.5 text-white focus:border-sky-500 focus:outline-none text-sm"
                style={{ appearance: 'auto' }}
              >
                {teams.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="w-full">
            <label className="block text-xs font-semibold text-slate-400 mb-1">Opponent</label>
            <input
              type="text"
              value={opponent}
              onChange={e => setOpponent(e.target.value)}
              placeholder="e.g. Sparkman"
              className="block w-full min-w-0 rounded-xl border border-white/10 bg-slate-800 px-4 py-2.5 text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none text-sm"
            />
          </div>
          <div className="w-full overflow-hidden">
            <label className="block text-xs font-semibold text-slate-400 mb-1">Date</label>
            <input
              type="date"
              value={gameDate}
              onChange={e => setGameDate(e.target.value)}
              className="block w-full min-w-0 appearance-none rounded-xl border border-white/10 bg-slate-800 px-4 py-2.5 text-white focus:border-sky-500 focus:outline-none text-sm"
            />
          </div>
          <div className="w-full overflow-hidden">
            <label className="block text-xs font-semibold text-slate-400 mb-1">Start Time</label>
            <input
              type="time"
              value={startTime}
              onChange={e => setStartTime(e.target.value)}
              className="block w-full min-w-0 appearance-none rounded-xl border border-white/10 bg-slate-800 px-4 py-2.5 text-white focus:border-sky-500 focus:outline-none text-sm"
            />
          </div>
          <div className="w-full">
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              Location / Field <span className="text-slate-500 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={locationName}
              onChange={e => setLocationName(e.target.value)}
              placeholder="e.g. Field 2, Diamond A"
              className="block w-full min-w-0 rounded-xl border border-white/10 bg-slate-800 px-4 py-2.5 text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none text-sm"
            />
          </div>
        </div>

        {error && (
          <p className="mt-3 text-xs text-red-400">{error}</p>
        )}

        <div className="flex gap-3 mt-5">
          <button
            onClick={handleAdd}
            disabled={loading}
            className="flex-1 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 px-4 py-2.5 text-sm font-semibold transition-colors"
          >
            {loading ? 'Adding...' : 'Add Game'}
          </button>
          <button
            onClick={onClose}
            disabled={loading}
            className="rounded-xl border border-white/10 hover:bg-slate-800 disabled:opacity-50 px-4 py-2.5 text-sm font-semibold transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Tournament Child Games ────────────────────────────────────

function TournamentGames({ games, canManageEvents, teamId, onDelete }: {
  games: any[]
  canManageEvents: boolean
  teamId: string
  onDelete: (gameId: string) => void
}) {
  const router = useRouter()
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function handleDelete(gameId: string) {
    setDeletingId(gameId)
    const result = await deleteTournamentGame(gameId, teamId)
    if (!result?.error) {
      onDelete(gameId)
    }
    setDeletingId(null)
  }

  if (games.length === 0) return null

  return (
    <div className="mt-3 ml-4 space-y-1.5 border-l-2 border-amber-500/30 pl-4">
      {games.map(game => (
        <div key={game.id} className="flex items-center justify-between gap-2 text-sm">
          <div className="min-w-0">
            <span className="text-slate-200 font-medium">
              {game.opponent ? `vs ${game.opponent}` : 'TBD'}
            </span>
            {game.team_start_time && (
              <span className="text-slate-400 ml-2">{formatTime(game.team_start_time)}</span>
            )}
            {game.location_name && (
              <span className="text-slate-500 ml-2">· {game.location_name}</span>
            )}
          </div>
          {canManageEvents && (
            <div className="flex shrink-0 gap-1.5">
              <button
                onClick={() => router.push(`/events/${game.id}/edit`)}
                className="rounded bg-slate-700 hover:bg-slate-600 text-white px-2 py-1 text-xs font-medium transition-colors"
              >
                Edit
              </button>
              <button
                onClick={() => handleDelete(game.id)}
                disabled={deletingId === game.id}
                className="rounded border border-red-500/50 bg-red-500/10 hover:bg-red-500/20 text-red-400 p-1.5 text-xs font-medium transition-colors disabled:opacity-50"
              >
                {deletingId === game.id ? '…' : '×'}
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Event Row (List View) ─────────────────────────────────────

function EventRow({ event, childGames, canManageEvents, canSendNotifications,
  teamId, teams, volunteerSummary, userRole, brandPrimary, playerCountMap,
  onCancelRequest, onTournamentGameAdded, onTournamentGameDeleted }: {
  event: any
  childGames: any[]
  canManageEvents: boolean
  canSendNotifications: boolean
  teamId: string
  teams: { id: string; name: string }[]
  volunteerSummary?: { filled: number; total: number }
  userRole?: string
  brandPrimary?: string | null
  playerCountMap?: Record<string, { total: number; base_count: number; called_up_in: number; called_up_out: number }>
  onCancelRequest: (event: any) => void
  onTournamentGameAdded: (game: any) => void
  onTournamentGameDeleted: (gameId: string) => void
}) {
  const router = useRouter()
  const [showAddGame, setShowAddGame] = useState(false)

  // Team badges: show which teams this event belongs to (only when showing all teams)
  const teamCount = event.team_details?.length ?? 0

  return (
    <>
      {showAddGame && (
        <AddTournamentGameModal
          tournament={event}
          defaultTeamId={teamId}
          teams={teams}
          onClose={() => setShowAddGame(false)}
          onAdded={onTournamentGameAdded}
        />
      )}

      <div
        className="rounded-2xl border border-white/10 bg-slate-900 px-5 py-4 transition-colors hover:border-white/20 border-l-4"
        style={{ borderLeftColor: brandPrimary ?? '#0284c7' }}
      >

        {/* Row 1: date + badges */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="text-xs font-semibold text-slate-400 mr-1">
            {formatDate(event.event_date)}
          </span>
          {eventTypeBadge(event.event_type)}
          {statusBadge(event.status)}
          {/* Team badges — show which teams have this event, red if cancelled for that team */}
          {teams.length > 1 && teamCount > 0 && event.team_details.map((d: any) => {
            const team = teams.find(t => t.id === d.team_id)
            if (!team) return null
            const isCancelled = d.status === 'cancelled'
            return (
              <span key={d.team_id} className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                isCancelled
                  ? 'border-red-500/30 bg-red-500/10 text-red-400 line-through'
                  : 'border-white/10 bg-slate-800 text-slate-400'
              }`}>
                {team.name}
              </span>
            )
          })}
          {!event.is_public && (
            <span className="rounded-full border border-white/10 bg-slate-800 px-3 py-1 text-xs text-slate-500">
              Private
            </span>
          )}
          {event.meal_required && (
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs text-amber-400">
              🍽 Meal
            </span>
          )}
          {event.meal_required && userRole === 'meal_coordinator' && playerCountMap && (
            (() => {
              const teamDetails: any[] = event.team_details ?? []
              const counts = teamDetails
                .map((d: any) => ({ team: teams.find(t => t.id === d.team_id), pc: playerCountMap[d.team_id] }))
                .filter(x => x.pc)
              if (counts.length === 0) return null
              const grandTotal = counts.reduce((s, x) => s + x.pc!.total, 0)
              return (
                <span className="rounded-full border border-amber-500/20 bg-amber-500/5 px-3 py-1 text-xs text-amber-300 font-medium">
                  {counts.map(x => `${x.team?.name ?? '?'}: ${x.pc!.total}`).join(' · ')}
                  {counts.length > 1 && ` · Total: ${grandTotal}`}
                </span>
              )
            })()
          )}
          {volunteerSummary && (
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${
              volunteerSummary.filled >= volunteerSummary.total
                ? 'border-green-500/30 bg-green-500/10 text-green-400'
                : 'border-amber-500/30 bg-amber-500/10 text-amber-400'
            }`}>
              👥 {volunteerSummary.filled}/{volunteerSummary.total}
            </span>
          )}
        </div>

        {/* Row 2: title */}
        <h3 className="text-base font-semibold text-white leading-snug mb-2">
          {eventLabel(event)}
        </h3>

        {/* Row 3: details */}
        <div className="flex flex-wrap items-center mb-2 text-sm text-slate-400">
          {event.team_start_time && (
            <span className="flex items-center gap-1.5 mr-4">
              <span>🕐</span>
              <span>{formatTime(event.team_start_time)}</span>
            </span>
          )}
          {event.team_arrival_time && (
            <span className="flex items-center gap-1.5 mr-4">
              <span>📍</span>
              <span>Arrive {formatTime(event.team_arrival_time)}</span>
            </span>
          )}
          {event.location_name && (
            <span className="flex items-center gap-1.5 mr-4">
              <span>📌</span>
              <span>{event.location_name}</span>
            </span>
          )}
          {event.uniform_notes && (
            <span className="flex items-center gap-1.5 mr-4">
              <span>👕</span>
              <span>{event.uniform_notes}</span>
            </span>
          )}
        </div>

        {event.notes && (
          <p className="text-xs text-slate-500 line-clamp-1 mb-2">{event.notes}</p>
        )}

        {/* Tournament child games */}
        {event.is_tournament && (
          <TournamentGames
            games={childGames}
            canManageEvents={canManageEvents}
            teamId={teamId}
            onDelete={onTournamentGameDeleted}
          />
        )}

        {/* Row 5: actions */}
        <div className="flex flex-row flex-wrap gap-2 pt-2 border-t border-white/5 mt-3">
          {event.is_tournament && canManageEvents && (
            <button
              onClick={() => setShowAddGame(true)}
              className="shrink-0 rounded-lg border border-slate-500 bg-slate-700 hover:bg-slate-600 text-white px-3 py-1.5 text-sm font-medium transition-colors"
            >
              + Game
            </button>
          )}
          {canManageEvents && volunteerSummary && (
            <button
              onClick={() => router.push(`/events/${event.id}`)}
              className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-white transition-colors"
              style={{ background: brandPrimary ?? '#0284c7' }}
            >
              Volunteers
            </button>
          )}
          {canManageEvents && (
            <button
              onClick={() => router.push(`/events/${event.id}/edit`)}
              className="shrink-0 rounded-lg bg-slate-700 hover:bg-slate-600 text-white px-3 py-1.5 text-sm font-medium transition-colors"
            >
              Edit
            </button>
          )}
          {userRole === 'meal_coordinator' && (
            <button
              onClick={() => router.push(`/events/${event.id}/edit`)}
              className="shrink-0 rounded-lg border border-amber-500/40 bg-amber-500/20 text-amber-300 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-amber-500/30"
            >
              Edit Meal Info
            </button>
          )}
          {canSendNotifications && (
            <button
              onClick={() => router.push(`/events/${event.id}/notify`)}
              className="shrink-0 rounded-lg border border-white/60 bg-transparent hover:bg-white/10 text-white px-3 py-1.5 text-sm font-medium transition-colors"
            >
              Notify
            </button>
          )}
          {canManageEvents && (
            <button
              onClick={() => onCancelRequest(event)}
              className="shrink-0 rounded-lg border border-red-500/50 bg-red-500/10 hover:bg-red-500/20 text-red-400 px-3 py-1.5 text-sm font-medium transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </>
  )
}

// ── Calendar List View (mobile) ───────────────────────────────

function CalendarListView({ events }: { events: any[] }) {
  const router = useRouter()
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1))

  const year  = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const monthName = viewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`
  const monthEvents = events.filter(e => e.event_date.startsWith(monthStr))

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setViewDate(new Date(year, month - 1, 1))}
          className="rounded-lg border border-white/10 bg-slate-900 hover:bg-slate-800 px-3 py-1.5 text-sm font-semibold transition-colors">
          ← Prev
        </button>
        <h2 className="text-base font-bold">{monthName}</h2>
        <button onClick={() => setViewDate(new Date(year, month + 1, 1))}
          className="rounded-lg border border-white/10 bg-slate-900 hover:bg-slate-800 px-3 py-1.5 text-sm font-semibold transition-colors">
          Next →
        </button>
      </div>

      {monthEvents.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-slate-900 p-8 text-center">
          <p className="text-slate-400 text-sm">No events this month</p>
        </div>
      ) : (
        <div className="space-y-2">
          {monthEvents.map(event => {
            const cellDate = new Date(event.event_date + 'T00:00:00')
            const isPast = cellDate < today
            const dayLabel = cellDate.toLocaleDateString('en-US', {
              weekday: 'short', month: 'short', day: 'numeric'
            })
            return (
              <button
                key={event.id}
                onClick={() => router.push(`/events/${event.id}/edit`)}
                className={`w-full text-left rounded-2xl border px-4 py-3 transition-colors ${
                  isPast
                    ? 'border-white/5 bg-slate-900/50 opacity-50'
                    : 'border-white/10 bg-slate-900 hover:border-white/20'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs text-slate-400 mb-0.5">{dayLabel}</p>
                    <p className="text-sm font-semibold text-white truncate">
                      {eventLabel(event)}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-3 mt-1 text-xs text-slate-400">
                      {event.team_start_time && (
                        <span>🕐 {formatTime(event.team_start_time)}</span>
                      )}
                      {event.location_name && (
                        <span>📌 {event.location_name}</span>
                      )}
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${eventTypeColor(event.event_type)}`}>
                    {event.event_type === 'game' ? 'Game'
                      : event.event_type === 'practice' ? 'Practice'
                      : event.event_type === 'tournament' ? 'Tourn.'
                      : event.event_type}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Calendar View (desktop) ───────────────────────────────────

function CalendarView({ events, brandPrimary }: { events: any[]; brandPrimary?: string | null }) {
  const router = useRouter()
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1))

  const year  = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const monthName = viewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDayOfWeek = new Date(year, month, 1).getDay()

  const eventMap: Record<string, any[]> = {}
  events.forEach(event => {
    const key = event.event_date
    if (!eventMap[key]) eventMap[key] = []
    eventMap[key].push(event)
  })

  const cells: (number | null)[] = [
    ...Array(firstDayOfWeek).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setViewDate(new Date(year, month - 1, 1))}
          className="rounded-lg border border-white/10 bg-slate-900 hover:bg-slate-800 px-3 py-1.5 text-sm font-semibold transition-colors">
          ← Prev
        </button>
        <h2 className="text-lg font-bold">{monthName}</h2>
        <button onClick={() => setViewDate(new Date(year, month + 1, 1))}
          className="rounded-lg border border-white/10 bg-slate-900 hover:bg-slate-800 px-3 py-1.5 text-sm font-semibold transition-colors">
          Next →
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }} className="mb-1">
        {DAY_LABELS.map(d => (
          <div key={d} className="text-center text-xs font-semibold text-slate-500 py-2">{d}</div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '1px' }}
        className="bg-white/5 rounded-2xl overflow-hidden border border-white/10">
        {cells.map((day, idx) => {
          if (day === null) {
            return <div key={`empty-${idx}`} className="bg-slate-950 p-1" style={{ height: '110px' }} />
          }
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const cellDate = new Date(dateStr + 'T00:00:00')
          const isPast   = cellDate < today
          const isToday  = cellDate.getTime() === today.getTime()
          const dayEvents = eventMap[dateStr] ?? []

          return (
            <div key={dateStr}
              className={`bg-slate-900 overflow-y-auto p-1.5 ${isPast ? 'opacity-40' : ''}`}
              style={{ height: '110px' }}>
              <div
                className={`text-xs font-semibold mb-1 w-6 h-6 flex items-center justify-center rounded-full ${isToday ? 'text-white' : 'text-slate-400'}`}
                style={isToday ? { background: brandPrimary ?? '#0ea5e9' } : undefined}
              >
                {day}
              </div>
              <div className="space-y-1">
                {dayEvents.map(event => (
                  <button
                    key={event.id}
                    onClick={() => router.push(`/events/${event.id}/edit`)}
                    className={`w-full text-left rounded-lg border px-1.5 py-1 text-xs font-medium transition-opacity hover:opacity-80 ${eventTypeColor(event.event_type)}`}
                  >
                    <div className="font-semibold leading-tight truncate">
                      {eventLabel(event)}
                    </div>
                    {event.team_start_time && (
                      <div className="opacity-75 leading-tight">
                        {formatTime(event.team_start_time)}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main Schedule Client ──────────────────────────────────────

export default function ScheduleClient({
  events = [],
  childGames = [],
  teams = [],
  primaryTeamId = null,
  programName,
  canManageEvents,
  canSendNotifications,
  volunteerSummaryMap = {},
  userRole = '',
  brandPrimary = null,
  brandSecondary = null,
  playerCountMap = {},
}: {
  events?: any[]
  childGames?: any[]
  teams?: { id: string; name: string }[]
  primaryTeamId?: string | null
  programName: string
  canManageEvents: boolean
  canSendNotifications: boolean
  volunteerSummaryMap?: Record<string, { filled: number; total: number }>
  userRole?: string
  brandPrimary?: string | null
  brandSecondary?: string | null
  playerCountMap?: Record<string, { total: number; base_count: number; called_up_in: number; called_up_out: number }>
}) {
  const router = useRouter()
  const [eventList, setEventList]         = useState(events)
  const [childGameList, setChildGameList] = useState(childGames)
  const [cancelTarget, setCancelTarget]   = useState<any>(null)
  const [view, setView]                   = useState<'list' | 'calendar'>('list')
  const [isMobile, setIsMobile]           = useState(false)
  const [mounted, setMounted]             = useState(false)
  // null = show all teams
  const [activeTeamId, setActiveTeamId]   = useState<string | null>(null)

  useEffect(() => {
    setMounted(true)
    function checkMobile() { setIsMobile(window.innerWidth < 768) }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  async function handleCancel() {
    if (!cancelTarget) return
    if (activeTeamId) {
      // Per-team cancel: hide only from this team's view
      const result = await cancelEventForTeam(cancelTarget.id, activeTeamId)
      if (!result?.error) {
        // Mark the team detail as cancelled in local state so filtered view hides it
        setEventList(prev => prev.map(e =>
          e.id === cancelTarget.id
            ? {
                ...e,
                team_details: (e.team_details ?? []).map((d: any) =>
                  d.team_id === activeTeamId ? { ...d, status: 'cancelled' } : d
                ),
              }
            : e
        ))
      }
    } else {
      // Global cancel: remove from all views
      const result = await cancelEvent(cancelTarget.id)
      if (!result?.error) {
        setEventList(prev => prev.filter(e => e.id !== cancelTarget.id))
      }
    }
    setCancelTarget(null)
  }

  function handleTournamentGameAdded(game: any) {
    setChildGameList(prev => [...prev, game])
  }

  function handleTournamentGameDeleted(gameId: string) {
    setChildGameList(prev => prev.filter(g => g.id !== gameId))
  }

  // Resolve per-team times and filter events based on active team filter
  const displayEvents = useMemo(() => {
    if (!activeTeamId) {
      // "All" view — display primary team's times
      return eventList.map(e => {
        const detail = primaryTeamId
          ? e.team_details?.find((d: any) => d.team_id === primaryTeamId)
          : e.team_details?.[0]
        return {
          ...e,
          team_start_time:   detail?.start_time   || e.default_start_time,
          team_arrival_time: detail?.arrival_time  || e.default_arrival_time,
        }
      })
    }
    return eventList
      .filter(e => e.team_details?.some((d: any) => d.team_id === activeTeamId && d.status !== 'cancelled'))
      .map(e => {
        const detail = e.team_details?.find((d: any) => d.team_id === activeTeamId)
        return {
          ...e,
          team_start_time:   detail?.start_time   || e.default_start_time,
          team_arrival_time: detail?.arrival_time  || e.default_arrival_time,
        }
      })
  }, [eventList, activeTeamId, primaryTeamId])

  // Filter child games by active team
  const displayChildGames = useMemo(() => {
    if (!activeTeamId) return childGameList
    return childGameList.filter(g =>
      g.team_details?.some((d: any) => d.team_id === activeTeamId)
    )
  }, [childGameList, activeTeamId])

  // teamId used for tournament game actions — active filter or first team
  const actionTeamId = activeTeamId ?? teams[0]?.id ?? ''

  // All events including child games for calendar view
  const allEventsForCalendar = [...displayEvents, ...displayChildGames]

  return (
    <main className="min-h-screen bg-slate-950 text-white">

      {cancelTarget && (
        <ConfirmDialog
          message={
            activeTeamId
              ? `Cancel "${eventLabel(cancelTarget)}" on ${formatDate(cancelTarget.event_date)} for ${teams.find(t => t.id === activeTeamId)?.name ?? 'this team'} only? Other teams will not be affected.`
              : `Cancel "${eventLabel(cancelTarget)}" on ${formatDate(cancelTarget.event_date)} for all teams? This cannot be undone from the schedule view.`
          }
          onConfirm={handleCancel}
          onCancel={() => setCancelTarget(null)}
        />
      )}

      <div className="mx-auto max-w-7xl px-6 py-8">

        {/* Header */}
        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-slate-400">{programName}</p>
            <h1 className="text-2xl font-bold">Schedule</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {displayEvents.length} upcoming event{displayEvents.length !== 1 ? 's' : ''}
              {activeTeamId && teams.length > 1 && ` · ${teams.find(t => t.id === activeTeamId)?.name}`}
            </p>
          </div>

          <div className="flex flex-row items-center gap-3">
            {/* Segmented List/Calendar toggle */}
            <div className="flex overflow-hidden rounded-lg border border-white/10">
              <button
                onClick={() => setView('list')}
                className="whitespace-nowrap px-4 py-2 text-sm font-medium transition-colors"
                style={view === 'list'
                  ? { background: brandPrimary ?? '#0284c7', color: 'white' }
                  : { background: '#0f172a', color: '#94a3b8' }}
              >
                ☰ List
              </button>
              <button
                onClick={() => setView('calendar')}
                className="whitespace-nowrap px-4 py-2 text-sm font-medium transition-colors"
                style={view === 'calendar'
                  ? { background: brandPrimary ?? '#0284c7', color: 'white' }
                  : { background: '#0f172a', color: '#94a3b8' }}
              >
                📅 Calendar
              </button>
            </div>

            {canManageEvents && (
              <>
                <button
                  onClick={() => router.push('/schedule/import')}
                  className="w-auto shrink-0 rounded-lg border border-white/20 hover:border-white/40 px-4 py-2 text-sm font-medium text-slate-300 hover:text-white transition-colors"
                >
                  ↑ Import Schedule
                </button>
                <button
                  onClick={() => router.push('/events/new')}
                  className="w-auto shrink-0 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors"
                  style={{ background: brandPrimary ?? '#0284c7' }}
                >
                  + New Event
                </button>
              </>
            )}
          </div>
        </div>

        {/* Team filter tabs — only shown when coaching multiple teams */}
        {teams.length > 1 && (
          <div className="flex flex-wrap gap-2 mb-6">
            <button
              onClick={() => setActiveTeamId(null)}
              className="rounded-full px-4 py-1.5 text-sm font-medium transition-colors"
              style={activeTeamId === null
                ? { background: brandPrimary ?? '#0284c7', color: 'white' }
                : { background: '#1e293b', color: '#9ca3af' }}
            >
              All Teams
            </button>
            {teams.map(team => (
              <button
                key={team.id}
                onClick={() => setActiveTeamId(team.id)}
                className="rounded-full px-4 py-1.5 text-sm font-medium transition-colors"
                style={activeTeamId === team.id
                  ? { background: brandPrimary ?? '#0284c7', color: 'white' }
                  : { background: '#1e293b', color: '#9ca3af' }}
              >
                {team.name}
              </button>
            ))}
          </div>
        )}

        {/* List View */}
        {view === 'list' && (
          <>
            {displayEvents.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-slate-900 p-12 text-center">
                <p className="text-slate-400 text-lg font-semibold">No upcoming events</p>
                <p className="text-slate-500 text-sm mt-2">Add your first event to get started.</p>
                {canManageEvents && (
                  <button
                    onClick={() => router.push('/events/new')}
                    className="mt-6 rounded-xl px-6 py-2.5 text-sm font-semibold text-white transition-colors"
                    style={{ background: brandPrimary ?? '#0284c7' }}
                  >
                    + New Event
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {displayEvents.map(event => (
                  <EventRow
                    key={event.id}
                    event={event}
                    childGames={displayChildGames.filter(g => g.parent_event_id === event.id)}
                    canManageEvents={canManageEvents}
                    canSendNotifications={canSendNotifications}
                    teamId={actionTeamId}
                    teams={teams}
                    volunteerSummary={volunteerSummaryMap[event.id]}
                    userRole={userRole}
                    brandPrimary={brandPrimary}
                    playerCountMap={playerCountMap}
                    onCancelRequest={setCancelTarget}
                    onTournamentGameAdded={handleTournamentGameAdded}
                    onTournamentGameDeleted={handleTournamentGameDeleted}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* Calendar View */}
        {view === 'calendar' && mounted && (
          isMobile
            ? <CalendarListView events={allEventsForCalendar} />
            : <CalendarView events={allEventsForCalendar} brandPrimary={brandPrimary} />
        )}
        {view === 'calendar' && !mounted && (
          <CalendarView events={allEventsForCalendar} brandPrimary={brandPrimary} />
        )}

      </div>
    </main>
  )
}
