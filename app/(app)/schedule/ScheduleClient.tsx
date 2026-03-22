'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { cancelEvent } from './actions'

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
  if (event.opponent) {
    return `${event.is_home ? 'vs' : '@'} ${event.opponent}`
  }
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

// ── Detail Item ───────────────────────────────────────────────

function DetailItem({ icon, text }: { icon: string; text: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className="text-base leading-none">{icon}</span>
      <span className="text-sm text-slate-400">{text}</span>
    </span>
  )
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
          <button
            onClick={onConfirm}
            className="flex-1 rounded-xl bg-red-600 hover:bg-red-500 px-4 py-2.5 text-sm font-semibold transition-colors"
          >
            Yes, Cancel Event
          </button>
          <button
            onClick={onCancel}
            className="flex-1 rounded-xl border border-white/10 hover:bg-slate-800 px-4 py-2.5 text-sm font-semibold transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Event Row (List View) ─────────────────────────────────────

function EventRow({ event, canManageEvents, canSendNotifications, onCancelRequest }: {
  event: any
  canManageEvents: boolean
  canSendNotifications: boolean
  onCancelRequest: (event: any) => void
}) {
  const router = useRouter()

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900 px-5 py-4 transition-colors hover:border-white/20">

      {/* Row 1: date + badges */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="text-xs font-semibold text-slate-400 mr-1">
          {formatDate(event.event_date)}
        </span>
        {eventTypeBadge(event.event_type)}
        {statusBadge(event.status)}
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

      {/* Row 4: notes */}
      {event.notes && (
        <p className="text-xs text-slate-500 line-clamp-1 mb-2">{event.notes}</p>
      )}

      {/* Row 5: actions */}
      <div className="flex justify-end gap-2 pt-2 border-t border-white/5 mt-2">
        {canManageEvents && (
          <button
            onClick={() => router.push(`/events/${event.id}/edit`)}
            style={{ padding: '2px 10px' }}
            className="rounded-lg border border-white/10 bg-slate-800 hover:bg-slate-700 text-xs font-semibold transition-colors"
          >
            Edit
          </button>
        )}
        {canSendNotifications && (
          <button
            onClick={() => router.push(`/events/${event.id}/notify`)}
            style={{ padding: '2px 10px' }}
            className="rounded-lg border border-sky-500/30 bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 text-xs font-semibold transition-colors"
          >
            Notify
          </button>
        )}
        {canManageEvents && (
          <button
            onClick={() => onCancelRequest(event)}
            style={{ padding: '2px 10px' }}
            className="rounded-lg border border-red-500/20 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-semibold transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  )
}

// ── Calendar List View (mobile fallback) ─────────────────────
// Renders when calendar toggle is active on small screens.
// Groups events by month, shows them as a compact list.

function CalendarListView({ events }: { events: any[] }) {
  const router = useRouter()
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1))

  const year  = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const monthName = viewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  // Filter events to current viewed month
  const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`
  const monthEvents = events.filter(e => e.event_date.startsWith(monthStr))

  function prevMonth() { setViewDate(new Date(year, month - 1, 1)) }
  function nextMonth() { setViewDate(new Date(year, month + 1, 1)) }

  return (
    <div>
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={prevMonth}
          className="rounded-lg border border-white/10 bg-slate-900 hover:bg-slate-800 px-3 py-1.5 text-sm font-semibold transition-colors"
        >
          ← Prev
        </button>
        <h2 className="text-base font-bold">{monthName}</h2>
        <button
          onClick={nextMonth}
          className="rounded-lg border border-white/10 bg-slate-900 hover:bg-slate-800 px-3 py-1.5 text-sm font-semibold transition-colors"
        >
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

// ── Calendar View ─────────────────────────────────────────────

function CalendarView({ events }: { events: any[] }) {
  const router = useRouter()
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1))

  const year  = viewDate.getFullYear()
  const month = viewDate.getMonth()

  const monthName = viewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  // Days in month
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  // What weekday does the 1st fall on (0=Sun)
  const firstDayOfWeek = new Date(year, month, 1).getDay()

  // Build event map: "YYYY-MM-DD" -> events[]
  const eventMap: Record<string, any[]> = {}
  events.forEach(event => {
    const key = event.event_date
    if (!eventMap[key]) eventMap[key] = []
    eventMap[key].push(event)
  })

  function prevMonth() {
    setViewDate(new Date(year, month - 1, 1))
  }
  function nextMonth() {
    setViewDate(new Date(year, month + 1, 1))
  }

  // Build grid cells: nulls for leading empty days, then 1..daysInMonth
  const cells: (number | null)[] = [
    ...Array(firstDayOfWeek).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  // Pad to complete last row
  while (cells.length % 7 !== 0) cells.push(null)

  const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  return (
    <div>
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={prevMonth}
          className="rounded-lg border border-white/10 bg-slate-900 hover:bg-slate-800 px-3 py-1.5 text-sm font-semibold transition-colors"
        >
          ← Prev
        </button>
        <h2 className="text-lg font-bold">{monthName}</h2>
        <button
          onClick={nextMonth}
          className="rounded-lg border border-white/10 bg-slate-900 hover:bg-slate-800 px-3 py-1.5 text-sm font-semibold transition-colors"
        >
          Next →
        </button>
      </div>

      {/* Day headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }} className="mb-1">
        {DAY_LABELS.map(d => (
          <div key={d} className="text-center text-xs font-semibold text-slate-500 py-2">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '1px' }} className="bg-white/5 rounded-2xl overflow-hidden border border-white/10">
        {cells.map((day, idx) => {
          if (day === null) {
            return (
              <div key={`empty-${idx}`} className="bg-slate-950 p-1" style={{ height: '110px' }} />
            )
          }

          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const cellDate = new Date(dateStr + 'T00:00:00')
          const isPast   = cellDate < today
          const isToday  = cellDate.getTime() === today.getTime()
          const dayEvents = eventMap[dateStr] ?? []

          return (
            <div
              key={dateStr}
              className={`bg-slate-900 overflow-y-auto p-1.5 ${isPast ? 'opacity-40' : ''}`}
              style={{ height: '110px' }}
            >
              {/* Day number */}
              <div className={`text-xs font-semibold mb-1 w-6 h-6 flex items-center justify-center rounded-full ${
                isToday
                  ? 'bg-sky-500 text-white'
                  : 'text-slate-400'
              }`}>
                {day}
              </div>

              {/* Events on this day */}
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
  teamId,
  programName,
  teamName,
  canManageEvents,
  canSendNotifications,
}: {
  events?: any[]
  teamId: string
  programName: string
  teamName: string
  canManageEvents: boolean
  canSendNotifications: boolean
}) {
  const router = useRouter()
  const [eventList, setEventList]       = useState(events)
  const [cancelTarget, setCancelTarget] = useState<any>(null)
  const [cancelling, setCancelling]     = useState(false)
  const [view, setView]                 = useState<'list' | 'calendar'>('list')
  const [isMobile, setIsMobile]         = useState(false)

  // Detect mobile screen width
  useEffect(() => {
    function checkMobile() {
      setIsMobile(window.innerWidth < 768)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  async function handleCancel() {
    if (!cancelTarget) return
    setCancelling(true)
    const result = await cancelEvent(cancelTarget.id)
    if (!result?.error) {
      setEventList(prev => prev.filter(e => e.id !== cancelTarget.id))
    }
    setCancelTarget(null)
    setCancelling(false)
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">

      {/* Confirm dialog */}
      {cancelTarget && (
        <ConfirmDialog
          message={`Cancel "${eventLabel(cancelTarget)}" on ${formatDate(cancelTarget.event_date)}? This will mark the event as cancelled.`}
          onConfirm={handleCancel}
          onCancel={() => setCancelTarget(null)}
        />
      )}

      {/* Nav */}
      

      <div className="mx-auto max-w-7xl px-6 py-8">

        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-slate-400">{programName}</p>
            <h1 className="text-2xl font-bold">{teamName} — Schedule</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {eventList.length} upcoming event{eventList.length !== 1 ? 's' : ''}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* View toggle */}
            <div className="flex rounded-xl border border-white/10 overflow-hidden">
              <button
                onClick={() => setView('list')}
                className={`px-4 py-2 text-sm font-semibold transition-colors ${
                  view === 'list'
                    ? 'bg-sky-600 text-white'
                    : 'bg-slate-900 text-slate-400 hover:text-white'
                }`}
              >
                ☰ List
              </button>
              <button
                onClick={() => setView('calendar')}
                className={`px-4 py-2 text-sm font-semibold transition-colors ${
                  view === 'calendar'
                    ? 'bg-sky-600 text-white'
                    : 'bg-slate-900 text-slate-400 hover:text-white'
                }`}
              >
                📅 Calendar
              </button>
            </div>

            {canManageEvents && (
              <button
                onClick={() => router.push('/events/new')}
                className="rounded-xl bg-sky-600 hover:bg-sky-500 px-5 py-2.5 text-sm font-semibold transition-colors"
              >
                + New Event
              </button>
            )}
          </div>
        </div>

        {/* List View */}
        {view === 'list' && (
          <>
            {eventList.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-slate-900 p-12 text-center">
                <p className="text-slate-400 text-lg font-semibold">No upcoming events</p>
                <p className="text-slate-500 text-sm mt-2">Add your first event to get started.</p>
                {canManageEvents && (
                  <button
                    onClick={() => router.push('/events/new')}
                    className="mt-6 rounded-xl bg-sky-600 hover:bg-sky-500 px-6 py-2.5 text-sm font-semibold transition-colors"
                  >
                    + New Event
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {eventList.map(event => (
                  <EventRow
                    key={event.id}
                    event={event}
                    canManageEvents={canManageEvents}
                    canSendNotifications={canSendNotifications}
                    onCancelRequest={setCancelTarget}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* Calendar View — grid on desktop, list on mobile */}
        {view === 'calendar' && (
          isMobile
            ? <CalendarListView events={eventList} />
            : <CalendarView events={eventList} />
        )}

      </div>
    </main>
  )
}