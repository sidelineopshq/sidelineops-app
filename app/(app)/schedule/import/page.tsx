import { createClient }    from '@/lib/supabase/server'
import { redirect }         from 'next/navigation'
import {
  formatProgramLabel,
  formatTeamShortLabel,
} from '@/lib/utils/team-label'
import ImportClient          from './ImportClient'

export const metadata = { title: 'Import Schedule' }

export default async function ImportSchedulePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: teamUsersRaw } = await supabase
    .from('team_users')
    .select('team_id, can_manage_events')
    .eq('user_id', user.id)

  const canManageEvents = (teamUsersRaw ?? []).some(t => t.can_manage_events)
  if (!canManageEvents) redirect('/schedule')

  const teamIds = (teamUsersRaw ?? []).map(t => t.team_id)

  const { data: teamsRaw } = await supabase
    .from('teams')
    .select('id, name, level, program_id, is_primary, sort_order, programs(sport, schools(name))')
    .in('id', teamIds)
    .order('is_primary', { ascending: false })
    .order('sort_order', { ascending: true  })
    .order('name',       { ascending: true  })

  const teams = (teamsRaw ?? []).map(t => ({
    id:        t.id,
    name:      formatTeamShortLabel((t as any).level ?? '') || t.name,
    level:     (t as any).level as string | null ?? null,
    isPrimary: (t as any).is_primary as boolean ?? false,
    sortOrder: (t as any).sort_order as number ?? 0,
  }))

  const programId    = (teamsRaw ?? [])[0]?.program_id ?? ''
  const programLabel = formatProgramLabel(
    (teamsRaw?.[0] as any)?.programs?.schools?.name ?? '',
    (teamsRaw?.[0] as any)?.programs?.sport        ?? '',
  )

  return (
    <ImportClient
      teams={teams}
      programId={programId}
      programLabel={programLabel}
    />
  )
}
