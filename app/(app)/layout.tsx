import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AppNav from './AppNav'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Get user profile
  const { data: profile } = await supabase
    .from('users')
    .select('first_name, last_name, email')
    .eq('id', user.id)
    .single()

  // Get ALL team memberships (user may coach multiple teams)
  const { data: teamUsersRaw } = await supabase
    .from('team_users')
    .select('role, can_manage_events, can_send_notifications, can_manage_volunteers, team_id')
    .eq('user_id', user.id)

  const primaryTeamUser = teamUsersRaw?.[0]
  const teamIds = (teamUsersRaw ?? []).map(t => t.team_id)

  // Get all teams + program info + branding
  const { data: teamsData } = await supabase
    .from('teams')
    .select('id, name, is_primary, program_id, logo_url, primary_color, secondary_color')
    .in('id', teamIds.length > 0 ? teamIds : ['00000000-0000-0000-0000-000000000000'])

  const { data: program } = await supabase
    .from('programs')
    .select('name, sport')
    .eq('id', teamsData?.[0]?.program_id ?? '')
    .single()

  const displayName = profile?.first_name
    ? `${profile.first_name} ${profile.last_name ?? ''}`.trim()
    : profile?.email ?? user.email ?? 'User'

  const initials = profile?.first_name
    ? `${profile.first_name[0]}${profile.last_name?.[0] ?? ''}`.toUpperCase()
    : (profile?.email?.[0] ?? 'U').toUpperCase()

  // Aggregate permissions across all teams
  const canManageEvents      = teamUsersRaw?.some(t => t.can_manage_events)      ?? false
  const canSendNotifications = teamUsersRaw?.some(t => t.can_send_notifications) ?? false
  const canManageVolunteers  = teamUsersRaw?.some(t => t.can_manage_volunteers)  ?? false

  // Branding — prefer the primary team, fall back to first team
  const brandTeam      = teamsData?.find(t => t.is_primary) ?? teamsData?.[0] ?? null
  const brandPrimary   = brandTeam?.primary_color   ?? '#1a3a5c'
  const brandSecondary = brandTeam?.secondary_color ?? '#c8a456'
  const teamLogoUrl    = brandTeam?.logo_url        ?? null

  return (
    <div
      className="min-h-screen bg-slate-950 text-white"
      style={{ '--color-primary': brandPrimary, '--color-secondary': brandSecondary } as React.CSSProperties}
    >
      <AppNav
        displayName={displayName}
        initials={initials}
        email={profile?.email ?? user.email ?? ''}
        teams={(teamsData ?? []).map(t => ({ id: t.id, name: t.name }))}
        programName={program?.name ?? ''}
        sport={program?.sport ?? ''}
        role={primaryTeamUser?.role ?? ''}
        canManageEvents={canManageEvents}
        canSendNotifications={canSendNotifications}
        canManageVolunteers={canManageVolunteers}
        logoUrl={teamLogoUrl}
        brandPrimary={brandPrimary}
        brandSecondary={brandSecondary}
      />
      <main>
        {children}
      </main>
    </div>
  )
}