'use server'

import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { Resend } from 'resend'
import { generateUnsubscribeToken } from '@/lib/notifications/unsubscribe-token'
import { formatProgramLabel } from '@/lib/utils/team-label'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

async function assertProgramManageAccess(userId: string, programId: string): Promise<boolean> {
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

// ── Template slot actions ─────────────────────────────────────────────────────

export async function createTemplateSlot(
  programId: string,
  data: {
    volunteer_role_id: string
    slot_count:        number
    start_time?:       string
    end_time?:         string
    notes?:            string
  },
) {
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  if (!(await assertProgramManageAccess(user.id, programId))) return { error: 'Not authorized' }

  const service = createServiceClient()
  const { error } = await service
    .from('volunteer_slot_templates')
    .insert({
      program_id:        programId,
      volunteer_role_id: data.volunteer_role_id,
      slot_count:        data.slot_count,
      start_time:        data.start_time || null,
      end_time:          data.end_time   || null,
      notes:             data.notes      || null,
      is_active:         true,
    })

  if (error) return { error: error.message }
  revalidatePath('/settings/team')
  return { success: true }
}

export async function updateTemplateSlot(
  slotId: string,
  data: {
    volunteer_role_id: string
    slot_count:        number
    start_time?:       string
    end_time?:         string
    notes?:            string
  },
) {
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const service = createServiceClient()
  const { data: row } = await service
    .from('volunteer_slot_templates')
    .select('program_id')
    .eq('id', slotId)
    .single()
  if (!row) return { error: 'Template slot not found' }
  if (!(await assertProgramManageAccess(user.id, row.program_id))) return { error: 'Not authorized' }

  const { error } = await service
    .from('volunteer_slot_templates')
    .update({
      volunteer_role_id: data.volunteer_role_id,
      slot_count:        data.slot_count,
      start_time:        data.start_time || null,
      end_time:          data.end_time   || null,
      notes:             data.notes      || null,
    })
    .eq('id', slotId)

  if (error) return { error: error.message }
  revalidatePath('/settings/team')
  return { success: true }
}

export async function removeTemplateSlot(slotId: string) {
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const service = createServiceClient()
  const { data: row } = await service
    .from('volunteer_slot_templates')
    .select('program_id')
    .eq('id', slotId)
    .single()
  if (!row) return { error: 'Template slot not found' }
  if (!(await assertProgramManageAccess(user.id, row.program_id))) return { error: 'Not authorized' }

  const { error } = await service
    .from('volunteer_slot_templates')
    .update({ is_active: false })
    .eq('id', slotId)

  if (error) return { error: error.message }
  revalidatePath('/settings/team')
  return { success: true }
}

export async function applyTemplateToRemainingGames(programId: string): Promise<
  { error: string } | { eventsProcessed: number; slotsAdded: number; slotsSkipped: number }
> {
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  if (!(await assertProgramManageAccess(user.id, programId))) return { error: 'Not authorized' }

  const service = createServiceClient()

  const { data: templates } = await service
    .from('volunteer_slot_templates')
    .select('id, volunteer_role_id, slot_count, start_time, end_time, notes')
    .eq('program_id', programId)
    .eq('is_active', true)

  if (!templates?.length) return { error: 'No template slots configured.' }

  const { data: teamRows } = await service
    .from('teams')
    .select('id')
    .eq('program_id', programId)

  const teamIds = (teamRows ?? []).map((t: any) => t.id)
  if (!teamIds.length) return { error: 'No teams found.' }

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })

  const { data: eventDetails } = await service
    .from('event_team_details')
    .select('event_id')
    .in('team_id', teamIds)

  const allEventIds = [...new Set((eventDetails ?? []).map((d: any) => d.event_id))]
  if (!allEventIds.length) return { eventsProcessed: 0, slotsAdded: 0, slotsSkipped: 0 }

  const { data: upcomingEvents } = await service
    .from('events')
    .select('id')
    .in('id', allEventIds)
    .gte('event_date', today)
    .eq('is_home', true)
    .eq('status', 'scheduled')

  if (!upcomingEvents?.length) return { eventsProcessed: 0, slotsAdded: 0, slotsSkipped: 0 }

  const { data: standingRaw } = await service
    .from('volunteer_standing_assignments')
    .select('id, volunteer_role_id, contact_id, volunteer_name, volunteer_email, contacts(first_name, last_name, email)')
    .eq('program_id', programId)
    .eq('is_active', true)

  let slotsAdded = 0
  let slotsSkipped = 0

  for (const event of upcomingEvents) {
    for (const tpl of templates) {
      let dupQuery = service
        .from('event_volunteer_slots')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', event.id)
        .eq('volunteer_role_id', tpl.volunteer_role_id)

      if (tpl.start_time === null) {
        dupQuery = dupQuery.is('start_time', null)
      } else {
        dupQuery = dupQuery.eq('start_time', tpl.start_time)
      }
      if (tpl.end_time === null) {
        dupQuery = dupQuery.is('end_time', null)
      } else {
        dupQuery = dupQuery.eq('end_time', tpl.end_time)
      }

      const { count } = await dupQuery
      if ((count ?? 0) > 0) { slotsSkipped++; continue }

      const { data: newSlot, error: insertErr } = await service
        .from('event_volunteer_slots')
        .insert({
          event_id:          event.id,
          volunteer_role_id: tpl.volunteer_role_id,
          slot_count:        tpl.slot_count,
          start_time:        tpl.start_time,
          end_time:          tpl.end_time,
          notes:             tpl.notes,
        })
        .select('id, volunteer_role_id, slot_count')
        .single()

      if (insertErr || !newSlot) { console.error('[applyTemplate] insert error:', insertErr); continue }

      slotsAdded++

      // Auto-apply standing assignments
      const matchingStanding = (standingRaw ?? []).filter(
        (s: any) => s.volunteer_role_id === newSlot.volunteer_role_id
      )
      for (const standing of matchingStanding as any[]) {
        const { count: filledCount } = await service
          .from('volunteer_assignments')
          .select('id', { count: 'exact', head: true })
          .eq('event_volunteer_slot_id', newSlot.id)
          .neq('status', 'cancelled')

        if ((filledCount ?? 0) >= newSlot.slot_count) break

        const contact       = standing.contacts as any
        const volunteerName = standing.volunteer_name
          ?? (contact ? `${contact.first_name} ${contact.last_name ?? ''}`.trim() : null)
        const volunteerEmail = standing.volunteer_email ?? contact?.email ?? null

        if (!volunteerName) continue

        await service.from('volunteer_assignments').insert({
          event_volunteer_slot_id: newSlot.id,
          contact_id:              standing.contact_id ?? null,
          volunteer_name:          volunteerName,
          volunteer_email:         volunteerEmail,
          status:                  'assigned',
          signup_source:           'standing',
        })
      }
    }
  }

  revalidatePath('/settings/team')
  return { eventsProcessed: upcomingEvents.length, slotsAdded, slotsSkipped }
}

// ── regenerateSignupToken ─────────────────────────────────────────────────────

export async function regenerateSignupToken(teamId: string): Promise<
  { error: string } | { success: true; token: string }
> {
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: teamUser } = await authClient
    .from('team_users')
    .select('can_manage_volunteers, role')
    .eq('user_id', user.id)
    .eq('team_id', teamId)
    .single()

  if (!teamUser?.can_manage_volunteers && teamUser?.role !== 'admin') {
    return { error: 'Not authorized' }
  }

  const token = crypto.randomUUID()
  const service = createServiceClient()

  const { error } = await service
    .from('teams')
    .update({ volunteer_signup_token: token })
    .eq('id', teamId)

  if (error) return { error: error.message }

  revalidatePath('/volunteers')
  return { success: true, token }
}

// ── sendHelpNeededNotification ────────────────────────────────────────────────

function formatTime12(time: string | null): string | null {
  if (!time) return null
  const [h, m] = time.split(':')
  const hour = parseInt(h)
  return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`
}

function formatEventDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  })
}

function formatEventDateShort(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  })
}

export async function sendHelpNeededNotification(
  eventId: string,
  teamId:  string,
): Promise<
  | { success: false; error: string }
  | { success: false; message: string }
  | { success: true;  sent: number; unfilledSlots: number }
> {
  // ── 1. Auth + permission check ──────────────────────────────────────────────
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const { data: teamUser } = await authClient
    .from('team_users')
    .select('can_manage_volunteers')
    .eq('user_id', user.id)
    .eq('team_id', teamId)
    .single()

  if (!teamUser?.can_manage_volunteers) {
    return { success: false, error: 'Not authorized' }
  }

  const service = createServiceClient()

  // ── 2. Fetch event details ──────────────────────────────────────────────────
  const { data: eventRow } = await service
    .from('events')
    .select(`
      id, event_date, opponent, title, location_name, program_id,
      event_team_details!inner(start_time, team_id)
    `)
    .eq('id', eventId)
    .single()

  if (!eventRow) return { success: false, error: 'Event not found' }

  const etd = (eventRow as any).event_team_details?.find(
    (d: any) => d.team_id === teamId,
  )
  const eventStartTime: string | null = etd?.start_time ?? null
  const programId = eventRow.program_id as string

  // ── 3. Fetch unfilled slots ─────────────────────────────────────────────────
  const { data: rawSlots } = await service
    .from('event_volunteer_slots')
    .select(`
      id, slot_count, start_time, end_time,
      volunteer_roles!volunteer_role_id(name),
      volunteer_assignments!event_volunteer_slot_id(id, status)
    `)
    .eq('event_id', eventId)

  type SlotRow = {
    id:         string
    slot_count: number
    start_time: string | null
    end_time:   string | null
    role_name:  string
    open_spots: number
  }

  const unfilledSlots: SlotRow[] = (rawSlots ?? []).reduce<SlotRow[]>((acc, s: any) => {
    const filled = (s.volunteer_assignments ?? []).filter(
      (a: any) => a.status !== 'cancelled',
    ).length
    const open = s.slot_count - filled
    if (open > 0) {
      acc.push({
        id:         s.id,
        slot_count: s.slot_count,
        start_time: s.start_time ?? null,
        end_time:   s.end_time   ?? null,
        role_name:  (s.volunteer_roles as any)?.name ?? 'Volunteer',
        open_spots: open,
      })
    }
    return acc
  }, [])

  if (unfilledSlots.length === 0) {
    return { success: false, message: 'No unfilled slots' }
  }

  // ── 4. Fetch team slug + signup token ───────────────────────────────────────
  const { data: team } = await service
    .from('teams')
    .select('slug, volunteer_signup_token, level, programs!inner(sport, schools!inner(name))')
    .eq('id', teamId)
    .single()

  const teamSlug         = team?.slug ?? null
  const signupToken      = (team as any)?.volunteer_signup_token ?? null
  const schoolName       = (team as any)?.programs?.schools?.name ?? ''
  const sport            = (team as any)?.programs?.sport          ?? ''
  const teamLabel        = formatProgramLabel(schoolName, sport)

  // ── 5. Fetch all active contacts with email for this program ────────────────
  const { data: programTeams } = await service
    .from('teams')
    .select('id')
    .eq('program_id', programId)

  const programTeamIds = (programTeams ?? []).map((t: any) => t.id)

  const { data: contacts } = await service
    .from('contacts')
    .select('id, first_name, email')
    .in('team_id', programTeamIds)
    .not('email', 'is', null)
    .eq('email_unsubscribed', false)
    .is('deleted_at', null)

  if (!contacts?.length) {
    return { success: false, error: 'No contacts to notify' }
  }

  // ── 6. Build and send emails ────────────────────────────────────────────────
  const appUrl    = process.env.BASE_URL ?? 'https://sidelineopshq.com'
  const resend    = new Resend(process.env.RESEND_API_KEY)
  const fromEmail = process.env.NEXT_PUBLIC_FROM_EMAIL!

  const { data: program } = await service
    .from('programs')
    .select('name')
    .eq('id', programId)
    .single()

  const programName  = teamLabel || program?.name || 'SidelineOps'
  const from         = `${programName} via SidelineOps <${fromEmail}>`

  const opponentLabel  = eventRow.opponent ?? eventRow.title ?? 'Upcoming Game'
  const subjectDate    = formatEventDateShort(eventRow.event_date)
  const subject        = `Volunteers Needed — ${subjectDate} vs ${opponentLabel}`

  const displayDate    = formatEventDate(eventRow.event_date)
  const displayTime    = formatTime12(eventStartTime)
  const locationLine   = [displayTime, eventRow.location_name].filter(Boolean).join(' · ')

  const slotBullets = unfilledSlots
    .map(s => {
      const times = [formatTime12(s.start_time), formatTime12(s.end_time)]
        .filter(Boolean).join('–')
      const timeStr = times ? ` (${times})` : ''
      return `<li style="margin:4px 0;color:#cbd5e1;">${s.role_name}${timeStr} — ${s.open_spots} spot${s.open_spots !== 1 ? 's' : ''} open</li>`
    })
    .join('')

  const signupPath = teamSlug
    ? `${appUrl}/volunteer/${teamSlug}${signupToken ? `?t=${signupToken}` : ''}`
    : null

  const signupBlock = signupPath
    ? `<p style="margin:20px 0 0;">
        <a href="${signupPath}"
           style="display:inline-block;background:#0284c7;color:#fff;text-decoration:none;padding:12px 24px;border-radius:10px;font-size:14px;font-weight:600;">
          Sign Up to Volunteer
        </a>
       </p>`
    : ''

  let sent   = 0
  let failed = 0
  const batchSize = 10

  for (let i = 0; i < contacts.length; i += batchSize) {
    const batch = contacts.slice(i, i + batchSize)
    const results = await Promise.all(
      batch.map(c => {
        const unsubToken   = generateUnsubscribeToken(c.id)
        const unsubUrl     = `${appUrl}/api/unsubscribe?token=${unsubToken}`

        const html = `<!DOCTYPE html><html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:40px 16px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
<tr><td style="background:#1e293b;border-radius:16px;padding:32px;">
  <p style="color:#94a3b8;font-size:13px;margin:0 0 8px 0;">${programName}</p>
  <h2 style="color:#f1f5f9;font-size:20px;margin:0 0 20px 0;">We Still Need Volunteers!</h2>
  <p style="color:#cbd5e1;font-size:15px;margin:0 0 16px 0;">Hi ${c.first_name},</p>
  <p style="color:#cbd5e1;font-size:15px;margin:0 0 16px 0;">
    We still need volunteers for our upcoming game:
  </p>
  <div style="background:#0f172a;border-radius:10px;padding:16px;margin:0 0 20px 0;">
    <p style="color:#f1f5f9;font-weight:600;font-size:15px;margin:0 0 4px 0;">${displayDate}</p>
    ${locationLine ? `<p style="color:#94a3b8;font-size:13px;margin:0;">vs ${opponentLabel} · ${locationLine}</p>` : `<p style="color:#94a3b8;font-size:13px;margin:0;">vs ${opponentLabel}</p>`}
  </div>
  <p style="color:#e2e8f0;font-size:14px;font-weight:600;margin:0 0 8px 0;">Open Volunteer Slots</p>
  <ul style="margin:0 0 20px 0;padding:0 0 0 18px;">${slotBullets}</ul>
  ${signupBlock}
  <p style="color:#cbd5e1;font-size:15px;margin:20px 0 0 0;">
    Thank you for supporting ${teamLabel}!
  </p>
  <p style="color:#475569;font-size:12px;margin:24px 0 0 0;border-top:1px solid rgba(255,255,255,0.08);padding-top:16px;">
    <a href="${unsubUrl}" style="color:#475569;">Unsubscribe</a>
  </p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`

        return resend.emails.send({ from, to: c.email!, subject, html })
          .catch(() => ({ error: true as const }))
      })
    )
    results.forEach(r => ('error' in r && r.error) ? failed++ : sent++)
  }

  // ── 7. Log to notification_log ──────────────────────────────────────────────
  await service.from('notification_log').insert({
    team_id:           teamId,
    event_id:          eventId,
    notification_type: 'volunteer_help_needed',
    recipient_group:   'all_contacts',
    subject,
    sent_count:        sent,
    failed_count:      failed,
  })

  // ── 8. Return summary ───────────────────────────────────────────────────────
  return { success: true, sent, unfilledSlots: unfilledSlots.length }
}
