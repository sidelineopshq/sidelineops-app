import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import EditEventForm from './EditEventForm'
import { formatTeamLabel } from '@/lib/utils/team-label'

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Get all team memberships (multi-team safe)
  const { data: teamUsersRaw } = await supabase
    .from('team_users')
    .select('team_id, can_manage_events')
    .eq('user_id', user.id)

  const teamUser = teamUsersRaw?.find(t => t.can_manage_events) ?? teamUsersRaw?.[0]
  if (!teamUser?.can_manage_events) redirect('/schedule')

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
    name: formatTeamLabel(
      (t as any).programs?.schools?.name ?? '',
      (t as any).level ?? '',
      (t as any).programs?.sport ?? '',
    ),
  }))

  return (
    <EditEventForm
      event={event}
      teams={teams}
      allTeamDetails={allTeamDetails ?? []}
    />
  )
}
