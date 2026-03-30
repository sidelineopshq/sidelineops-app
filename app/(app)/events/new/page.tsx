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
  const svc = serviceClient()

  const [rolesResult, templateResult] = await Promise.all([
    svc
      .from('volunteer_roles')
      .select('id, name')
      .eq('program_id', programId)
      .eq('is_active', true)
      .order('name', { ascending: true }),
    svc
      .from('volunteer_slot_templates')
      .select('id, role_id, slot_count, start_time, end_time, notes, volunteer_roles(name)')
      .eq('program_id', programId)
      .eq('is_active', true)
      .order('created_at', { ascending: true }),
  ])

  const volunteerRoles = (rolesResult.data ?? []) as { id: string; name: string }[]

  const templateSlots = (templateResult.data ?? []).map((t: any) => ({
    id:         t.id as string,
    role_id:    t.role_id as string,
    role_name:  ((t.volunteer_roles as any)?.name ?? 'Unknown') as string,
    slot_count: t.slot_count as number,
    start_time: (t.start_time ?? null) as string | null,
    end_time:   (t.end_time   ?? null) as string | null,
    notes:      (t.notes      ?? null) as string | null,
  }))

  return <NewEventForm teams={teams} volunteerRoles={volunteerRoles} templateSlots={templateSlots} />
}
