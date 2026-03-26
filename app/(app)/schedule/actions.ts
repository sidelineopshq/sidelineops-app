'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceRoleClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'

function createServiceClient() {
  return createServiceRoleClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Cancels the entire event for all teams (sets events.status = 'cancelled')
export async function cancelEvent(eventId: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: teamUsers } = await supabase
    .from('team_users')
    .select('can_manage_events')
    .eq('user_id', user.id)

  if (!teamUsers?.some(t => t.can_manage_events)) {
    return { error: 'You do not have permission to cancel events.' }
  }

  const { error } = await supabase
    .from('events')
    .update({ status: 'cancelled' })
    .eq('id', eventId)

  if (error) {
    console.error('Cancel event error:', error)
    return { error: 'Failed to cancel event. Please try again.' }
  }

  return { success: true }
}

// Cancels the event for one specific team only (sets event_team_details.status = 'cancelled')
export async function cancelEventForTeam(eventId: string, teamId: string) {
  const authClient = await createClient()

  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/login')

  // Permission check — filters by both user_id and team_id, so .single() is safe
  const { data: teamUser } = await authClient
    .from('team_users')
    .select('can_manage_events')
    .eq('user_id', user.id)
    .eq('team_id', teamId)
    .single()

  if (!teamUser?.can_manage_events) {
    return { error: 'You do not have permission to cancel events for this team.' }
  }

  const supabase = createServiceClient()

  const { error } = await supabase
    .from('event_team_details')
    .update({ status: 'cancelled' })
    .eq('event_id', eventId)
    .eq('team_id', teamId)

  if (error) {
    console.error('Cancel event for team error:', error)
    return { error: 'Failed to cancel event. Please try again.' }
  }

  return { success: true }
}
