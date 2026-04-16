import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import NotifyClient from './NotifyClient'
import { formatProgramLabel } from '@/lib/utils/team-label'
import { getBaseUrl } from '@/lib/utils/base-url'

export default async function NotifyPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: teamUsersRaw } = await supabase
    .from('team_users')
    .select('team_id, can_send_notifications')
    .eq('user_id', user.id)

  const canSend = teamUsersRaw?.some(t => t.can_send_notifications) ?? false
  if (!canSend) redirect('/schedule')

  const teamIds = (teamUsersRaw ?? []).map(t => t.team_id)

  // Verify coach has access to this event via event_team_details
  const { data: event } = await supabase
    .from('events')
    .select(`
      id, event_type, title, opponent, is_home, is_tournament,
      location_name, location_address, event_date,
      default_start_time, default_arrival_time, status, program_id,
      meal_required, meal_time, meal_notes, notes, uniform_notes,
      event_team_details!inner(team_id, start_time)
    `)
    .eq('id', id)
    .in('event_team_details.team_id', teamIds)
    .single()

  if (!event) notFound()

  // All teams in the program — primary first (include GroupMe config)
  const { data: teamsData } = await supabase
    .from('teams')
    .select('id, name, slug, is_primary, groupme_enabled, groupme_bot_id')
    .in('id', teamIds)
    .order('is_primary', { ascending: false })
    .order('name', { ascending: true })

  const teams = teamsData ?? []
  const primaryTeam = teams[0]

  // If this is a tournament event, fetch its child games
  const isTournament = event.is_tournament || event.event_type === 'tournament'
  let tournamentGames: {
    id: string
    event_type: string
    title: string | null
    opponent: string | null
    is_home: boolean | null
    event_date: string
    default_start_time: string | null
    location_name: string | null
    status: string
  }[] = []

  if (isTournament) {
    const { data: childEvents } = await supabase
      .from('events')
      .select('id, event_type, title, opponent, is_home, event_date, default_start_time, location_name, status')
      .eq('parent_event_id', event.id)
      .order('event_date',         { ascending: true })
      .order('default_start_time', { ascending: true })
    tournamentGames = (childEvents ?? []).filter((e: any) => e.status !== 'cancelled')
  }

  // All contacts across all the coach's teams — check both legacy team_id and contact_teams junction
  const { data: ctRows } = await supabase
    .from('contact_teams')
    .select('contact_id, team_id')
    .in('team_id', teamIds)
  const ctContactIds = [...new Set((ctRows ?? []).map((r: any) => r.contact_id as string))]

  // Build map: contact_id → [team_ids] so the client can filter by team correctly
  const ctTeamMap = new Map<string, string[]>()
  for (const row of ctRows ?? []) {
    if (!ctTeamMap.has((row as any).contact_id)) ctTeamMap.set((row as any).contact_id, [])
    ctTeamMap.get((row as any).contact_id)!.push((row as any).team_id)
  }

  const contactsBuilder = supabase
    .from('contacts')
    .select('id, first_name, last_name, email, contact_type, sms_consent, team_id')
    .is('deleted_at', null)
    .order('last_name', { ascending: true })
    .order('first_name', { ascending: true })

  const { data: rawContacts } = ctContactIds.length > 0
    ? await contactsBuilder.or(`team_id.in.(${teamIds.join(',')}),id.in.(${ctContactIds.join(',')})`)
    : await contactsBuilder.in('team_id', teamIds)

  // Attach team_ids array (from both sources) for client-side team filtering
  const contacts = (rawContacts ?? []).map((c: any) => ({
    ...c,
    team_ids: [
      ...new Set([
        ...(c.team_id ? [c.team_id] : []),
        ...(ctTeamMap.get(c.id) ?? []),
      ]),
    ],
  }))

  const { data: program } = await supabase
    .from('programs')
    .select('name, sport, schools(name)')
    .eq('id', event.program_id)
    .single()

  return (
    <NotifyClient
      tournamentGames={tournamentGames}
      event={{
        id:                    event.id,
        event_type:            event.event_type,
        title:                 event.title,
        opponent:              event.opponent,
        is_home:               event.is_home,
        is_tournament:         event.is_tournament,
        location_name:         event.location_name,
        location_address:      event.location_address,
        event_date:            event.event_date,
        default_start_time:    event.default_start_time,
        default_arrival_time:  event.default_arrival_time,
        meal_required:         event.meal_required ?? false,
        meal_time:             event.meal_time     ?? null,
        meal_notes:            event.meal_notes    ?? null,
        notes:                 event.notes         ?? null,
        uniform_notes:         event.uniform_notes ?? null,
        status:                event.status,
      }}
      teams={teams}
      contacts={contacts ?? []}
      programName={formatProgramLabel((program as any)?.schools?.name ?? '', (program as any)?.sport ?? '') || program?.name || ''}
      primaryTeamId={primaryTeam?.id ?? null}
      appUrl={getBaseUrl()}
    />
  )
}
