import { createClient } from '@/lib/supabase/server'
import { createClient as createSvcClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import NewEventForm from './NewEventForm'
import { formatTeamShortLabel } from '@/lib/utils/team-label'

function serviceClient() {
  return createSvcClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

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
    .select('id, name, level, program_id, programs(sport, schools(name))')
    .in('id', teamIds)
    .order('is_primary', { ascending: false })
    .order('name', { ascending: true })

  const teams = (teamsData ?? []).map(t => ({
    id:   t.id,
    name: formatTeamShortLabel((t as any).level ?? ''),
  }))

  const programId = (teamsData ?? [])[0]?.program_id ?? ''
  const { data: rolesRaw } = await serviceClient()
    .from('volunteer_roles')
    .select('id, name')
    .eq('program_id', programId)
    .eq('is_active', true)
    .order('name', { ascending: true })

  const volunteerRoles = (rolesRaw ?? []) as { id: string; name: string }[]

  return <NewEventForm teams={teams} volunteerRoles={volunteerRoles} />
}
