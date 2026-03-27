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

type TeamTime = { teamId: string; teamName: string; startTime: string | null }

export default async function TeamSchedulePage({
  params,
}: {
  params: Promise<{ teamSlug: string; token: string }>
}) {
  const { teamSlug, token } = await params
  const supabase = await createClient()

  const { data: team } = await supabase
    .from('teams')
    .select('id, name, slug, program_id, team_schedule_token')
    .eq('slug', teamSlug)
    .eq('team_schedule_token', token)
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

  // All teams in the same program — primary first, then alphabetical
  const { data: allTeamsData } = await supabase
    .from('teams')
    .select('id, name, slug, is_primary')
    .eq('program_id', team.program_id)
    .not('slug', 'is', null)
    .order('is_primary', { ascending: false })
    .order('name', { ascending: true })

  const allTeams = (allTeamsData ?? []) as { id: string; name: string; slug: string | null }[]
  const allTeamIds = allTeams.map(t => t.id)

  const today = new Date().toISOString().split('T')[0]

  // Fetch events for the current team only (players want their own schedule)
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
    .is('parent_event_id', null)
    .eq('status', 'scheduled')
    .eq('is_public', true)
    .gte('event_date', today)
    .order('event_date', { ascending: true })

  const eventIds = (eventRows ?? []).map((e: any) => e.id as string)

  // Fetch all program teams' details for these events (for cross-team badges)
  type TeamTimeRow = { event_id: string; team_id: string; start_time: string | null }
  let teamTimeRows: TeamTimeRow[] = []
  if (eventIds.length > 0 && allTeamIds.length > 0) {
    const { data: rows } = await supabase
      .from('event_team_details')
      .select('event_id, team_id, start_time')
      .in('event_id', eventIds)
      .in('team_id', allTeamIds)
    teamTimeRows = (rows ?? []) as TeamTimeRow[]
  }

  const teamTimesById: Record<string, TeamTime[]> = {}
  teamTimeRows.forEach(row => {
    const t = allTeams.find(t => t.id === row.team_id)
    if (!t) return
    if (!teamTimesById[row.event_id]) teamTimesById[row.event_id] = []
    teamTimesById[row.event_id].push({
      teamId:    row.team_id,
      teamName:  t.name,
      startTime: row.start_time,
    })
  })

  const events = (eventRows ?? []).map((row: any) => {
    const currentDetail = row.event_team_details?.[0]
    return {
      ...row,
      display_time:    currentDetail?.start_time   || row.default_start_time,
      display_arrival: currentDetail?.arrival_time || row.default_arrival_time,
      // Team badges exclude the current team (it's implied by the page context)
      teamTimes: (teamTimesById[row.id] ?? []).filter((t: TeamTime) => t.teamId !== team.id),
      event_team_details: undefined,
    }
  })

  // Fetch child games for tournaments
  const tournamentIds = events.filter(e => e.is_tournament).map(e => e.id)
  let childGames: any[] = []
  if (tournamentIds.length > 0) {
    const { data: childRows } = await supabase
      .from('events')
      .select('id, parent_event_id, opponent, location_name, event_date, default_start_time')
      .in('parent_event_id', tournamentIds)
      .eq('status', 'scheduled')
      .order('event_date', { ascending: true })
      .order('default_start_time', { ascending: true, nullsFirst: false })
    childGames = childRows ?? []
  }

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
            {events.map((event: any) => {
              const games = childGames.filter(g => g.parent_event_id === event.id)
              return (
                <div
                  key={event.id}
                  className="rounded-2xl border border-white/10 bg-slate-900 px-5 py-4 hover:border-white/20 transition-colors"
                >
                  {/* Date + type badge + home/away + sibling team badges */}
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
                    {event.teamTimes.map((tt: TeamTime) => (
                      <span
                        key={tt.teamId}
                        className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-0.5 text-xs font-medium text-violet-400"
                      >
                        {tt.teamName}{tt.startTime ? ` · ${formatTime(tt.startTime)}` : ''}
                      </span>
                    ))}
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

                  {event.uniform_notes && (
                    <div className="flex items-center gap-1.5 text-sm text-slate-400 mb-1.5">
                      <span>👕</span>
                      <span>{event.uniform_notes}</span>
                    </div>
                  )}

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

                  {event.notes && (
                    <p className="text-xs text-slate-500 mt-1.5 border-t border-white/5 pt-1.5">
                      {event.notes}
                    </p>
                  )}

                  {/* Tournament child games */}
                  {event.is_tournament && games.length > 0 && (
                    <div className="mt-3 ml-2 space-y-1.5 border-l-2 border-amber-500/30 pl-4">
                      {games.map((game: any) => (
                        <div key={game.id} className="flex flex-wrap items-center gap-x-3 text-sm text-slate-300">
                          <span className="font-medium">
                            {game.opponent ? `vs ${game.opponent}` : 'TBD'}
                          </span>
                          {game.default_start_time && (
                            <span className="text-slate-400">{formatTime(game.default_start_time)}</span>
                          )}
                          {game.location_name && (
                            <span className="text-slate-500">· {game.location_name}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
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
