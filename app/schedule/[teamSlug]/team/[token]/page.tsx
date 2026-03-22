import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'

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
  if (event.event_type === 'practice') return 'Practice'
  if (event.event_type === 'tournament') return event.title ?? 'Tournament'
  if (event.opponent) return `${event.is_home ? 'vs' : '@'} ${event.opponent}`
  return event.title ?? 'Event'
}

function eventTypeBadge(type: string) {
  const map: Record<string, string> = {
    game:       'border-sky-500/30 bg-sky-500/10 text-sky-300',
    practice:   'border-white/10 bg-slate-700 text-slate-300',
    scrimmage:  'border-purple-500/30 bg-purple-500/10 text-purple-300',
    tournament: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  }
  const label: Record<string, string> = {
    game: 'Game', practice: 'Practice',
    scrimmage: 'Scrimmage', tournament: 'Tournament',
  }
  const cls = map[type] ?? 'border-white/10 bg-slate-700 text-slate-300'
  return (
    <span className={`rounded-full border px-3 py-0.5 text-xs font-semibold ${cls}`}>
      {label[type] ?? type}
    </span>
  )
}

export default async function TeamSchedulePage({
  params,
}: {
  params: Promise<{ teamSlug: string; token: string }>
}) {
  const { teamSlug, token } = await params
  const supabase = await createClient()

  // Validate both slug AND token must match
  const { data: team } = await supabase
    .from('teams')
    .select('id, name, slug, program_id, team_schedule_token')
    .eq('slug', teamSlug)
    .eq('team_schedule_token', token)  // ← token must match
    .single()

  if (!team) notFound()  // wrong slug OR wrong token → 404

  const { data: program } = await supabase
    .from('programs')
    .select('name, sport, season_year, school_id')
    .eq('id', team.program_id)
    .single()

  const { data: school } = await supabase
    .from('schools')
    .select('name, city, state')
    .eq('id', program?.school_id)
    .single()

  const today = new Date().toISOString().split('T')[0]

  const { data: eventRows } = await supabase
    .from('events')
    .select(`
      id,
      title,
      event_type,
      opponent,
      is_home,
      is_tournament,
      location_name,
      location_address,
      event_date,
      default_start_time,
      default_arrival_time,
      status,
      uniform_notes,
      notes,
      meal_required,
      meal_time,
      meal_notes,
      event_team_details!inner(
        team_id,
        start_time,
        arrival_time
      )
    `)
    .eq('event_team_details.team_id', team.id)
    .in('event_type', ['game', 'tournament', 'practice', 'scrimmage'])
    .eq('status', 'scheduled')
    .eq('is_public', true)
    .gte('event_date', today)
    .order('event_date', { ascending: true })

  const events = (eventRows ?? []).map((row: any) => ({
    ...row,
    display_time:    row.event_team_details?.[0]?.start_time   || row.default_start_time,
    display_arrival: row.event_team_details?.[0]?.arrival_time || row.default_arrival_time,
    event_team_details: undefined,
  }))

  const calendarUrl = `/schedule/${teamSlug}/calendar.ics`

  return (
    <main className="min-h-screen bg-slate-950 text-white">

      {/* Header */}
      <div className="border-b border-white/10 bg-slate-900">
        <div className="mx-auto max-w-4xl px-6 py-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <img
                src="/sidelineops-logo-cropped.png"
                alt="SidelineOps"
                style={{ height: '24px', width: 'auto', opacity: 0.7 }}
                className="mb-2"
              />
              <h1 className="text-2xl font-bold text-white">
                {program?.name ?? team.name}
              </h1>
              <p className="text-slate-400 text-sm mt-0.5">
                {team.name} · {program?.sport} · {program?.season_year} Season
              </p>
              {school && (
                <p className="text-slate-500 text-xs mt-0.5">
                  {school.name} · {school.city}, {school.state}
                </p>
              )}
              {/* Team-only indicator */}
              <div className="mt-3 inline-flex items-center gap-2 rounded-xl border border-sky-500/20 bg-sky-500/10 px-3 py-1.5">
                <span className="text-xs text-sky-300 font-semibold">
                  🔒 Team Schedule — Players & Parents Only
                </span>
              </div>
            </div>

            <a
              href={calendarUrl}
              className="shrink-0 rounded-xl border border-white/10 bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 text-sm font-semibold text-center transition-colors"
            >
              📅 Subscribe to Calendar
            </a>
          </div>
        </div>
      </div>

      {/* Schedule */}
      <div className="mx-auto max-w-4xl px-6 py-8">

        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold">Full Schedule</h2>
          <span className="text-sm text-slate-500">
            {events.length} event{events.length !== 1 ? 's' : ''} remaining
          </span>
        </div>

        {events.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-slate-900 p-10 text-center">
            <p className="text-slate-400 font-semibold">No upcoming events scheduled</p>
            <p className="text-slate-500 text-sm mt-1">Check back soon.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {events.map(event => (
              <div
                key={event.id}
                className="rounded-2xl border border-white/10 bg-slate-900 px-5 py-4 hover:border-white/20 transition-colors"
              >
                {/* Date + type badge */}
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="text-xs font-semibold text-slate-400">
                    {formatDate(event.event_date)}
                  </span>
                  {eventTypeBadge(event.event_type)}
                  {event.event_type !== 'tournament' && event.is_home !== null && (
                    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                      event.is_home
                        ? 'border-green-500/30 bg-green-500/10 text-green-300'
                        : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                    }`}>
                      {event.is_home ? 'Home' : 'Away'}
                    </span>
                  )}
                  {event.meal_required && (
                    <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs text-amber-400">
                      🍽 Meal
                    </span>
                  )}
                </div>

                {/* Title */}
                <h3 className="text-base font-bold text-white mb-2">
                  {eventLabel(event)}
                </h3>

                {/* Time / location details */}
                <div className="flex flex-wrap items-center mb-2 text-sm text-slate-400">
                  {event.display_time && (
                    <span className="flex items-center gap-1.5 mr-4">
                      <span>🕐</span>
                      <span>{formatTime(event.display_time)}</span>
                    </span>
                  )}
                  {event.display_arrival && (
                    <span className="flex items-center gap-1.5 mr-4">
                      <span>📍</span>
                      <span>Arrive {formatTime(event.display_arrival)}</span>
                    </span>
                  )}
                  {event.location_name && (
                    <span className="flex items-center gap-1.5 mr-4">
                      <span>📌</span>
                      <span>{event.location_name}</span>
                    </span>
                  )}
                </div>

                {/* Address link */}
                {event.location_address && (
                  <a
                    href={`https://maps.google.com/?q=${encodeURIComponent(event.location_address)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-sky-400 hover:text-sky-300 transition-colors block mb-2"
                  >
                    {event.location_address} →
                  </a>
                )}

                {/* Uniform notes */}
                {event.uniform_notes && (
                  <div className="flex items-center gap-1.5 text-sm text-slate-400 mb-1.5">
                    <span>👕</span>
                    <span>{event.uniform_notes}</span>
                  </div>
                )}

                {/* Meal details */}
                {event.meal_required && (event.meal_time || event.meal_notes) && (
                  <div className="flex items-center gap-1.5 text-sm text-amber-400 mb-1.5">
                    <span>🍽</span>
                    <span>
                      {event.meal_time && `${formatTime(event.meal_time)}`}
                      {event.meal_time && event.meal_notes && ' · '}
                      {event.meal_notes}
                    </span>
                  </div>
                )}

                {/* Notes */}
                {event.notes && (
                  <p className="text-xs text-slate-500 mt-1.5 border-t border-white/5 pt-1.5">
                    {event.notes}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="mt-10 pt-6 border-t border-white/5 text-center">
          <p className="text-xs text-slate-600">
            Powered by{' '}
            <a href="https://sidelineopshq.com" className="text-slate-500 hover:text-slate-400 transition-colors">
              SidelineOps
            </a>
          </p>
        </div>
      </div>
    </main>
  )
}