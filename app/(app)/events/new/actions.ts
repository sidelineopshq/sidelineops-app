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
  // Step 1: Auth check
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/login')

  // Step 2: Permission check + team lookup
  const { data: teamUser, error: teamError } = await authClient
    .from('team_users')
    .select('team_id, can_manage_events')
    .eq('user_id', user.id)
    .single()

  if (teamError || !teamUser) {
    return { error: 'Could not find your team assignment.' }
  }

  if (!teamUser.can_manage_events) {
    return { error: 'You do not have permission to create events.' }
  }

  // Step 3: Look up program_id server-side
  const { data: teamData } = await authClient
    .from('teams')
    .select('program_id')
    .eq('id', teamUser.team_id)
    .single()

  if (!teamData?.program_id) {
    return { error: 'Could not determine program. Please contact support.' }
  }

  // Build title for non-game types
  let title = formData.title || null
  if (formData.event_type === 'practice')                  title = 'Practice'
  if (formData.event_type === 'meeting')                   title = 'Team Meeting'
  if (formData.event_type === 'tournament' && !title)      title = 'Tournament'

  // Step 4: Write with service role
  const supabase = createServiceClient()

  const { data: event, error: eventError } = await supabase
    .from('events')
    .insert({
      program_id:           teamData.program_id,
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
      created_by_user_id:   user.id,
    })
    .select('id')
    .single()

  if (eventError || !event) {
    console.error('Event insert error:', eventError)
    return { error: 'Failed to save event. Please try again.' }
  }

  // Step 5: Link event to team
  const { error: detailsError } = await supabase
    .from('event_team_details')
    .insert({
      event_id:             event.id,
      team_id:              teamUser.team_id,
      start_time:           formData.default_start_time || null,
      arrival_time:         formData.default_arrival_time || null,
      end_time:             formData.default_end_time || null,
      notification_enabled: true,
    })

  if (detailsError) {
    console.error('Event team details error:', detailsError)
  }

  redirect('/schedule')
}