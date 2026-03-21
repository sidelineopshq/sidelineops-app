'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function updateEvent(eventId: string, formData: {
  event_type: string
  event_date: string
  opponent?: string
  is_home?: boolean
  location_name?: string
  location_address?: string
  default_start_time?: string
  default_arrival_time?: string
  default_end_time?: string
  status: string
  notes?: string
  uniform_notes?: string
  is_tournament: boolean
  title?: string
  meal_required: boolean
  meal_notes?: string
  meal_time?: string
  is_public: boolean
}, teamId: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Verify permission
  const { data: teamUser } = await supabase
    .from('team_users')
    .select('can_manage_events')
    .eq('user_id', user.id)
    .eq('team_id', teamId)
    .single()

  if (!teamUser?.can_manage_events) {
    return { error: 'You do not have permission to edit events.' }
  }

  // Build title for non-game types
  let title = formData.title || null
  if (formData.event_type === 'practice') title = 'Practice'
  if (formData.event_type === 'meeting')  title = 'Team Meeting'
  if (formData.event_type === 'tournament' && !title) title = 'Tournament'

  // Update the event
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
      default_start_time:   formData.default_start_time || null,
      default_arrival_time: formData.default_arrival_time || null,
      default_end_time:     formData.default_end_time || null,
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

  // Update event_team_details
  const { error: detailsError } = await supabase
    .from('event_team_details')
    .update({
      start_time:   formData.default_start_time || null,
      arrival_time: formData.default_arrival_time || null,
      end_time:     formData.default_end_time || null,
    })
    .eq('event_id', eventId)
    .eq('team_id', teamId)

  if (detailsError) {
    console.error('Update team details error:', detailsError)
  }

  redirect('/schedule')
}

export async function deleteEvent(eventId: string, teamId: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Verify permission
  const { data: teamUser } = await supabase
    .from('team_users')
    .select('can_manage_events')
    .eq('user_id', user.id)
    .eq('team_id', teamId)
    .single()

  if (!teamUser?.can_manage_events) {
    return { error: 'You do not have permission to delete events.' }
  }

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