'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function createEvent(formData: {
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
  meal_required: boolean
  meal_notes?: string
  meal_time?: string
  is_public: boolean
  title?: string
}) {
  const supabase = await createClient()

  // Auth check
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Get the user's team and program
  const { data: teamUser, error: teamError } = await supabase
    .from('team_users')
    .select('team_id, can_manage_events, team:teams(program_id)')
    .eq('user_id', user.id)
    .single()

  if (teamError || !teamUser) {
    return { error: 'Could not find your team assignment.' }
  }

  if (!teamUser.can_manage_events) {
    return { error: 'You do not have permission to create events.' }
  }

  const team = teamUser.team as any
  const programId = team?.program_id

  if (!programId) {
    return { error: 'Could not determine program. Please contact support.' }
  }

  // Build the event title for practices/meetings
  let title = formData.title || null
  if (formData.event_type === 'practice') title = 'Practice'
  if (formData.event_type === 'meeting') title = 'Team Meeting'
  if (formData.event_type === 'tournament' && !title) title = 'Tournament'

  // Insert the event
  const { data: event, error: eventError } = await supabase
    .from('events')
    .insert({
      program_id: programId,
      event_type: formData.event_type,
      title,
      opponent: formData.opponent || null,
      is_home: formData.is_home ?? null,
      location_name: formData.location_name || null,
      location_address: formData.location_address || null,
      event_date: formData.event_date,
      default_start_time: formData.default_start_time || null,
      default_arrival_time: formData.default_arrival_time || null,
      default_end_time: formData.default_end_time || null,
      status: formData.status,
      notes: formData.notes || null,
      uniform_notes: formData.uniform_notes || null,
      is_tournament: formData.is_tournament,
      meal_required: formData.meal_required,
      meal_notes: formData.meal_notes || null,
      meal_time: formData.meal_time || null,
      is_public: formData.is_public,
      created_by_user_id: user.id,
    })
    .select('id')
    .single()

  if (eventError || !event) {
    console.error('Event insert error:', eventError)
    return { error: 'Failed to save event. Please try again.' }
  }

  // Insert event_team_details to link event to team
  const { error: detailsError } = await supabase
    .from('event_team_details')
    .insert({
      event_id: event.id,
      team_id: teamUser.team_id,
      start_time: formData.default_start_time || null,
      arrival_time: formData.default_arrival_time || null,
      end_time: formData.default_end_time || null,
      notification_enabled: true,
    })

  if (detailsError) {
    console.error('Event team details error:', detailsError)
    // Event was created — don't block the user, but log it
  }

  redirect('/schedule')
}