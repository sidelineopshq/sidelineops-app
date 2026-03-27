import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceRoleClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import RosterClient from './RosterClient'

function createServiceClient() {
  return createServiceRoleClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export default async function RosterPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: teamUsersRaw } = await supabase
    .from('team_users')
    .select('team_id, can_manage_contacts')
    .eq('user_id', user.id)

  if (!teamUsersRaw?.length) redirect('/dashboard')

  const teamIds           = teamUsersRaw.map(t => t.team_id)
  const canManageContacts = teamUsersRaw.some(t => t.can_manage_contacts)

  const { data: teamsData } = await supabase
    .from('teams')
    .select('id, name, program_id')
    .in('id', teamIds)

  const { data: program } = await supabase
    .from('programs')
    .select('name, sport')
    .eq('id', teamsData?.[0]?.program_id ?? '')
    .single()

  // Use service role client for player_teams reads (table has no anon RLS policy)
  const service = createServiceClient()

  // Step 1: find all player IDs that have a player_teams row for the coach's teams
  const { data: ptRows } = await service
    .from('player_teams')
    .select('player_id, team_id, is_call_up')
    .in('team_id', teamIds)

  const playerIds = [...new Set((ptRows ?? []).map((r: any) => r.player_id as string))]

  // Step 2: fetch those players (active only), ordered alphabetically
  let players: any[] = []
  if (playerIds.length > 0) {
    const { data: playerRows } = await service
      .from('players')
      .select('id, first_name, last_name, jersey_number, is_active, notes')
      .in('id', playerIds)
      .eq('is_active', true)
      .order('last_name',  { ascending: true })
      .order('first_name', { ascending: true })

    // Step 3: build the shape RosterClient expects
    players = (playerRows ?? []).map((p: any) => {
      const assignments = (ptRows ?? [])
        .filter((r: any) => r.player_id === p.id)
        .map((r: any) => ({ team_id: r.team_id, is_call_up: r.is_call_up }))

      return {
        id:             p.id,
        first_name:     p.first_name,
        last_name:      p.last_name,
        jersey_number:  p.jersey_number,
        is_active:      p.is_active,
        notes:          p.notes,
        // primary team = the non-call-up assignment
        primary_team_id: assignments.find((a: any) => !a.is_call_up)?.team_id ?? '',
        team_assignments: assignments,
      }
    })
  }

  // Fetch active join tokens for all teams
  const { data: joinTokenRows } = await supabase
    .from('team_join_tokens')
    .select('team_id, token')
    .in('team_id', teamIds)
    .eq('is_active', true)

  const joinTokensByTeam: Record<string, string> = {}
  joinTokenRows?.forEach((r: any) => { joinTokensByTeam[r.team_id] = r.token })

  // Total contacts across all teams
  const { count: totalContactCount } = await supabase
    .from('contacts')
    .select('id', { count: 'exact', head: true })
    .in('team_id', teamIds)
    .is('deleted_at', null)

  const teams = (teamsData ?? []).map(t => ({ id: t.id, name: t.name }))

  return (
    <RosterClient
      players={players}
      teams={teams}
      programName={program?.name ?? ''}
      sport={program?.sport ?? ''}
      canManageContacts={canManageContacts}
      joinTokensByTeam={joinTokensByTeam}
      totalContactCount={totalContactCount ?? 0}
    />
  )
}
