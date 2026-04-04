import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import NotifyClient from './NotifyClient'
import { formatProgramLabel } from '@/lib/utils/team-label'

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
      event_team_details!inner(team_id, start_time)
    `)
    .eq('id', id)
    .in('event_team_details.team_id', teamIds)
    .single()

  if (!event) notFound()

  // All teams in the program — primary first
  const { data: teamsData } = await supabase
    .from('teams')
    .select('id, name, slug, is_primary')
    .in('id', teamIds)
    .order('is_primary', { ascending: false })
    .order('name', { ascending: true })

  const teams = teamsData ?? []
  const primaryTeam = teams[0]

  // All contacts across all the coach's teams (not soft-deleted)
  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, first_name, last_name, email, contact_type, sms_consent, team_id')
    .in('team_id', teamIds)
    .is('deleted_at', null)
    .order('last_name', { ascending: true })
    .order('first_name', { ascending: true })

  const { data: program } = await supabase
    .from('programs')
    .select('name, sport, schools(name)')
    .eq('id', event.program_id)
    .single()

  return (
    <NotifyClient
      event={{
        id:                 event.id,
        event_type:         event.event_type,
        title:              event.title,
        opponent:           event.opponent,
        is_home:            event.is_home,
        is_tournament:      event.is_tournament,
        location_name:      event.location_name,
        location_address:   event.location_address,
        event_date:         event.event_date,
        default_start_time: event.default_start_time,
        status:             event.status,
      }}
      teams={teams}
      contacts={contacts ?? []}
      programName={formatProgramLabel((program as any)?.schools?.name ?? '', (program as any)?.sport ?? '') || program?.name || ''}
      primaryTeamId={primaryTeam?.id ?? null}
      appUrl={process.env.NEXT_PUBLIC_APP_URL ?? 'https://sidelineopshq.com'}
    />
  )
}
