import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import { formatProgramLabel, formatTeamShortLabel } from '@/lib/utils/team-label'
import VolunteerSignupClient, { type PublicEvent, type PublicSlot } from './VolunteerSignupClient'

export const metadata = { title: 'Volunteer Sign-Up' }

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export default async function VolunteerSignupPage({
  params,
}: {
  params: Promise<{ teamSlug: string }>
}) {
  const { teamSlug } = await params
  const svc = serviceClient()

  const { data: team } = await svc
    .from('teams')
    .select('id, name, level, slug, program_id, logo_url, primary_color, secondary_color')
    .eq('slug', teamSlug)
    .single()

  if (!team) notFound()

  const brandPrimary   = (team as any).primary_color   ?? '#1a3a5c'
  const brandSecondary = (team as any).secondary_color ?? '#c8a456'

  const { data: program } = await svc
    .from('programs')
    .select('name, sport, school_id')
    .eq('id', team.program_id)
    .single()

  const { data: school } = program?.school_id
    ? await svc
        .from('schools')
        .select('name')
        .eq('id', program.school_id)
        .single()
    : { data: null }

  // Fetch ALL teams in this program
  const { data: programTeams } = await svc
    .from('teams')
    .select('id, level')
    .eq('program_id', team.program_id)

  const allTeamIds = (programTeams ?? []).map(t => t.id)
  const teamLevelById = Object.fromEntries(
    (programTeams ?? []).map(t => [t.id, (t as any).level ?? ''])
  )

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })

  // Fetch event_team_details for all program teams to get all event IDs + start times
  const { data: etdRows } = allTeamIds.length > 0
    ? await svc
        .from('event_team_details')
        .select('event_id, team_id, start_time')
        .in('team_id', allTeamIds)
    : { data: [] }

  const etdByEventId = new Map<string, { team_id: string; start_time: string | null }[]>()
  for (const row of etdRows ?? []) {
    if (!etdByEventId.has(row.event_id)) etdByEventId.set(row.event_id, [])
    etdByEventId.get(row.event_id)!.push({ team_id: row.team_id, start_time: row.start_time ?? null })
  }
  const allEventIds = [...etdByEventId.keys()]

  // Fetch upcoming home events across all program teams
  const { data: eventRows } = allEventIds.length > 0
    ? await svc
        .from('events')
        .select('id, event_date, event_type, title, opponent, is_home, location_name, location_address, status')
        .in('id', allEventIds)
        .eq('is_home', true)
        .gte('event_date', today)
        .neq('status', 'cancelled')
        .is('parent_event_id', null)
        .order('event_date', { ascending: true })
    : { data: [] }

  const eventIds = (eventRows ?? []).map((e: any) => e.id as string)

  // Fetch all volunteer slots for these events (with assignment counts)
  let slotRows: any[] = []
  if (eventIds.length > 0) {
    const { data: rows } = await svc
      .from('event_volunteer_slots')
      .select(`
        id, event_id, slot_count, start_time, end_time, notes,
        volunteer_roles(name),
        volunteer_assignments(id, status)
      `)
      .in('event_id', eventIds)
      .order('created_at', { ascending: true })
    slotRows = rows ?? []
  }

  // Build event list, filtering out events with no open slots
  const events: PublicEvent[] = []
  for (const row of eventRows ?? []) {
    const etdList = etdByEventId.get(row.id) ?? []

    // Use the earliest start_time across all teams for this event
    const startTime = etdList
      .map(e => e.start_time)
      .filter(Boolean)
      .sort()[0] ?? null

    // Build team labels (e.g. "Varsity", "JV") for all teams on this event
    const teamLabels = [...new Set(
      etdList
        .map(e => formatTeamShortLabel(teamLevelById[e.team_id] ?? ''))
        .filter(Boolean)
    )]

    const allSlots: PublicSlot[] = slotRows
      .filter(s => s.event_id === row.id)
      .map(s => {
        const assignments = (s.volunteer_assignments ?? []) as Array<{ id: string; status: string }>
        const filled      = assignments.filter(a => a.status !== 'cancelled').length
        return {
          id:         s.id as string,
          role_name:  (s.volunteer_roles as any)?.name ?? 'Volunteer',
          slot_count: s.slot_count as number,
          start_time: s.start_time as string | null,
          end_time:   s.end_time   as string | null,
          notes:      s.notes      as string | null,
          filled,
        }
      })

    const totalOpen  = allSlots.reduce((sum, s) => sum + Math.max(0, s.slot_count - s.filled), 0)
    const totalSlots = allSlots.reduce((sum, s) => sum + s.slot_count, 0)

    // Skip events with no open slots
    if (totalOpen === 0 || allSlots.length === 0) continue

    events.push({
      id:               row.id as string,
      event_date:       (row as any).event_date as string,
      event_type:       (row as any).event_type as string,
      title:            (row as any).title      as string | null,
      opponent:         (row as any).opponent   as string | null,
      is_home:          (row as any).is_home    as boolean | null,
      location_name:    (row as any).location_name    as string | null,
      location_address: (row as any).location_address as string | null,
      start_time:       startTime as string | null,
      team_labels:      teamLabels,
      slots:            allSlots,
      totalOpen,
      totalSlots,
    })
  }

  const teamLabel = formatProgramLabel(school?.name ?? '', program?.sport ?? '')

  return (
    <main className="min-h-screen bg-gray-50">

      {/* Header */}
      <div className="bg-gray-50" style={{ borderBottom: `1px solid ${brandPrimary}4d` }}>
        <div className="mx-auto max-w-3xl px-6 py-5">
          <div className="flex items-center gap-3 mb-3">
            <img
              src="/sidelineops-logo-cropped.png"
              alt="SidelineOps"
              style={{ height: '40px', width: 'auto' }}
            />
            {(team as any).logo_url && (
              <>
                <div className="w-px bg-slate-300" style={{ height: '32px' }} />
                <img
                  src={(team as any).logo_url}
                  alt={team.name}
                  style={{ height: '48px', maxHeight: '48px', width: 'auto', objectFit: 'contain' }}
                />
              </>
            )}
          </div>
          <h1 className="text-2xl font-bold text-slate-900">
            {teamLabel || `${school?.name ?? ''} ${program?.sport ?? ''}`} — Volunteer Sign-Up
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Select the games and roles you'd like to volunteer for this season
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-6 py-8">
        <VolunteerSignupClient
          events={events}
          programId={team.program_id}
          teamId={team.id}
          schoolName={school?.name ?? ''}
          sportName={program?.sport ?? ''}
          brandPrimary={brandPrimary}
          brandSecondary={brandSecondary}
        />

        <div className="mt-10 pt-6 border-t border-slate-200 text-center space-y-1">
          <p className="text-xs text-slate-400">
            Powered by{' '}
            <a href="https://sidelineopshq.com" className="text-slate-500 hover:text-slate-700 transition-colors">
              SidelineOps
            </a>
          </p>
          <a
            href="?feedback=true"
            className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            Report a problem
          </a>
        </div>
      </div>

    </main>
  )
}
