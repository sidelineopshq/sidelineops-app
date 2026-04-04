import { createClient } from '@supabase/supabase-js'
import AcceptInviteForm from './AcceptInviteForm'
import { formatTeamShortLabel, formatProgramLabel } from '@/lib/utils/team-label'

export const metadata = { title: 'Accept Invitation' }

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams

  if (!token) {
    return <ErrorPage message="Invalid invitation link." />
  }

  const service = createServiceClient()

  const { data: invite, error: inviteError } = await service
    .from('coach_invites')
    .select('id, program_id, team_ids, email, role, token, invited_by, expires_at, accepted_at')
    .eq('token', token)
    .maybeSingle()

  if (!invite) {
    return <ErrorPage message="This invitation link is invalid or does not exist." />
  }

  if (new Date(invite.expires_at) < new Date()) {
    return <ErrorPage message="This invitation has expired. Please ask your admin to resend it." />
  }

  if (invite.accepted_at) {
    return <ErrorPage message="This invitation has already been accepted." action="Go to login" actionHref="/login" />
  }

  // Fetch team names and inviter name (not stored in DB)
  const { data: inviteTeams } = await service
    .from('teams')
    .select('name, level, programs(sport, schools(name))')
    .in('id', invite.team_ids ?? [])

  const { data: inviter } = await service
    .from('users')
    .select('first_name, last_name')
    .eq('id', invite.invited_by)
    .single()

  const teamNames = (inviteTeams ?? []).map(t => formatTeamShortLabel((t as any).level ?? ''))
  const inviterName = inviter?.first_name
    ? `${inviter.first_name} ${inviter.last_name ?? ''}`.trim()
    : 'Your admin'

  const { data: program } = await service
    .from('programs')
    .select('name, sport')
    .eq('id', invite.program_id)
    .single()

  const schoolName = (inviteTeams?.[0] as any)?.programs?.schools?.name ?? ''

  return (
    <AcceptInviteForm
      token={token}
      email={invite.email}
      role={invite.role as 'admin' | 'coach'}
      teamNames={teamNames}
      programName={formatProgramLabel(schoolName, program?.sport ?? '') || program?.name || ''}
      sport={program?.sport ?? ''}
      inviterName={inviterName}
    />
  )
}

function ErrorPage({
  message,
  action,
  actionHref,
}: {
  message: string
  action?: string
  actionHref?: string
}) {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="border-b border-white/10 bg-slate-900">
        <div className="mx-auto max-w-lg px-6 py-5">
          <img
            src="/sidelineops-logo-cropped.png"
            alt="SidelineOps"
            style={{ height: '28px', width: 'auto', opacity: 0.7 }}
            className="mb-3"
          />
          <h1 className="text-xl font-bold text-white">SidelineOps</h1>
        </div>
      </div>
      <div className="mx-auto max-w-lg px-6 py-16 text-center">
        <p className="text-4xl mb-6">🔒</p>
        <h2 className="text-xl font-bold text-white mb-3">Invitation Unavailable</h2>
        <p className="text-slate-400 text-sm">{message}</p>
        {action && actionHref && (
          <a
            href={actionHref}
            className="mt-8 inline-block rounded-xl bg-sky-600 hover:bg-sky-500 px-6 py-3 text-sm font-semibold transition-colors"
          >
            {action}
          </a>
        )}
      </div>
    </main>
  )
}
