import { createClient } from '@/lib/supabase/server'
import { createClient as createSvcClient } from '@supabase/supabase-js'
import { redirect, notFound } from 'next/navigation'
import EditEventForm from './EditEventForm'
import { formatTeamShortLabel } from '@/lib/utils/team-label'

function serviceClient() {
  return createSvcClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Get all team memberships (multi-team safe)
  const { data: teamUsersRaw } = await supabase
    .from('team_users')
    .select('team_id, role, can_manage_events, can_manage_meals')
    .eq('user_id', user.id)

  const canManageEvents    = (teamUsersRaw ?? []).some(t => t.can_manage_events)
  const isMealCoordinator  = !canManageEvents &&
    (teamUsersRaw ?? []).some(t => (t as any).can_manage_meals || t.role === 'meal_coordinator')

  if (!canManageEvents && !isMealCoordinator) redirect('/schedule')

  const teamIds = (teamUsersRaw ?? []).map(t => t.team_id)

  // Fetch the event
  const { data: event } = await supabase
    .from('events')
    .select(`
      id, title, event_type, opponent, is_home, is_tournament,
      location_name, location_address, event_date,
      default_start_time, default_arrival_time, default_end_time,
      status, notes, uniform_notes, meal_required, meal_notes, meal_time,
      is_public, program_id
    `)
    .eq('id', id)
    .single()

  if (!event) notFound()

  // Fetch all teams this coach manages — primary first
  const { data: teamsData } = await supabase
    .from('teams')
    .select('id, name, level, programs(sport, schools(name))')
    .in('id', teamIds)
    .order('is_primary', { ascending: false })
    .order('name', { ascending: true })

  // Fetch all existing team assignments for this event (for teams this coach manages)
  const { data: allTeamDetails } = await supabase
    .from('event_team_details')
    .select('team_id, start_time, arrival_time, end_time, status')
    .eq('event_id', id)
    .in('team_id', teamIds)

  const teams = (teamsData ?? []).map(t => ({
    id:   t.id,
    name: formatTeamShortLabel((t as any).level ?? ''),
  }))

  const svc = serviceClient()
  const [{ data: rolesRaw }, { data: existingSlotsRaw }] = await Promise.all([
    svc
      .from('volunteer_roles')
      .select('id, name')
      .eq('program_id', event.program_id)
      .eq('is_active', true)
      .order('name', { ascending: true }),
    svc
      .from('event_volunteer_slots')
      .select('id, volunteer_role_id, slot_count, start_time, end_time, notes')
      .eq('event_id', id)
      .order('created_at', { ascending: true }),
  ])

  const volunteerRoles   = (rolesRaw ?? []) as { id: string; name: string }[]
  const existingSlots    = (existingSlotsRaw ?? []).map(s => ({
    id:                s.id,
    volunteer_role_id: s.volunteer_role_id,
    slot_count:        s.slot_count,
    start_time: s.start_time ?? '',
    end_time:   s.end_time   ?? '',
    notes:      s.notes      ?? '',
  }))

  return (
    <EditEventForm
      event={event}
      teams={teams}
      allTeamDetails={allTeamDetails ?? []}
      volunteerRoles={volunteerRoles}
      existingSlots={existingSlots}
      isMealCoordinator={isMealCoordinator}
    />
  )
}
