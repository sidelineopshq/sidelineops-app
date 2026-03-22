'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function cancelEvent(eventId: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Verify the user has permission to manage this event
  const { data: teamUser } = await supabase
    .from('team_users')
    .select('can_manage_events')
    .eq('user_id', user.id)
    .single()

  if (!teamUser?.can_manage_events) {
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
