'use server'

import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// ── Volunteer Role helpers ────────────────────────────────────────────────────

async function assertProgramManageAccess(userId: string, programId: string) {
  const authClient = await createServerClient()
  const { data: teams } = await authClient
    .from('teams')
    .select('id')
    .eq('program_id', programId)
  const teamIds = (teams ?? []).map(t => t.id)
  if (teamIds.length === 0) return false
  const { data: teamUsers } = await authClient
    .from('team_users')
    .select('can_manage_events')
    .eq('user_id', userId)
    .in('team_id', teamIds)
  return teamUsers?.some(t => t.can_manage_events) ?? false
}

export async function addVolunteerRole(
  programId:   string,
  name:        string,
  description: string,
) {
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  if (!(await assertProgramManageAccess(user.id, programId))) return { error: 'Not authorized' }

  const trimmed = name.trim()
  if (!trimmed) return { error: 'Role name is required' }

  const service = createServiceClient()
  const { error } = await service
    .from('volunteer_roles')
    .insert({
      program_id:  programId,
      name:        trimmed,
      description: description.trim() || null,
      is_active:   true,
    })

  if (error) return { error: error.message }
  revalidatePath('/settings/team')
  return { success: true }
}

export async function updateVolunteerRole(
  roleId:      string,
  name:        string,
  description: string,
) {
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const service = createServiceClient()

  // Look up program_id to verify access
  const { data: role } = await service
    .from('volunteer_roles')
    .select('program_id')
    .eq('id', roleId)
    .single()
  if (!role) return { error: 'Role not found' }
  if (!(await assertProgramManageAccess(user.id, role.program_id))) return { error: 'Not authorized' }

  const trimmed = name.trim()
  if (!trimmed) return { error: 'Role name is required' }

  const { error } = await service
    .from('volunteer_roles')
    .update({ name: trimmed, description: description.trim() || null })
    .eq('id', roleId)

  if (error) return { error: error.message }
  revalidatePath('/settings/team')
  return { success: true }
}

export async function setSuppressReminders(roleId: string, suppress: boolean) {
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const service = createServiceClient()

  const { data: role } = await service
    .from('volunteer_roles')
    .select('program_id')
    .eq('id', roleId)
    .single()
  if (!role) return { error: 'Role not found' }
  if (!(await assertProgramManageAccess(user.id, role.program_id))) return { error: 'Not authorized' }

  const { error } = await service
    .from('volunteer_roles')
    .update({ suppress_reminders: suppress })
    .eq('id', roleId)

  if (error) return { error: error.message }
  revalidatePath('/settings/team')
  return { success: true }
}

export async function deactivateVolunteerRole(roleId: string) {
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const service = createServiceClient()

  const { data: role } = await service
    .from('volunteer_roles')
    .select('program_id')
    .eq('id', roleId)
    .single()
  if (!role) return { error: 'Role not found' }
  if (!(await assertProgramManageAccess(user.id, role.program_id))) return { error: 'Not authorized' }

  const { error } = await service
    .from('volunteer_roles')
    .update({ is_active: false })
    .eq('id', roleId)

  if (error) return { error: error.message }
  revalidatePath('/settings/team')
  return { success: true }
}

export async function reactivateVolunteerRole(roleId: string) {
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const service = createServiceClient()

  const { data: role } = await service
    .from('volunteer_roles')
    .select('program_id')
    .eq('id', roleId)
    .single()
  if (!role) return { error: 'Role not found' }
  if (!(await assertProgramManageAccess(user.id, role.program_id))) return { error: 'Not authorized' }

  const { error } = await service
    .from('volunteer_roles')
    .update({ is_active: true })
    .eq('id', roleId)

  if (error) return { error: error.message }
  revalidatePath('/settings/team')
  return { success: true }
}

// ── Standing assignments ──────────────────────────────────────────────────────

export async function createStandingAssignment(
  programId: string,
  roleId:    string,
  data: {
    contact_id?:     string
    volunteer_name?:  string
    volunteer_email?: string
  },
) {
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  if (!(await assertProgramManageAccess(user.id, programId))) return { error: 'Not authorized' }

  if (!data.contact_id && !data.volunteer_name?.trim()) {
    return { error: 'A contact or a name is required.' }
  }

  const service = createServiceClient()
  const { error } = await service
    .from('volunteer_standing_assignments')
    .insert({
      program_id:      programId,
      role_id:         roleId,
      contact_id:      data.contact_id      || null,
      volunteer_name:  data.volunteer_name?.trim()  || null,
      volunteer_email: data.volunteer_email?.trim() || null,
      is_active:       true,
    })

  if (error) return { error: error.message }
  revalidatePath('/settings/team')
  return { success: true }
}

export async function removeStandingAssignment(standingId: string) {
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const service = createServiceClient()

  const { data: row } = await service
    .from('volunteer_standing_assignments')
    .select('program_id')
    .eq('id', standingId)
    .single()
  if (!row) return { error: 'Assignment not found' }
  if (!(await assertProgramManageAccess(user.id, row.program_id))) return { error: 'Not authorized' }

  const { error } = await service
    .from('volunteer_standing_assignments')
    .update({ is_active: false })
    .eq('id', standingId)

  if (error) return { error: error.message }
  revalidatePath('/settings/team')
  return { success: true }
}

// ── External Subscribers ──────────────────────────────────────────────────────

function buildExternalInviteEmail({
  name,
  programName,
  confirmUrl,
  unsubscribeUrl,
}: {
  name:         string
  programName:  string
  confirmUrl:   string
  unsubscribeUrl: string
}): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:40px 16px">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#1e293b;border-radius:16px;border:1px solid rgba(255,255,255,0.08);overflow:hidden">
      <tr><td style="background:#0ea5e9;padding:6px 0"></td></tr>
      <tr><td style="padding:32px 32px 24px">
        <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em">${programName}</p>
        <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#f1f5f9">Schedule Notifications</h1>
        <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#94a3b8">
          Hi ${name}, you've been invited to receive schedule change alerts from <strong style="color:#f1f5f9">${programName}</strong>.
          Click the button below to confirm your subscription.
        </p>
        <div style="text-align:center;margin:24px 0">
          <a href="${confirmUrl}" style="display:inline-block;background:#0ea5e9;color:#fff;font-size:15px;font-weight:600;text-decoration:none;padding:14px 32px;border-radius:10px">Confirm Subscription</a>
        </div>
        <p style="margin:16px 0 0;font-size:13px;color:#64748b">If you didn't expect this email, you can safely ignore it.</p>
      </td></tr>
      <tr><td style="padding:16px 32px 24px;border-top:1px solid rgba(255,255,255,0.06)">
        <p style="margin:0;font-size:12px;color:#475569">
          Sent via <a href="https://sidelineopshq.com" style="color:#0ea5e9;text-decoration:none">SidelineOps</a> ·
          <a href="${unsubscribeUrl}" style="color:#475569;text-decoration:underline">Unsubscribe</a>
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`
}

export async function createExternalSubscriber(
  programId: string,
  teamId:    string | null,
  name:      string,
  email:     string,
  type:      string,
) {
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  if (!(await assertProgramManageAccess(user.id, programId))) return { error: 'Not authorized' }

  const trimmedName  = name.trim()
  const trimmedEmail = email.trim().toLowerCase()
  if (!trimmedName)  return { error: 'Name is required' }
  if (!trimmedEmail) return { error: 'Email is required' }

  const service = createServiceClient()

  // Check for existing active subscriber with same email+program
  const { data: existing } = await service
    .from('external_subscribers')
    .select('id')
    .eq('program_id', programId)
    .eq('email', trimmedEmail)
    .eq('is_active', true)
    .maybeSingle()
  if (existing) return { error: 'This email is already subscribed.' }

  const { data: row, error: insertError } = await service
    .from('external_subscribers')
    .insert({
      program_id: programId,
      team_id:    teamId || null,
      name:       trimmedName,
      email:      trimmedEmail,
      type:       type || 'other',
      is_active:  true,
    })
    .select('id, token')
    .single()

  if (insertError || !row) return { error: insertError?.message ?? 'Failed to create subscriber' }

  // Send invite email
  try {
    const { data: program } = await service
      .from('programs')
      .select('name')
      .eq('id', programId)
      .single()

    const appUrl       = process.env.BASE_URL ?? 'https://sidelineopshq.com'
    const confirmUrl   = `${appUrl}/external-subscribe/confirm?token=${row.token}`
    const unsubUrl     = `${appUrl}/external-subscribe/unsubscribe?token=${row.token}`
    const programName  = program?.name ?? 'SidelineOps'

    const { Resend } = await import('resend')
    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({
      from:    `${programName} via SidelineOps <${process.env.NEXT_PUBLIC_FROM_EMAIL}>`,
      to:      trimmedEmail,
      subject: `You've been invited to receive schedule notifications from ${programName}`,
      html:    buildExternalInviteEmail({ name: trimmedName, programName, confirmUrl, unsubscribeUrl: unsubUrl }),
    })
  } catch (err) {
    console.error('[createExternalSubscriber] invite email failed:', err)
    // Don't fail the whole action if email fails
  }

  revalidatePath('/settings/team')
  return { success: true }
}

export async function resendExternalInvite(subscriberId: string) {
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const service = createServiceClient()

  const { data: sub } = await service
    .from('external_subscribers')
    .select('program_id, name, email, token')
    .eq('id', subscriberId)
    .single()
  if (!sub) return { error: 'Subscriber not found' }
  if (!(await assertProgramManageAccess(user.id, sub.program_id))) return { error: 'Not authorized' }

  try {
    const { data: program } = await service
      .from('programs')
      .select('name')
      .eq('id', sub.program_id)
      .single()

    const appUrl      = process.env.BASE_URL ?? 'https://sidelineopshq.com'
    const confirmUrl  = `${appUrl}/external-subscribe/confirm?token=${sub.token}`
    const unsubUrl    = `${appUrl}/external-subscribe/unsubscribe?token=${sub.token}`
    const programName = program?.name ?? 'SidelineOps'

    const { Resend } = await import('resend')
    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({
      from:    `${programName} via SidelineOps <${process.env.NEXT_PUBLIC_FROM_EMAIL}>`,
      to:      sub.email,
      subject: `You've been invited to receive schedule notifications from ${programName}`,
      html:    buildExternalInviteEmail({ name: sub.name, programName, confirmUrl, unsubscribeUrl: unsubUrl }),
    })
  } catch (err) {
    console.error('[resendExternalInvite] email failed:', err)
    return { error: 'Failed to send email. Please try again.' }
  }

  return { success: true }
}

export async function removeExternalSubscriber(subscriberId: string) {
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const service = createServiceClient()

  const { data: sub } = await service
    .from('external_subscribers')
    .select('program_id')
    .eq('id', subscriberId)
    .single()
  if (!sub) return { error: 'Subscriber not found' }
  if (!(await assertProgramManageAccess(user.id, sub.program_id))) return { error: 'Not authorized' }

  const { error } = await service
    .from('external_subscribers')
    .update({ is_active: false })
    .eq('id', subscriberId)

  if (error) return { error: error.message }
  revalidatePath('/settings/team')
  return { success: true }
}

export async function saveHomeLocation(
  programId: string,
  homeLocationName: string,
  homeLocationAddress: string,
) {
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Verify user has can_manage_events on at least one team in this program
  const { data: teams } = await authClient
    .from('teams')
    .select('id')
    .eq('program_id', programId)

  const teamIds = (teams ?? []).map(t => t.id)
  if (teamIds.length === 0) return { error: 'Not authorized' }

  const { data: teamUsers } = await authClient
    .from('team_users')
    .select('can_manage_events')
    .eq('user_id', user.id)
    .in('team_id', teamIds)

  if (!teamUsers?.some(t => t.can_manage_events)) return { error: 'Not authorized' }

  const service = createServiceClient()
  const { error } = await service
    .from('programs')
    .update({
      home_location_name:    homeLocationName.trim()    || null,
      home_location_address: homeLocationAddress.trim() || null,
    })
    .eq('id', programId)

  if (error) return { error: error.message }

  revalidatePath('/settings/team')
  return { success: true }
}

export async function saveTeamInfo(
  teamId: string,
  name: string,
  level: string,
  slug: string,
) {
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: teamUser } = await authClient
    .from('team_users')
    .select('can_manage_events')
    .eq('user_id', user.id)
    .eq('team_id', teamId)
    .single()

  if (!teamUser?.can_manage_events) return { error: 'Not authorized' }

  const trimmedSlug = slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  if (!name.trim()) return { error: 'Team name is required' }
  if (!trimmedSlug) return { error: 'Slug is required' }

  const service = createServiceClient()
  const { error } = await service
    .from('teams')
    .update({ name: name.trim(), level: level.trim() || null, slug: trimmedSlug })
    .eq('id', teamId)

  if (error) return { error: error.message }

  revalidatePath('/settings/team')
  revalidatePath('/dashboard')
  return { success: true }
}

export async function saveColors(
  teamId: string,
  primaryColor: string,
  secondaryColor: string,
) {
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: teamUser } = await authClient
    .from('team_users')
    .select('can_manage_events')
    .eq('user_id', user.id)
    .eq('team_id', teamId)
    .single()

  if (!teamUser?.can_manage_events) return { error: 'Not authorized' }

  const service = createServiceClient()
  const { error } = await service
    .from('teams')
    .update({ primary_color: primaryColor, secondary_color: secondaryColor })
    .eq('id', teamId)

  if (error) return { error: error.message }

  revalidatePath('/settings/team')
  return { success: true }
}

export async function uploadLogo(teamId: string, formData: FormData) {
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: teamUser } = await authClient
    .from('team_users')
    .select('can_manage_events')
    .eq('user_id', user.id)
    .eq('team_id', teamId)
    .single()

  if (!teamUser?.can_manage_events) return { error: 'Not authorized' }

  const file = formData.get('logo') as File | null
  if (!file || file.size === 0) return { error: 'No file provided' }

  const ACCEPTED = ['image/png', 'image/jpeg', 'image/svg+xml']
  if (!ACCEPTED.includes(file.type)) return { error: 'File must be PNG, JPG, or SVG' }
  if (file.size > 2 * 1024 * 1024) return { error: 'File must be under 2 MB' }

  const ext = file.type === 'image/svg+xml' ? 'svg'
             : file.type === 'image/jpeg'    ? 'jpg'
             : 'png'
  const storagePath = `${teamId}/logo.${ext}`

  const bytes = await file.arrayBuffer()
  const service = createServiceClient()

  const { error: uploadError } = await service.storage
    .from('team-assets')
    .upload(storagePath, bytes, { contentType: file.type, upsert: true })

  if (uploadError) return { error: uploadError.message }

  const { data: { publicUrl } } = service.storage
    .from('team-assets')
    .getPublicUrl(storagePath)

  const { error: updateError } = await service
    .from('teams')
    .update({ logo_url: publicUrl })
    .eq('id', teamId)

  if (updateError) return { error: updateError.message }

  revalidatePath('/settings/team')
  return { success: true, logoUrl: publicUrl }
}

export async function removeLogo(teamId: string) {
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: teamUser } = await authClient
    .from('team_users')
    .select('can_manage_events')
    .eq('user_id', user.id)
    .eq('team_id', teamId)
    .single()

  if (!teamUser?.can_manage_events) return { error: 'Not authorized' }

  const service = createServiceClient()

  // Determine storage path from the current logo_url
  const { data: team } = await service
    .from('teams')
    .select('logo_url')
    .eq('id', teamId)
    .single()

  if (team?.logo_url) {
    const marker = '/object/public/team-assets/'
    const idx = team.logo_url.indexOf(marker)
    if (idx !== -1) {
      const storagePath = team.logo_url.slice(idx + marker.length)
      await service.storage.from('team-assets').remove([storagePath])
    }
  }

  const { error } = await service
    .from('teams')
    .update({ logo_url: null })
    .eq('id', teamId)

  if (error) return { error: error.message }

  revalidatePath('/settings/team')
  return { success: true }
}
