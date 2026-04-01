import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient2 } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { VolunteerDashboardClient } from './VolunteerDashboardClient'
import type { HomeGame, SeasonEvent, DashboardContact } from './VolunteerDashboardClient'

export const metadata = { title: 'Volunteers' }

function serviceClient() {
  return createServiceClient2(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export default async function VolunteersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: teamUsersRaw } = await supabase
    .from('team_users')
    .select('team_id, role, can_manage_volunteers, can_manage_events')
    .eq('user_id', user.id)

  const teamIds = (teamUsersRaw ?? []).map(t => t.team_id)
  if (teamIds.length === 0) redirect('/dashboard')

  const canManageVolunteers = teamUsersRaw?.some(t => t.can_manage_volunteers) ?? false
  const isAdmin             = teamUsersRaw?.some(t => t.role === 'admin')       ?? false
  const isVolunteerAdmin    = teamUsersRaw?.some(t => t.role === 'volunteer_admin') ?? false

  if (!canManageVolunteers && !isAdmin && !isVolunteerAdmin) redirect('/dashboard')

  const canManage = canManageVolunteers || isAdmin

  const { data: teamsRaw } = await supabase
    .from('teams')
    .select('id, name, level, is_primary, program_id, slug, volunteer_signup_token, programs(sport, schools(name))')
    .in('id', teamIds)
    .order('is_primary', { ascending: false })
    .order('name',        { ascending: true  })

  const teams     = teamsRaw ?? []
  const programId = teams[0]?.program_id ?? ''
  if (!programId) redirect('/dashboard')

  const primaryTeam   = teams[0]
  const teamSlug      = (primaryTeam as any).slug                   ?? null
  const signupToken   = (primaryTeam as any).volunteer_signup_token ?? null
  const primaryTeamId = primaryTeam.id
  const allTeamIds    = teams.map(t => t.id)

  const { data: program } = await supabase
    .from('programs')
    .select('name, sport')
    .eq('id', programId)
    .single()

  const svc   = serviceClient()
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })

  // Event-team lookup
  const { data: etdRows } = await svc
    .from('event_team_details')
    .select('event_id, team_id, start_time')
    .in('team_id', allTeamIds)

  const etdByEventId = new Map<string, { team_id: string; start_time: string | null }[]>()
  for (const row of etdRows ?? []) {
    if (!etdByEventId.has(row.event_id)) etdByEventId.set(row.event_id, [])
    etdByEventId.get(row.event_id)!.push({ team_id: row.team_id, start_time: row.start_time ?? null })
  }
  const allEventIds = [...etdByEventId.keys()]

  // Full season events (for table)
  const { data: seasonEventsRaw } = allEventIds.length > 0
    ? await svc
        .from('events')
        .select('id, event_date, opponent, title, is_home, status')
        .in('id', allEventIds)
        .order('event_date', { ascending: true })
    : { data: [] }

  // Upcoming home games
  const { data: upcomingEventsRaw } = allEventIds.length > 0
    ? await svc
        .from('events')
        .select('id, event_date, opponent, title, location_name')
        .in('id', allEventIds)
        .eq('is_home',  true)
        .eq('status',   'scheduled')
        .gte('event_date', today)
        .order('event_date', { ascending: true })
        .limit(12)
    : { data: [] }

  // Slots + assignments for upcoming games
  const upcomingEventIds = (upcomingEventsRaw ?? []).map(e => e.id)
  let homeGames: HomeGame[] = []

  if (upcomingEventIds.length > 0) {
    const { data: slotsRaw } = await svc
      .from('event_volunteer_slots')
      .select('id, event_id, volunteer_role_id, slot_count, start_time, end_time, notes, volunteer_roles!volunteer_role_id(name)')
      .in('event_id', upcomingEventIds)

    const slotIds = (slotsRaw ?? []).map(s => s.id)

    const { data: assignmentsRaw } = slotIds.length > 0
      ? await svc
          .from('volunteer_assignments')
          .select('id, event_volunteer_slot_id, volunteer_name, volunteer_email, contact_id, status')
          .in('event_volunteer_slot_id', slotIds)
          .neq('status', 'cancelled')
      : { data: [] }

    const assignmentsBySlot = new Map<string, any[]>()
    for (const a of assignmentsRaw ?? []) {
      if (!assignmentsBySlot.has(a.event_volunteer_slot_id))
        assignmentsBySlot.set(a.event_volunteer_slot_id, [])
      assignmentsBySlot.get(a.event_volunteer_slot_id)!.push(a)
    }

    const slotsByEvent = new Map<string, any[]>()
    for (const s of slotsRaw ?? []) {
      if (!slotsByEvent.has(s.event_id)) slotsByEvent.set(s.event_id, [])
      slotsByEvent.get(s.event_id)!.push(s)
    }

    homeGames = (upcomingEventsRaw ?? []).map(event => {
      const etdList   = etdByEventId.get(event.id) ?? []
      const startTime = etdList.find(e => allTeamIds.includes(e.team_id))?.start_time ?? null

      const slots = (slotsByEvent.get(event.id) ?? []).map(s => ({
        id:                s.id,
        volunteer_role_id: s.volunteer_role_id,
        role_name:         (s.volunteer_roles as any)?.name ?? 'Volunteer',
        slot_count:  s.slot_count,
        start_time:  s.start_time  ?? null,
        end_time:    s.end_time    ?? null,
        notes:       s.notes       ?? null,
        assignments: (assignmentsBySlot.get(s.id) ?? []).map((a: any) => ({
          id:              a.id,
          volunteer_name:  a.volunteer_name,
          volunteer_email: a.volunteer_email ?? null,
          contact_id:      a.contact_id      ?? null,
          status:          a.status,
        })),
      }))

      return {
        id:            event.id,
        event_date:    event.event_date,
        opponent:      event.opponent      ?? null,
        title:         event.title         ?? null,
        location_name: event.location_name ?? null,
        start_time:    startTime,
        slots,
      } satisfies HomeGame
    })
  }

  const seasonEvents: SeasonEvent[] = (seasonEventsRaw ?? []).map(e => {
    const etdList   = etdByEventId.get(e.id) ?? []
    const startTime = etdList.find(et => allTeamIds.includes(et.team_id))?.start_time ?? null
    return {
      id:         e.id,
      event_date: e.event_date,
      label:      e.opponent ?? e.title ?? 'Game',
      is_home:    e.is_home  ?? false,
      status:     e.status,
      start_time: startTime,
    } satisfies SeasonEvent
  })

  // Contacts for assign modal
  const { data: contactsRaw } = await svc
    .from('contacts')
    .select('id, first_name, last_name, email')
    .in('team_id', allTeamIds)
    .is('deleted_at', null)
    .order('last_name',  { ascending: true })
    .order('first_name', { ascending: true })

  const contacts: DashboardContact[] = (contactsRaw ?? []).map(c => ({
    id:         c.id,
    first_name: c.first_name,
    last_name:  c.last_name ?? null,
    email:      c.email     ?? null,
  }))

  return (
    <VolunteerDashboardClient
      programId={programId}
      primaryTeamId={primaryTeamId}
      teamSlug={teamSlug}
      signupToken={signupToken}
      programName={program?.name ?? ''}
      canManage={canManage}
      homeGames={homeGames}
      seasonEvents={seasonEvents}
      contacts={contacts}
    />
  )
}
