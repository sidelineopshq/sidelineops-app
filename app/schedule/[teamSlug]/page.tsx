import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import PublicScheduleClient, {
  type PublicEvent,
  type PublicTeam,
  type PublicChildGame,
} from './PublicScheduleClient'

export default async function PublicSchedulePage({
  params,
}: {
  params: Promise<{ teamSlug: string }>
}) {
  const { teamSlug } = await params
  const supabase     = await createClient()

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

  // All teams in the same program — primary first, then alphabetical
  const { data: allTeamsData } = await supabase
    .from('teams')
    .select('id, name, slug, is_primary')
    .eq('program_id', team.program_id)
    .not('slug', 'is', null)
    .order('is_primary', { ascending: false })
    .order('name', { ascending: true })

  const allTeams: PublicTeam[] = (allTeamsData ?? []) as PublicTeam[]
  const allTeamIds   = allTeams.map(t => t.id)
  const primaryTeamId = allTeams.find(t => t.is_primary)?.id ?? allTeams[0]?.id ?? null

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })

  // Fetch events for any team in the program
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
    .in('event_team_details.team_id', allTeamIds.length > 0 ? allTeamIds : ['00000000-0000-0000-0000-000000000000'])
    .in('event_type', ['game', 'tournament'])
    .is('parent_event_id', null)
    .eq('status', 'scheduled')
    .eq('is_public', true)
    .order('event_date', { ascending: true })

  const eventIds = (eventRows ?? []).map((e: any) => e.id as string)

  // Fetch all team details for these events to build teamTimes
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

  // Build lookup: event_id → sorted teamTimes
  const teamTimesById: Record<string, PublicEvent['teamTimes']> = {}
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

  const allEvents: PublicEvent[] = (eventRows ?? []).map((row: any) => ({
    id:                 row.id,
    event_type:         row.event_type,
    title:              row.title,
    opponent:           row.opponent,
    is_home:            row.is_home,
    is_tournament:      row.is_tournament,
    location_name:      row.location_name,
    location_address:   row.location_address,
    event_date:         row.event_date,
    default_start_time: row.default_start_time,
    is_past:            row.event_date < today,
    teamTimes:          teamTimesById[row.id] ?? [],
  }))

  // Fetch child games for tournaments
  const tournamentIds = allEvents.filter(e => e.is_tournament).map(e => e.id)
  let childGames: PublicChildGame[] = []
  if (tournamentIds.length > 0) {
    const { data: childRows } = await supabase
      .from('events')
      .select('id, parent_event_id, opponent, location_name, event_date, default_start_time')
      .in('parent_event_id', tournamentIds)
      .eq('status', 'scheduled')
      .eq('is_public', true)
      .order('event_date', { ascending: true })
      .order('default_start_time', { ascending: true, nullsFirst: false })
    childGames = (childRows ?? []) as PublicChildGame[]
  }

  const calendarUrl   = `/schedule/${teamSlug}/calendar.ics`
  const otherTeams    = allTeams.filter(t => t.id !== team.id)

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
              {otherTeams.length > 0 && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
                  {otherTeams.map(t => (
                    <a
                      key={t.id}
                      href={`/schedule/${t.slug}`}
                      className="text-xs text-sky-400 hover:text-sky-300 transition-colors"
                    >
                      {t.name} Schedule →
                    </a>
                  ))}
                </div>
              )}
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
        <PublicScheduleClient
          events={allEvents}
          teams={allTeams}
          childGames={childGames}
          primaryTeamId={primaryTeamId}
        />

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
