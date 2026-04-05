import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import PublicScheduleClient, {
  type PublicEvent,
  type PublicTeam,
  type PublicChildGame,
} from './PublicScheduleClient'
import { formatProgramLabel, formatProgramLabelWithLevel, formatTeamShortLabel } from '@/lib/utils/team-label'

export default async function PublicSchedulePage({
  params,
}: {
  params: Promise<{ teamSlug: string }>
}) {
  const { teamSlug } = await params
  const supabase     = await createClient()

  const { data: team } = await supabase
    .from('teams')
    .select('id, name, level, slug, program_id, logo_url, primary_color, secondary_color')
    .eq('slug', teamSlug)
    .single()

  if (!team) notFound()

  const brandPrimary   = (team as any).primary_color   ?? '#1a3a5c'
  const brandSecondary = (team as any).secondary_color ?? '#c8a456'
  const teamLogoUrl    = (team as any).logo_url as string | null

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
    .select('id, name, level, slug, is_primary')
    .eq('program_id', team.program_id)
    .not('slug', 'is', null)
    .order('is_primary', { ascending: false })
    .order('name', { ascending: true })

  const allTeams: PublicTeam[] = (allTeamsData ?? []).map(t => ({
    id:         t.id,
    name:       formatTeamShortLabel((t as any).level ?? ''),
    slug:       t.slug,
    is_primary: t.is_primary,
  }))
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
    .gte('event_date', today)
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
    <main className="min-h-screen bg-gray-50">

      {/* Header */}
      <div className="bg-gray-50" style={{ borderBottom: `1px solid ${brandPrimary}4d` }}>
        <div className="mx-auto max-w-4xl px-6 py-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              {/* Dual logo row */}
              <div className="flex items-center gap-3 mb-3">
                <img
                  src="/sidelineops-logo-cropped.png"
                  alt="SidelineOps"
                  style={{ height: '40px', width: 'auto' }}
                />
                {teamLogoUrl && (
                  <>
                    <div className="w-px bg-slate-300" style={{ height: '32px' }} />
                    <img
                      src={teamLogoUrl}
                      alt={team.name}
                      style={{ height: '48px', maxHeight: '48px', width: 'auto', objectFit: 'contain' }}
                    />
                  </>
                )}
              </div>
              <h1 className="text-2xl font-bold text-slate-900">
                {formatProgramLabel(school?.name ?? '', program?.sport ?? '')}
              </h1>
              <p className="text-slate-500 text-sm mt-0.5">
                {formatProgramLabelWithLevel(school?.name ?? '', program?.sport ?? '', (team as any).level ?? '')} · {program?.season_year} Season
              </p>
              {school && (
                <p className="text-slate-400 text-xs mt-0.5">
                  {school.name} · {school.city}, {school.state}
                </p>
              )}
              {otherTeams.length > 0 && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
                  {otherTeams.map(t => (
                    <a
                      key={t.id}
                      href={`/schedule/${t.slug}`}
                      className="text-xs hover:underline transition-colors"
                      style={{ color: brandPrimary }}
                    >
                      {t.name} Schedule →
                    </a>
                  ))}
                </div>
              )}
            </div>
            <a
              href={calendarUrl}
              className="shrink-0 rounded-xl border bg-white hover:bg-gray-100 text-slate-600 px-4 py-2 text-sm font-semibold text-center transition-colors"
              style={{ borderColor: `${brandPrimary}4d` }}
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
          brandPrimary={brandPrimary}
          brandSecondary={brandSecondary}
        />

        {/* Footer */}
        <div className="mt-10 pt-6 border-t border-slate-200 text-center">
          <p className="text-xs text-slate-400">
            Powered by{' '}
            <a href="https://sidelineopshq.com" className="text-slate-500 hover:text-slate-700 transition-colors">
              SidelineOps
            </a>
          </p>
        </div>
      </div>
    </main>
  )
}
