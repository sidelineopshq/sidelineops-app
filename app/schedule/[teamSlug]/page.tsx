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

export default async function PublicSchedulePage({
  params,
}: {
  params: Promise<{ teamSlug: string }>
}) {
  const { teamSlug } = await params
  const supabase = await createClient()

  // Look up the team by slug
  const { data: team } = await supabase
    .from('teams')
    .select('id, name, slug, program_id')
    .eq('slug', teamSlug)
    .single()

  if (!team) notFound()

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

  // Fetch ALL public games and tournaments — no date filter
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
      status,
      event_team_details!inner(
        team_id,
        start_time
      )
    `)
    .eq('event_team_details.team_id', team.id)
    .in('event_type', ['game', 'tournament'])
    .eq('status', 'scheduled')
    .eq('is_public', true)
    .order('event_date', { ascending: true })

  const today = new Date().toISOString().split('T')[0]

  const events = (eventRows ?? []).map((row: any) => ({
    ...row,
    display_time: row.event_team_details?.[0]?.start_time || row.default_start_time,
    is_past: row.event_date < today,
    event_team_details: undefined,
  }))

  const upcomingCount = events.filter(e => !e.is_past).length
  const nextGame = events.find(e => !e.is_past) ?? null
  const publicUrl = `https://sidelineopshq.com/schedule/${teamSlug}`
  const calendarUrl = `/schedule/${teamSlug}/calendar.ics`

  return (
    <main className="min-h-screen bg-slate-950 text-white">

      {/* Header */}
      <div className="border-b border-white/10 bg-slate-900">
        <div className="mx-auto max-w-4xl px-6 py-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
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
            </div>

            {/* Calendar subscribe only — no team page link */}
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

        {/* Next Game card */}
        {nextGame && (
          <div className="mb-8 rounded-2xl border border-sky-500/30 bg-sky-500/10 px-6 py-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-sky-400 mb-3">
              Next Game
            </p>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-white">
                  {nextGame.event_type === 'tournament'
                    ? nextGame.title ?? 'Tournament'
                    : nextGame.opponent
                      ? `${nextGame.is_home ? 'vs' : '@'} ${nextGame.opponent}`
                      : 'TBD'
                  }
                </h2>
                <div className="flex flex-wrap items-center mt-2 text-sm text-slate-300">
                  <span className="flex items-center gap-1.5 mr-4">
                    <span>📅</span>
                    <span>{formatDate(nextGame.event_date)}</span>
                  </span>
                  {nextGame.display_time && (
                    <span className="flex items-center gap-1.5 mr-4">
                      <span>🕐</span>
                      <span>{formatTime(nextGame.display_time)}</span>
                    </span>
                  )}
                  {nextGame.location_name && (
                    <span className="flex items-center gap-1.5 mr-4">
                      <span>📍</span>
                      <span>{nextGame.location_name}</span>
                    </span>
                  )}
                </div>
                {nextGame.location_address && (
                  <a
                    href={`https://maps.google.com/?q=${encodeURIComponent(nextGame.location_address)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1.5 text-xs text-sky-400 hover:text-sky-300 transition-colors block"
                  >
                    {nextGame.location_address} →
                  </a>
                )}
              </div>
              {nextGame.event_type !== 'tournament' && nextGame.is_home !== null && (
                <span className={`shrink-0 rounded-xl border px-4 py-2 text-sm font-bold ${
                  nextGame.is_home
                    ? 'border-green-500/40 bg-green-500/15 text-green-300'
                    : 'border-amber-500/40 bg-amber-500/15 text-amber-300'
                }`}>
                  {nextGame.is_home ? '🏠 Home' : '🚌 Away'}
                </span>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold">Game Schedule</h2>
          <span className="text-sm text-slate-500">
            {upcomingCount} game{upcomingCount !== 1 ? 's' : ''} remaining
          </span>
        </div>

        {events.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-slate-900 p-10 text-center">
            <p className="text-slate-400 font-semibold">No games scheduled yet</p>
            <p className="text-slate-500 text-sm mt-1">Check back soon.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {events.map(event => (
              <div
                key={event.id}
                className={`rounded-2xl border px-5 py-4 transition-colors ${
                  event.is_past
                    ? 'border-white/5 bg-slate-900/50 opacity-50'
                    : 'border-white/10 bg-slate-900 hover:border-white/20'
                }`}
              >
                {/* Date row */}
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <p className="text-xs font-semibold text-slate-400">
                    {formatDate(event.event_date)}
                  </p>
                  {event.is_past && (
                    <span className="rounded-full border border-white/10 bg-slate-800 px-2 py-0.5 text-xs text-slate-500">
                      Final
                    </span>
                  )}
                  {event.is_tournament && (
                    <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-400">
                      Tournament
                    </span>
                  )}
                </div>

                {/* Title + details */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <h3 className={`text-base font-bold ${event.is_past ? 'text-slate-400' : 'text-white'}`}>
                      {event.event_type === 'tournament'
                        ? event.title ?? 'Tournament'
                        : event.opponent
                          ? `${event.is_home ? 'vs' : '@'} ${event.opponent}`
                          : 'TBD'
                      }
                    </h3>

                    <div className="flex flex-wrap items-center mt-1.5 text-sm text-slate-400">
                      {event.display_time && (
                        <span className="flex items-center gap-1.5 mr-4">
                          <span>🕐</span>
                          <span>{formatTime(event.display_time)}</span>
                        </span>
                      )}
                      {event.location_name && (
                        <span className="flex items-center gap-1.5 mr-4">
                          <span>📍</span>
                          <span>{event.location_name}</span>
                        </span>
                      )}
                    </div>

                    {event.location_address && !event.is_past && (
                      <a
                        href={`https://maps.google.com/?q=${encodeURIComponent(event.location_address)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 text-xs text-sky-400 hover:text-sky-300 transition-colors block"
                      >
                        {event.location_address} →
                      </a>
                    )}
                  </div>

                  {/* Home/Away badge */}
                  {event.event_type !== 'tournament' && event.is_home !== null && (
                    <span className={`shrink-0 rounded-xl border px-3 py-1 text-xs font-semibold ${
                      event.is_past
                        ? 'border-white/10 bg-slate-800 text-slate-500'
                        : event.is_home
                          ? 'border-green-500/30 bg-green-500/10 text-green-300'
                          : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                    }`}>
                      {event.is_home ? 'Home' : 'Away'}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="mt-10 pt-6 border-t border-white/5 text-center">
          <p className="text-xs text-slate-600">
            Powered by{' '}
            <a
              href="https://sidelineopshq.com"
              className="text-slate-500 hover:text-slate-400 transition-colors"
            >
              SidelineOps
            </a>
          </p>
        </div>
      </div>
    </main>
  )
}