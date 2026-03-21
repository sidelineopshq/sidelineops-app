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

  // Get team membership
  const { data: teamUser } = await supabase
    .from('team_users')
    .select('role, can_manage_events, can_send_notifications, can_manage_volunteers, team_id')
    .eq('user_id', user.id)
    .single()

  // Get team + program info
  const { data: team } = await supabase
    .from('teams')
    .select('id, name, program_id')
    .eq('id', teamUser?.team_id ?? '')
    .single()

  const { data: program } = await supabase
    .from('programs')
    .select('name, sport')
    .eq('id', team?.program_id ?? '')
    .single()

  const displayName = profile?.first_name
    ? `${profile.first_name} ${profile.last_name ?? ''}`.trim()
    : profile?.email ?? user.email ?? 'User'

  const initials = profile?.first_name
    ? `${profile.first_name[0]}${profile.last_name?.[0] ?? ''}`.toUpperCase()
    : (profile?.email?.[0] ?? 'U').toUpperCase()

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <AppNav
        displayName={displayName}
        initials={initials}
        email={profile?.email ?? user.email ?? ''}
        teamName={team?.name ?? ''}
        programName={program?.name ?? ''}
        sport={program?.sport ?? ''}
        role={teamUser?.role ?? ''}
        canManageEvents={teamUser?.can_manage_events ?? false}
        canSendNotifications={teamUser?.can_send_notifications ?? false}
        canManageVolunteers={teamUser?.can_manage_volunteers ?? false}
      />
      <main>
        {children}
      </main>
    </div>
  )
}