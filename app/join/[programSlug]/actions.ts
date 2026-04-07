'use server'

import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { getBaseUrl } from '@/lib/utils/base-url'
import { generateUnsubscribeToken } from '@/lib/notifications/unsubscribe-token'

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export async function joinProgram(data: {
  programId:    string
  firstName:    string
  lastName:     string
  phone:        string
  email:        string
  smsConsent:   boolean
  playerId:     string | null
  playerName:   string | null   // display name for the confirmation email
  playerLevel:  string | null
  schoolName:   string
  sportName:    string
  programName:  string
  firstTeamSlug: string | null
}): Promise<{ error?: string; success?: true; contactId?: string }> {
  const phone = data.phone.replace(/\D/g, '')
  if (phone.length !== 10) return { error: 'Phone number must be 10 digits.' }
  if (!data.firstName.trim() || !data.lastName.trim()) {
    return { error: 'First and last name are required.' }
  }

  const supabase = svc()

  // ── Check for existing contact in this program ──────────────────────────────
  const { data: existing } = await supabase
    .from('contacts')
    .select('id')
    .eq('program_id', data.programId)
    .eq('phone', phone)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle()

  let contactId: string

  if (existing) {
    // Update existing contact
    await supabase
      .from('contacts')
      .update({
        first_name: data.firstName.trim(),
        last_name:  data.lastName.trim(),
        email:      data.email?.trim() || null,
        ...(data.smsConsent ? {
          sms_consent:       true,
          consent_timestamp: new Date().toISOString(),
          consent_source:    'program_join',
        } : {}),
      })
      .eq('id', existing.id)

    contactId = existing.id
  } else {
    // Create new contact
    const { data: newContact, error } = await supabase
      .from('contacts')
      .insert({
        program_id:        data.programId,
        team_id:           null,
        first_name:        data.firstName.trim(),
        last_name:         data.lastName.trim(),
        phone,
        email:             data.email?.trim() || null,
        contact_type:      'parent',
        sms_consent:       data.smsConsent,
        consent_timestamp: data.smsConsent ? new Date().toISOString() : null,
        consent_source:    'program_join',
        is_active:         true,
      })
      .select('id')
      .single()

    if (error || !newContact) {
      console.error('[joinProgram] insert contact error:', error)
      return { error: 'Could not save your information. Please try again.' }
    }
    contactId = newContact.id
  }

  // ── Link to player and contact_teams ────────────────────────────────────────
  if (data.playerId) {
    // Set player_id on contact
    await supabase
      .from('contacts')
      .update({ player_id: data.playerId })
      .eq('id', contactId)

    // Collect all teams this player belongs to
    const [{ data: playerRow }, { data: playerTeamRows }] = await Promise.all([
      supabase.from('players').select('team_id').eq('id', data.playerId).single(),
      supabase.from('player_teams').select('team_id').eq('player_id', data.playerId),
    ])

    const rawTeamIds = [
      playerRow?.team_id,
      ...((playerTeamRows ?? []).map((r: any) => r.team_id)),
    ].filter(Boolean) as string[]
    const uniqueTeamIds = [...new Set(rawTeamIds)]

    if (uniqueTeamIds.length > 0) {
      await supabase
        .from('contact_teams')
        .upsert(
          uniqueTeamIds.map(tid => ({ contact_id: contactId, team_id: tid })),
          { onConflict: 'contact_id,team_id' },
        )
    }
  }

  // ── Send confirmation email ──────────────────────────────────────────────────
  if (data.email?.trim()) {
    try {
      const appUrl        = getBaseUrl()
      const unsubToken    = generateUnsubscribeToken(contactId)
      const unsubscribeUrl = `${appUrl}/api/unsubscribe?token=${unsubToken}`
      const scheduleUrl   = data.firstTeamSlug
        ? `${appUrl}/schedule/${data.firstTeamSlug}`
        : appUrl

      const firstName = data.firstName.trim()
      const playerLine = data.playerId && data.playerName
        ? `<p style="margin:0 0 8px;font-size:14px;color:#e2e8f0;">
             You'll receive schedule updates for
             <strong style="color:#fff;">${esc(data.playerName)}</strong>
             ${data.playerLevel ? `on the <strong style="color:#fff;">${esc(data.playerLevel)}</strong> team` : ''}.
           </p>`
        : `<p style="margin:0 0 8px;font-size:14px;color:#94a3b8;">
             Your coach will connect you to your player's team shortly.
           </p>`

      const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
        <tr><td style="background:#1e293b;border-radius:16px 16px 0 0;padding:24px 32px;border-bottom:1px solid rgba(255,255,255,0.08);">
          <p style="margin:0;font-size:18px;font-weight:700;color:#fff;">${esc(data.programName)}</p>
          <p style="margin:4px 0 0;font-size:13px;color:#94a3b8;">You're signed up for schedule notifications</p>
        </td></tr>
        <tr><td style="background:#1e293b;border-radius:0 0 16px 16px;padding:32px;">
          <p style="margin:0 0 16px;font-size:15px;color:#e2e8f0;">Hi ${esc(firstName)},</p>
          <p style="margin:0 0 16px;font-size:15px;color:#94a3b8;line-height:1.6;">
            You're now signed up to receive notifications for ${esc(data.programName)}!
          </p>
          ${playerLine}
          <div style="background:#0f172a;border-radius:12px;border:1px solid rgba(255,255,255,0.08);padding:16px 20px;margin:20px 0;">
            <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.05em;">You'll receive</p>
            <p style="margin:2px 0;font-size:14px;color:#e2e8f0;">• Game schedule updates</p>
            <p style="margin:2px 0;font-size:14px;color:#e2e8f0;">• Change alerts for cancellations and time changes</p>
            <p style="margin:2px 0;font-size:14px;color:#e2e8f0;">• Weekly schedule digest (Sundays)</p>
          </div>
          <p style="margin:20px 0 0;">
            <a href="${scheduleUrl}" style="background:#0284c7;color:#fff;border-radius:10px;padding:10px 20px;font-size:14px;font-weight:600;text-decoration:none;">
              View Schedule
            </a>
          </p>
          <p style="margin:24px 0 0;font-size:12px;color:#334155;">
            <a href="${unsubscribeUrl}" style="color:#475569;text-decoration:underline;">Unsubscribe from emails</a>
          </p>
        </td></tr>
        <tr><td style="padding:16px 0 0;text-align:center;">
          <p style="margin:0;font-size:11px;color:#334155;">Sent via SidelineOps</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

      const resend = new Resend(process.env.RESEND_API_KEY)
      await resend.emails.send({
        from:    `${data.programName} via SidelineOps <${process.env.NEXT_PUBLIC_FROM_EMAIL}>`,
        to:      data.email.trim(),
        subject: `You're signed up for ${data.programName} updates`,
        html,
      })
    } catch (err) {
      console.error('[joinProgram] confirmation email error:', err)
      // Don't fail the signup if email fails
    }
  }

  return { success: true, contactId }
}

export async function regenerateProgramJoinToken(
  programId: string,
  teamId:    string, // used for permission check
): Promise<{ error?: string; token?: string }> {
  const { createClient: createServerClient } = await import('@/lib/supabase/server')
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const { data: teamUser } = await authClient
    .from('team_users')
    .select('can_manage_contacts, role')
    .eq('user_id', user.id)
    .eq('team_id', teamId)
    .single()

  if (!teamUser?.can_manage_contacts && teamUser?.role !== 'admin' && teamUser?.role !== 'coach') {
    return { error: 'You do not have permission to regenerate this link.' }
  }

  const { randomUUID } = await import('crypto')
  const newToken = randomUUID()

  const supabase = svc()
  const { error } = await supabase
    .from('programs')
    .update({ join_token: newToken, join_token_enabled: true })
    .eq('id', programId)

  if (error) {
    console.error('[regenerateProgramJoinToken]', error)
    return { error: 'Failed to regenerate link.' }
  }

  return { token: newToken }
}
