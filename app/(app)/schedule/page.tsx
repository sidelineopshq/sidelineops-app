import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ScheduleClient from './ScheduleClient'

export default async function SchedulePage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: teamUser } = await supabase
    .from('team_users')
    .select('team_id, role, can_manage_events, can_send_notifications')
    .eq('user_id', user.id)
    .single()

  if (!teamUser) {
    return (
      <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        <p className="text-slate-400">No team assignment found for your account.</p>
      </main>
    )
  }

  const { data: team } = await supabase
    .from('teams')
    .select('id, name, level, program_id')
    .eq('id', teamUser.team_id)
    .single()

  const { data: program } = await supabase
    .from('programs')
    .select('id, name, sport')
    .eq('id', team?.program_id ?? '')
    .single()

  const today = new Date().toISOString().split('T')[0]

  

  // Fetch upcoming events
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
        arrival_time
      )
    `)
    .eq('event_team_details.team_id', teamUser.team_id)
    .gte('event_date', today)
    .neq('status', 'cancelled')
    .order('event_date', { ascending: true })

  const allEvents = (eventRows ?? [])
    .map((row: any) => ({
      ...row,
      team_start_time:    row.event_team_details?.[0]?.start_time   || row.default_start_time,
      team_arrival_time:  row.event_team_details?.[0]?.arrival_time || row.default_arrival_time,
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
      team_start_time: row.event_team_details?.[0]?.start_time || row.default_start_time,
      event_team_details: undefined,
    }))
  }

  return (
    <ScheduleClient
      events={allEvents ?? []}
      childGames={childGames}
      teamId={teamUser.team_id ?? ''}
      programId={program?.id ?? ''}
      programName={program?.name ?? ''}
      teamName={team?.name ?? ''}
      canManageEvents={teamUser.can_manage_events ?? false}
      canSendNotifications={teamUser.can_send_notifications ?? false}
    />
  )
}