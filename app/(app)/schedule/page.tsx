import { createClient } from '@/lib/supabase/server'
import { createClient as createSvcClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import ScheduleClient from './ScheduleClient'
import { formatTeamShortLabel } from '@/lib/utils/team-label'

export const metadata = { title: 'Schedule' }

function serviceClient() {
  return createSvcClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export default async function SchedulePage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: teamUsersRaw } = await supabase
    .from('team_users')
    .select('team_id, role, can_manage_events, can_send_notifications')
    .eq('user_id', user.id)

  if (!teamUsersRaw?.length) {
    return (
      <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        <p className="text-slate-400">No team assignment found for your account.</p>
      </main>
    )
  }

  const teamIds          = teamUsersRaw.map(t => t.team_id)
  const canManageEvents  = teamUsersRaw.some(t => t.can_manage_events)
  const canSendNotifications = teamUsersRaw.some(t => t.can_send_notifications)

  const { data: teamsData } = await supabase
    .from('teams')
    .select('id, name, level, program_id, is_primary, programs(sport, schools(name))')
    .in('id', teamIds)
    .order('is_primary', { ascending: false })
    .order('name', { ascending: true })

  const { data: program } = await supabase
    .from('programs')
    .select('id, name, sport')
    .eq('id', teamsData?.[0]?.program_id ?? '')
    .single()

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })

  // Fetch events for all of the user's teams
  const { data: eventRows } = await supabase
    .from('events')
    .select(`
      id,
      title,
      event_type,
      opponent,
      is_home,
      is_tournament,
      parent_event_id,
      location_name,
      location_address,
      event_date,
      default_start_time,
      default_arrival_time,
      status,
      uniform_notes,
      notes,
      meal_required,
      is_public,
      event_team_details!inner(
        team_id,
        start_time,
        arrival_time,
        status
      )
    `)
    .in('event_team_details.team_id', teamIds)
    .gte('event_date', today)
    .neq('status', 'cancelled')
    .order('event_date', { ascending: true })

  const allEvents = (eventRows ?? [])
    .map((row: any) => ({
      ...row,
      // Keep full team_details array so the client can resolve per-team times
      team_details: row.event_team_details ?? [],
      // Default display times (used in "All" view)
      team_start_time:   row.event_team_details?.[0]?.start_time   || row.default_start_time,
      team_arrival_time: row.event_team_details?.[0]?.arrival_time || row.default_arrival_time,
      event_team_details: undefined,
    }))
    .filter((e: any) => e?.id && !e.parent_event_id)

  // Fetch child games for any tournaments in the list
  const tournamentIds = allEvents
    .filter((e: any) => e.is_tournament)
    .map((e: any) => e.id)

  let childGames: any[] = []
  if (tournamentIds.length > 0) {
    const { data: childRows } = await supabase
      .from('events')
      .select(`
        id,
        parent_event_id,
        event_type,
        opponent,
        location_name,
        event_date,
        default_start_time,
        status,
        event_team_details(team_id, start_time)
      `)
      .in('parent_event_id', tournamentIds)
      .eq('status', 'scheduled')
      .order('event_date', { ascending: true })
      .order('default_start_time', { ascending: true, nullsFirst: false })

    childGames = (childRows ?? []).map((row: any) => ({
      ...row,
      team_details: row.event_team_details ?? [],
      team_start_time: row.event_team_details?.[0]?.start_time || row.default_start_time,
      event_team_details: undefined,
    }))
  }

  // Fetch volunteer slot summaries for events that have slots (coaches only)
  const eventIdsWithPossibleSlots = allEvents.map((e: any) => e.id)
  let volunteerSummaryMap: Record<string, { filled: number; total: number }> = {}

  if (canManageEvents && eventIdsWithPossibleSlots.length > 0) {
    const svc = serviceClient()
    const { data: slotRows } = await svc
      .from('event_volunteer_slots')
      .select(`
        id, event_id, slot_count,
        volunteer_assignments(id, status)
      `)
      .in('event_id', eventIdsWithPossibleSlots)

    for (const slot of slotRows ?? []) {
      const filled = ((slot as any).volunteer_assignments ?? []).filter((a: any) => a.status !== 'cancelled').length
      const existing = volunteerSummaryMap[slot.event_id]
      if (existing) {
        existing.filled += filled
        existing.total  += slot.slot_count
      } else {
        volunteerSummaryMap[slot.event_id] = { filled, total: slot.slot_count }
      }
    }
  }

  const teams = (teamsData ?? []).map(t => ({
    id:   t.id,
    name: formatTeamShortLabel((t as any).level ?? ''),
  }))
  // Primary team is first after ordering by is_primary desc
  const primaryTeamId = teamsData?.[0]?.id ?? null

  return (
    <ScheduleClient
      events={allEvents}
      childGames={childGames}
      teams={teams}
      primaryTeamId={primaryTeamId}
      programName={program?.name ?? ''}
      canManageEvents={canManageEvents}
      canSendNotifications={canSendNotifications}
      volunteerSummaryMap={volunteerSummaryMap}
    />
  )
}
