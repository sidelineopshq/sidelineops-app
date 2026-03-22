import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import RosterClient from './RosterClient'

export default async function RosterPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Get team membership
  const { data: teamUser } = await supabase
    .from('team_users')
    .select('team_id, can_manage_contacts')
    .eq('user_id', user.id)
    .single()

  if (!teamUser) redirect('/dashboard')

  const { data: team } = await supabase
    .from('teams')
    .select('id, name, program_id')
    .eq('id', teamUser.team_id)
    .single()

  const { data: program } = await supabase
    .from('programs')
    .select('name, sport')
    .eq('id', team?.program_id ?? '')
    .single()

  // Fetch players ordered by last name
  const { data: players } = await supabase
    .from('players')
    .select('id, first_name, last_name, jersey_number, is_active, notes')
    .eq('team_id', teamUser.team_id)
    .eq('is_active', true)
    .order('last_name', { ascending: true })
    .order('first_name', { ascending: true })

  // Fetch active join token
  const { data: joinToken } = await supabase
    .from('team_join_tokens')
    .select('token, created_at')
    .eq('team_id', teamUser.team_id)
    .eq('is_active', true)
    .single()

  // Count contacts linked to this team
  const { count: contactCount } = await supabase
    .from('contacts')
    .select('id', { count: 'exact', head: true })
    .eq('team_id', teamUser.team_id)
    .is('deleted_at', null)

  return (
    <RosterClient
      players={players ?? []}
      teamId={teamUser.team_id}
      teamName={team?.name ?? ''}
      programName={program?.name ?? ''}
      sport={program?.sport ?? ''}
      canManageContacts={teamUser.can_manage_contacts ?? false}
      joinToken={joinToken?.token ?? null}
      playerCount={players?.length ?? 0}
      contactCount={contactCount ?? 0}
    />
  )
}