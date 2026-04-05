import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ProfileSettingsClient from './ProfileSettingsClient'
import { formatTeamShortLabel, formatProgramLabel } from '@/lib/utils/team-label'

export const metadata = { title: 'Profile Settings' }

const ROLE_LABELS: Record<string, string> = {
  admin:            'Admin',
  coach:            'Coach',
  volunteer_admin:  'Volunteer Admin',
  meal_coordinator: 'Meal Coordinator',
}

export default async function ProfileSettingsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('first_name, last_name, email, created_at')
    .eq('id', user.id)
    .single()

  const { data: teamUsersRaw } = await supabase
    .from('team_users')
    .select('role, team_id')
    .eq('user_id', user.id)

  const teamIds = (teamUsersRaw ?? []).map(t => t.team_id)
  const role    = teamUsersRaw?.[0]?.role ?? ''

  const { data: teamsData } = await supabase
    .from('teams')
    .select('id, name, level, program_id, programs(sport, schools(name))')
    .in('id', teamIds.length > 0 ? teamIds : ['00000000-0000-0000-0000-000000000000'])

  const { data: program } = await supabase
    .from('programs')
    .select('name, sport, schools(name)')
    .eq('id', teamsData?.[0]?.program_id ?? '')
    .single()

  const teamNames = (teamsData ?? []).map(t =>
    formatTeamShortLabel((t as any).level ?? '') || t.name
  )

  const programLabel = formatProgramLabel(
    (teamsData?.[0] as any)?.programs?.schools?.name ?? '',
    program?.sport ?? '',
  ) || program?.name || ''

  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric',
      })
    : '—'

  return (
    <ProfileSettingsClient
      initialFirstName={profile?.first_name ?? ''}
      initialLastName={profile?.last_name  ?? ''}
      email={profile?.email ?? user.email ?? ''}
      roleLabel={ROLE_LABELS[role] ?? role}
      teamNames={teamNames}
      programLabel={programLabel}
      memberSince={memberSince}
    />
  )
}
