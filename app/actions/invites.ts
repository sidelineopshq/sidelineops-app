'use server'

import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { buildCoachInviteEmail } from '@/lib/email/coachInvite'
import { formatTeamShortLabel, formatProgramLabel } from '@/lib/utils/team-label'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// ── sendCoachInvite ───────────────────────────────────────────────────────────

export async function sendCoachInvite(
  email: string,
  role: 'admin' | 'coach' | 'volunteer_admin' | 'meal_coordinator',
  teamIds: string[],
) {
  // 1. Validate inputs
  if (!EMAIL_RE.test(email)) return { error: 'Invalid email address' }
  if (teamIds.length === 0)  return { error: 'Select at least one team' }

  // 2. Auth + permission check
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await authClient
    .from('users')
    .select('first_name, last_name')
    .eq('id', user.id)
    .single()

  const inviterName = profile?.first_name
    ? `${profile.first_name} ${profile.last_name ?? ''}`.trim()
    : user.email ?? 'Your admin'

  const { data: teamUsers } = await authClient
    .from('team_users')
    .select('team_id, can_manage_team_settings')
    .eq('user_id', user.id)
    .in('team_id', teamIds)

  const authorizedTeamIds = (teamUsers ?? [])
    .filter(t => t.can_manage_team_settings)
    .map(t => t.team_id)

  if (authorizedTeamIds.length === 0) {
    return { error: 'You do not have permission to invite coaches' }
  }

  // Restrict to teams the caller is actually authorized for
  const allowedTeamIds = teamIds.filter(id => authorizedTeamIds.includes(id))

  const service = createServiceClient()

  // 3. Resolve team names + program
  const { data: teams } = await service
    .from('teams')
    .select('id, name, level, program_id, programs(sport, schools(name))')
    .in('id', allowedTeamIds)

  if (!teams?.length) return { error: 'Teams not found' }

  const programId = teams[0].program_id
  const teamNames = teams.map(t => formatTeamShortLabel((t as any).level ?? ''))

  const schoolName    = (teams[0] as any)?.programs?.schools?.name ?? ''
  const sport         = (teams[0] as any)?.programs?.sport ?? ''
  const programLabel  = formatProgramLabel(schoolName, sport)

  const { data: program } = await service
    .from('programs')
    .select('name, sport')
    .eq('id', programId)
    .single()

  // 4. Block only if there is a pending (not accepted, not expired) invite
  const { data: existing } = await service
    .from('coach_invites')
    .select('id')
    .eq('program_id', programId)
    .eq('email', email.toLowerCase())
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()

  if (existing) {
    return { error: 'An active invitation already exists for this email' }
  }

  // 5. Generate token + insert
  const token     = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  const { error: insertError } = await service
    .from('coach_invites')
    .insert({
      program_id: programId,
      team_ids:   allowedTeamIds,
      email:      email.toLowerCase(),
      role,
      token,
      invited_by: user.id,
      expires_at: expiresAt,
    })

  if (insertError) return { error: insertError.message }

  // 6. Send invite email
  const baseUrl   = process.env.BASE_URL ?? 'https://sidelineopshq.com'
  const acceptUrl = `${baseUrl}/accept-invite?token=${token}`
  const displayProgram = programLabel || program?.name || 'a team'
  const subject        = `You've been invited to join ${displayProgram} on SidelineOps`

  const resend = new Resend(process.env.RESEND_API_KEY)
  const { error: emailError } = await resend.emails.send({
    from: `${programLabel || program?.name || 'SidelineOps'} via SidelineOps <${process.env.NEXT_PUBLIC_FROM_EMAIL}>`,
    to:   email,
    subject,
    html: buildCoachInviteEmail({
      inviterName,
      teamNames,
      programName: displayProgram,
      sport:       program?.sport ?? '',
      role,
      acceptUrl,
    }),
  })

  if (emailError) {
    console.error('[sendCoachInvite] email send failed:', emailError)
    return { error: 'Invite created but email failed to send' }
  }

  revalidatePath('/settings/team')
  return { success: true }
}

// ── resendCoachInvite ─────────────────────────────────────────────────────────

export async function resendCoachInvite(inviteId: string) {
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/login')

  const service = createServiceClient()

  const { data: invite } = await service
    .from('coach_invites')
    .select('id, program_id, team_ids, email, role, token, invited_by')
    .eq('id', inviteId)
    .single()

  if (!invite) return { error: 'Invite not found' }

  // Permission check against the invite's teams
  const { data: teamUsers } = await authClient
    .from('team_users')
    .select('can_manage_team_settings')
    .eq('user_id', user.id)
    .in('team_id', invite.team_ids)

  if (!teamUsers?.some(t => t.can_manage_team_settings)) {
    return { error: 'Not authorized' }
  }

  // Fetch inviter name from users table
  const inviterId = invite.invited_by ?? user.id
  const { data: inviter } = await service
    .from('users')
    .select('first_name, last_name')
    .eq('id', inviterId)
    .single()
  const inviterName = inviter?.first_name
    ? `${inviter.first_name} ${inviter.last_name ?? ''}`.trim()
    : 'Your admin'

  // Extend expiry by 7 days from now
  const newExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  await service
    .from('coach_invites')
    .update({ expires_at: newExpiry })
    .eq('id', inviteId)

  const { data: program } = await service
    .from('programs')
    .select('name, sport')
    .eq('id', invite.program_id)
    .single()

  // Fetch team names from team_ids (not stored in DB)
  const { data: teamsForEmail } = await service
    .from('teams')
    .select('name, level, programs(sport, schools(name))')
    .in('id', invite.team_ids)
  const teamNames = (teamsForEmail ?? []).map(t => formatTeamShortLabel((t as any).level ?? ''))

  const resendSchoolName  = (teamsForEmail?.[0] as any)?.programs?.schools?.name ?? ''
  const resendSport       = (teamsForEmail?.[0] as any)?.programs?.sport ?? ''
  const resendProgramLabel = formatProgramLabel(resendSchoolName, resendSport) || program?.name || ''

  const baseUrl   = process.env.BASE_URL ?? 'https://sidelineopshq.com'
  const acceptUrl = `${baseUrl}/accept-invite?token=${invite.token}`
  const subject   = `You've been invited to join ${resendProgramLabel || 'a team'} on SidelineOps`

  const resend = new Resend(process.env.RESEND_API_KEY)
  const { error: emailError } = await resend.emails.send({
    from: `${resendProgramLabel || 'SidelineOps'} via SidelineOps <${process.env.NEXT_PUBLIC_FROM_EMAIL}>`,
    to:   invite.email,
    subject,
    html: buildCoachInviteEmail({
      inviterName,
      teamNames,
      programName: resendProgramLabel,
      sport:       program?.sport ?? '',
      role:        invite.role as 'admin' | 'coach' | 'volunteer_admin' | 'meal_coordinator',
      acceptUrl,
    }),
  })

  if (emailError) {
    console.error('[resendCoachInvite] email send failed:', emailError)
    return { error: 'Failed to resend invitation email' }
  }

  revalidatePath('/settings/team')
  return { success: true }
}

// ── removeCoachAccess ─────────────────────────────────────────────────────────

export async function removeCoachAccess(targetUserId: string, teamIds: string[]) {
  if (!targetUserId || teamIds.length === 0) return { error: 'Missing required fields' }

  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/login')

  // Verify caller has can_manage_team_settings on at least one of the target teams
  const { data: callerTeams } = await authClient
    .from('team_users')
    .select('can_manage_team_settings')
    .eq('user_id', user.id)
    .in('team_id', teamIds)

  if (!callerTeams?.some(t => t.can_manage_team_settings)) {
    return { error: 'Not authorized' }
  }

  const service = createServiceClient()

  const { error } = await service
    .from('team_users')
    .delete()
    .eq('user_id', targetUserId)
    .in('team_id', teamIds)

  if (error) return { error: error.message }

  revalidatePath('/settings/team')
  return { success: true }
}

// ── revokeCoachInvite ─────────────────────────────────────────────────────────

export async function revokeCoachInvite(inviteId: string) {
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/login')

  const service = createServiceClient()

  const { data: invite } = await service
    .from('coach_invites')
    .select('id, team_ids')
    .eq('id', inviteId)
    .single()

  if (!invite) return { error: 'Invite not found' }

  const { data: teamUsers } = await authClient
    .from('team_users')
    .select('can_manage_team_settings')
    .eq('user_id', user.id)
    .in('team_id', invite.team_ids)

  if (!teamUsers?.some(t => t.can_manage_team_settings)) {
    return { error: 'Not authorized' }
  }

  const { error } = await service
    .from('coach_invites')
    .delete()
    .eq('id', inviteId)

  if (error) return { error: error.message }

  revalidatePath('/settings/team')
  return { success: true }
}
