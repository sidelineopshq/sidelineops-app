import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import EditEventForm from './EditEventForm'

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Get user's team permissions
  const { data: teamUser } = await supabase
    .from('team_users')
    .select('team_id, can_manage_events')
    .eq('user_id', user.id)
    .single()

  if (!teamUser?.can_manage_events) redirect('/schedule')

  // Fetch the event
  const { data: event } = await supabase
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
      default_end_time,
      status,
      notes,
      uniform_notes,
      meal_required,
      meal_notes,
      meal_time,
      is_public,
      program_id
    `)
    .eq('id', id)
    .single()

  if (!event) notFound()

  // Fetch team-specific times
  const { data: teamDetails } = await supabase
    .from('event_team_details')
    .select('start_time, arrival_time, end_time, team_notes')
    .eq('event_id', id)
    .eq('team_id', teamUser.team_id)
    .single()

  return (
    <EditEventForm
      event={event}
      teamDetails={teamDetails}
      teamId={teamUser.team_id}
    />
  )
}