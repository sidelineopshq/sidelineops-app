'use server'

import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function updateEvent(
  eventId: string,
  formData: {
    event_type: string
    event_date: string
    opponent?: string
    is_home?: boolean
    location_name?: string
    location_address?: string
    status: string
    notes?: string
    uniform_notes?: string
    is_tournament: boolean
    title?: string
    meal_required: boolean
    meal_notes?: string
    meal_time?: string
    is_public: boolean
  },
  teamAssignments: {
    team_id: string
    start_time?: string
    arrival_time?: string
    end_time?: string
    status: string
  }[]
) {
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/login')

  if (!teamAssignments?.length) {
    return { error: 'At least one team assignment is required.' }
  }

  // Verify user has can_manage_events on at least one of the assigned teams
  const assignedTeamIds = teamAssignments.map(a => a.team_id)

  const { data: teamUsers } = await authClient
    .from('team_users')
    .select('team_id, can_manage_events')
    .eq('user_id', user.id)
    .in('team_id', assignedTeamIds)

  if (!teamUsers?.some(t => t.can_manage_events)) {
    return { error: 'You do not have permission to edit this event.' }
  }

  let title = formData.title || null
  if (formData.event_type === 'practice')               title = 'Practice'
  if (formData.event_type === 'meeting')                title = 'Team Meeting'
  if (formData.event_type === 'tournament' && !title)   title = 'Tournament'

  const supabase = createServiceClient()

  // Use first assignment's times as the event-level defaults (for public/external views)
  const first = teamAssignments[0]

  const { error: eventError } = await supabase
    .from('events')
    .update({
      event_type:           formData.event_type,
      title,
      opponent:             formData.opponent || null,
      is_home:              formData.is_home ?? null,
      location_name:        formData.location_name || null,
      location_address:     formData.location_address || null,
      event_date:           formData.event_date,
      default_start_time:   first.start_time   || null,
      default_arrival_time: first.arrival_time || null,
      default_end_time:     first.end_time     || null,
      status:               formData.status,
      notes:                formData.notes || null,
      uniform_notes:        formData.uniform_notes || null,
      is_tournament:        formData.is_tournament,
      meal_required:        formData.meal_required,
      meal_notes:           formData.meal_notes || null,
      meal_time:            formData.meal_time || null,
      is_public:            formData.is_public,
    })
    .eq('id', eventId)

  if (eventError) {
    console.error('Update event error:', eventError)
    return { error: 'Failed to update event. Please try again.' }
  }

  // Upsert team assignments — inserts new rows and updates existing ones
  const { error: detailsError } = await supabase
    .from('event_team_details')
    .upsert(
      teamAssignments.map(a => ({
        event_id:             eventId,
        team_id:              a.team_id,
        start_time:           a.start_time   || null,
        arrival_time:         a.arrival_time || null,
        end_time:             a.end_time     || null,
        status:               a.status,
        notification_enabled: true,
      })),
      { onConflict: 'event_id,team_id' }
    )

  if (detailsError) {
    console.error('Update team details error:', detailsError)
  }

  redirect('/schedule')
}

export async function deleteEvent(eventId: string, teamId: string) {
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/login')

  const { data: teamUser } = await authClient
    .from('team_users')
    .select('can_manage_events')
    .eq('user_id', user.id)
    .eq('team_id', teamId)
    .single()

  if (!teamUser?.can_manage_events) {
    return { error: 'You do not have permission to delete events.' }
  }

  const supabase = createServiceClient()

  const { error } = await supabase
    .from('events')
    .delete()
    .eq('id', eventId)

  if (error) {
    console.error('Delete event error:', error)
    return { error: 'Failed to delete event. Please try again.' }
  }

  redirect('/schedule')
}
