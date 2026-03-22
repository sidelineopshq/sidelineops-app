'use server'

import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'

// Service role client — bypasses RLS for writes.
// Safe to use here because we manually verify auth and permissions
// before any database write. Never use in client components.
function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function addTournamentGame(formData: {
  parent_event_id: string
  opponent?: string
  start_time?: string
  location_name?: string
  event_date: string
  team_id: string
}) {
  // Step 1: Auth check
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/login')

  // Step 2: Permission check
  const { data: teamUser } = await authClient
    .from('team_users')
    .select('can_manage_events')
    .eq('user_id', user.id)
    .eq('team_id', formData.team_id)
    .single()

  if (!teamUser?.can_manage_events) {
    return { error: 'You do not have permission to add games.' }
  }

  // Step 3: Look up program_id server-side — never trust client to pass this
  const { data: teamData } = await authClient
    .from('teams')
    .select('program_id')
    .eq('id', formData.team_id)
    .single()

  if (!teamData?.program_id) {
    return { error: 'Could not determine program for this team.' }
  }

  // Step 4: Write with service role (RLS bypassed — permission verified above)
  const supabase = createServiceClient()

  const { data: event, error: eventError } = await supabase
    .from('events')
    .insert({
      program_id:          teamData.program_id,
      parent_event_id:     formData.parent_event_id,
      is_tournament:       false,
      event_type:          'game',
      opponent:            formData.opponent || null,
      event_date:          formData.event_date,
      default_start_time:  formData.start_time || null,
      location_name:       formData.location_name || null,
      status:              'scheduled',
      is_public:           true,
      created_by_user_id:  user.id,
    })
    .select('id')
    .single()

  if (eventError || !event) {
    console.error('Add tournament game error:', eventError)
    return { error: 'Failed to add game. Please try again.' }
  }

  // Step 5: Link to team
  const { error: detailsError } = await supabase
    .from('event_team_details')
    .insert({
      event_id:   event.id,
      team_id:    formData.team_id,
      start_time: formData.start_time || null,
    })

  if (detailsError) {
    console.error('Tournament game team details error:', detailsError)
  }

  return { success: true, eventId: event.id }
}

export async function deleteTournamentGame(eventId: string, teamId: string) {
  // Step 1: Auth check
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/login')

  // Step 2: Permission check
  const { data: teamUser } = await authClient
    .from('team_users')
    .select('can_manage_events')
    .eq('user_id', user.id)
    .eq('team_id', teamId)
    .single()

  if (!teamUser?.can_manage_events) {
    return { error: 'You do not have permission to delete games.' }
  }

  // Step 3: Delete with service role
  const supabase = createServiceClient()

  const { error } = await supabase
    .from('events')
    .delete()
    .eq('id', eventId)

  if (error) {
    console.error('Delete tournament game error:', error)
    return { error: 'Failed to delete game.' }
  }

  return { success: true }
}