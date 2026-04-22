'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceRoleClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import {
  fireChangeNotifications,
  buildDisplayTitle,
  type TeamNotificationInput,
} from '@/lib/notifications/fire-change-notifications'

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

  // ── Snapshot before update ───────────────────────────────────────────────
  const [{ data: oldEventData }, { data: linkedTeams }] = await Promise.all([
    supabase
      .from('events')
      .select('default_end_time, location_name, location_address, status, event_date, event_type, title, opponent, is_home')
      .eq('id', eventId)
      .single(),
    supabase
      .from('event_team_details')
      .select('team_id, start_time, arrival_time, end_time, status, teams(name)')
      .eq('event_id', eventId),
  ])

  const { error } = await supabase
    .from('events')
    .update({ status: 'cancelled' })
    .eq('id', eventId)

  if (error) {
    console.error('Cancel event error:', error)
    return { error: 'Failed to cancel event. Please try again.' }
  }

  // ── Urgency gate ─────────────────────────────────────────────────────────
  if (oldEventData) {
    const eventDate       = oldEventData.event_date
    const now             = new Date()
    const centralToday    = now.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
    const centralTomorrow = new Date(now.getTime() + 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
    const isUrgent        = eventDate === centralToday || eventDate === centralTomorrow
    if (!isUrgent) return { success: true }
  }

  // ── Fire change notifications (awaited — must complete before returning) ──
  if (oldEventData && linkedTeams?.length) {
    const oldEventSnap = {
      location_name:    oldEventData.location_name,
      location_address: oldEventData.location_address,
      status:           oldEventData.status,
    }
    const newEventSnap = { ...oldEventSnap, status: 'cancelled' }

    const teamNotifications: TeamNotificationInput[] = linkedTeams.map(td => {
      const teamRow = Array.isArray(td.teams) ? td.teams[0] : td.teams
      return {
        teamId:        td.team_id,
        teamName:      (teamRow as { name: string } | null)?.name ?? '',
        oldEvent:      oldEventSnap,
        newEvent:      newEventSnap,
        // Team detail status is unchanged — only the event-level status changed
        oldTeamDetail: { start_time: td.start_time, arrival_time: (td as any).arrival_time ?? null, end_time: td.end_time, status: td.status },
        newTeamDetail: { start_time: td.start_time, arrival_time: (td as any).arrival_time ?? null, end_time: td.end_time, status: td.status },
      }
    })

    await fireChangeNotifications({
      eventDate:    oldEventData.event_date,
      displayTitle: buildDisplayTitle(oldEventData),
      eventType:    oldEventData.event_type ?? 'game',
      teamNotifications,
    })
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

  // ── Snapshot before update ───────────────────────────────────────────────
  const [{ data: oldEventData }, { data: oldDetailData }, { data: teamData }] = await Promise.all([
    supabase
      .from('events')
      .select('default_end_time, location_name, location_address, status, event_date, event_type, title, opponent, is_home')
      .eq('id', eventId)
      .single(),
    supabase
      .from('event_team_details')
      .select('start_time, arrival_time, end_time, status')
      .eq('event_id', eventId)
      .eq('team_id', teamId)
      .single(),
    supabase
      .from('teams')
      .select('name')
      .eq('id', teamId)
      .single(),
  ])

  const { error } = await supabase
    .from('event_team_details')
    .update({ status: 'cancelled' })
    .eq('event_id', eventId)
    .eq('team_id', teamId)

  if (error) {
    console.error('Cancel event for team error:', error)
    return { error: 'Failed to cancel event. Please try again.' }
  }

  // ── Urgency gate ─────────────────────────────────────────────────────────
  if (oldEventData) {
    const eventDate       = oldEventData.event_date
    const now             = new Date()
    const centralToday    = now.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
    const centralTomorrow = new Date(now.getTime() + 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
    const isUrgent        = eventDate === centralToday || eventDate === centralTomorrow
    if (!isUrgent) return { success: true }
  }

  // ── Fire change notifications (awaited — must complete before returning) ──
  if (oldEventData && oldDetailData) {
    const eventSnap = {
      location_name:    oldEventData.location_name,
      location_address: oldEventData.location_address,
      status:           oldEventData.status,
    }

    await fireChangeNotifications({
      eventDate:    oldEventData.event_date,
      displayTitle: buildDisplayTitle(oldEventData),
      eventType:    oldEventData.event_type ?? 'game',
      teamNotifications: [{
        teamId,
        teamName:      teamData?.name ?? '',
        // Event-level fields are unchanged — only the team detail status changes
        oldEvent:      eventSnap,
        newEvent:      eventSnap,
        oldTeamDetail: { start_time: oldDetailData.start_time, arrival_time: (oldDetailData as any).arrival_time ?? null, end_time: oldDetailData.end_time, status: oldDetailData.status },
        newTeamDetail: { start_time: oldDetailData.start_time, arrival_time: (oldDetailData as any).arrival_time ?? null, end_time: oldDetailData.end_time, status: 'cancelled' },
      }],
    })
  }

  return { success: true }
}
