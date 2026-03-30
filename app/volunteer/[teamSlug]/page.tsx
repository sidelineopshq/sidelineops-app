import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import { formatTeamLabel } from '@/lib/utils/team-label'
import VolunteerSignupClient, { type PublicEvent, type PublicSlot } from './VolunteerSignupClient'

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

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })

  // Fetch upcoming scheduled home events for this team
  const { data: eventRows } = await svc
    .from('events')
    .select(`
      id, event_date, event_type, title, opponent, is_home,
      location_name, location_address,
      event_team_details!inner(team_id, start_time)
    `)
    .eq('event_team_details.team_id', team.id)
    .eq('is_home', true)
    .gte('event_date', today)
    .eq('status', 'scheduled')
    .order('event_date', { ascending: true })

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
    const detailRow = ((row as any).event_team_details as any[])?.[0]
    const startTime = (detailRow?.start_time ?? null) as string | null

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

    // Skip events with no open slots at all
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
      start_time:       startTime,
      slots:            allSlots,
      totalOpen,
      totalSlots,
    })
  }

  const teamLabel = formatTeamLabel(
    school?.name ?? '',
    (team as any).level ?? '',
    program?.sport ?? '',
  )

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
            {teamLabel} — Volunteer Sign-Up
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
