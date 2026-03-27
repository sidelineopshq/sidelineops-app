'use server'

import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { sendNewEventAlert } from '@/lib/notifications/channel-router'

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

  // ── Step 6: Fire new-event notification (non-blocking) ───────────────────
  void (async () => {
    try {
      // Replicate dayLabel() check so we can log before entering sendNewEventAlert
      const _today    = new Date(); _today.setHours(0, 0, 0, 0)
      const _tomorrow = new Date(_today); _tomorrow.setDate(_tomorrow.getDate() + 1)
      const [_y, _mo, _d] = formData.event_date.split('-').map(Number)
      const _eventDay = new Date(_y, _mo - 1, _d)
      const isUrgent  = _eventDay.getTime() === _today.getTime() || _eventDay.getTime() === _tomorrow.getTime()
      const [{ data: team }, { data: program }, { data: contacts }] = await Promise.all([
        supabase
          .from('teams')
          .select('id, name, level, slug, notify_on_change, groupme_enabled, groupme_bot_id')
          .eq('id', formData.team_id)
          .single(),
        supabase
          .from('programs')
          .select('name')
          .eq('id', teamData.program_id)
          .single(),
        supabase
          .from('contacts')
          .select('id, first_name, email, email_unsubscribed')
          .eq('team_id', formData.team_id)
          .is('deleted_at', null)
          .not('email', 'is', null),
      ])

      if (!team) return

      await sendNewEventAlert({
        team: {
          id:               team.id,
          name:             team.name ?? '',
          level:            team.level ?? null,
          slug:             team.slug ?? null,
          notify_on_change: team.notify_on_change,
          groupme_enabled:  team.groupme_enabled,
          groupme_bot_id:   team.groupme_bot_id,
        },
        programName: program?.name ?? '',
        event: {
          title:           null,
          event_type:      'game',
          event_date:      formData.event_date,
          opponent:        formData.opponent || null,
          is_home:         null,
          location_name:   formData.location_name || null,
          is_tournament:   false,
          parent_event_id: formData.parent_event_id,
        },
        assignedTeams: [{
          name:       team.name ?? '',
          level:      team.level ?? null,
          start_time: formData.start_time || null,
        }],
        contacts: (contacts ?? []).map(c => ({
          id:                 c.id,
          first_name:         c.first_name,
          email:              c.email,
          email_unsubscribed: c.email_unsubscribed,
        })),
      })
    } catch (err) {
      console.error('[addTournamentGame] notification fire failed:', err)
    }
  })()

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