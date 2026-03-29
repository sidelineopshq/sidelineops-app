import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import NewEventForm from './NewEventForm'
import { formatTeamShortLabel } from '@/lib/utils/team-label'

export default async function NewEventPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: teamUsersRaw } = await supabase
    .from('team_users')
    .select('team_id, can_manage_events')
    .eq('user_id', user.id)

  const canManage = teamUsersRaw?.some(t => t.can_manage_events)
  if (!canManage) redirect('/schedule')

  const teamIds = (teamUsersRaw ?? []).map(t => t.team_id)

  const { data: teamsData } = await supabase
    .from('teams')
    .select('id, name, level, programs(sport, schools(name))')
    .in('id', teamIds)
    .order('is_primary', { ascending: false })
    .order('name', { ascending: true })

  const teams = (teamsData ?? []).map(t => ({
    id:   t.id,
    name: formatTeamShortLabel((t as any).level ?? ''),
  }))

  return <NewEventForm teams={teams} />
}
