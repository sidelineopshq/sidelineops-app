'use server'

import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { generateVolunteerIcs, type IcsSlot } from '@/lib/utils/generate-ics'
import { formatTeamShortLabel } from '@/lib/utils/team-label'

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

function formatTime(time: string | null): string {
  if (!time) return ''
  const [h, m] = time.split(':')
  const hour   = parseInt(h)
  return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ── Phone lookup ──────────────────────────────────────────────────────────────

export async function lookupContactByPhone(
  programId:  string,
  phoneInput: string,
): Promise<
  | { found: false }
  | { found: true; contactId: string; firstName: string; fullName: string; email: string }
> {
  console.log('[PHONE LOOKUP] Raw input:', phoneInput)

  // Strip all non-digits, take last 10 (handles +1 country code)
  const normalizedPhone = phoneInput.replace(/\D/g, '').slice(-10)
  console.log('[PHONE LOOKUP] Normalized:', normalizedPhone)

  if (normalizedPhone.length !== 10) {
    console.log('[PHONE LOOKUP] Rejected — not 10 digits after normalization')
    return { found: false }
  }

  const service = svc()

  const { data: teams } = await service
    .from('teams')
    .select('id')
    .eq('program_id', programId)

  const teamIds = (teams ?? []).map(t => t.id)
  console.log('[PHONE LOOKUP] Program team IDs:', teamIds)
  if (teamIds.length === 0) return { found: false }

  // Step 1: get contact IDs linked via contact_teams junction table
  const { data: ctRows } = await service
    .from('contact_teams')
    .select('contact_id')
    .in('team_id', teamIds)
  const ctContactIds = (ctRows ?? []).map(r => r.contact_id)
  console.log('[PHONE LOOKUP] Junction-table contact IDs:', ctContactIds.length)

  // Step 2: query contacts — match by phone using both legacy team_id and junction table
  console.log('[PHONE LOOKUP] Querying for phone:', normalizedPhone)
  const builder = service
    .from('contacts')
    .select('id, first_name, last_name, email')
    .eq('phone', normalizedPhone)
    .is('deleted_at', null)
    .limit(1)

  const { data: contact, error } = ctContactIds.length > 0
    ? await builder.or(`team_id.in.(${teamIds.join(',')}),id.in.(${ctContactIds.join(',')})`).maybeSingle()
    : await builder.in('team_id', teamIds).maybeSingle()

  console.log('[PHONE LOOKUP] Result:', JSON.stringify(contact))
  console.log('[PHONE LOOKUP] Error:', JSON.stringify(error))

  if (!contact) return { found: false }

  const fullName = `${contact.first_name} ${contact.last_name ?? ''}`.trim()
  return {
    found:     true,
    contactId: contact.id,
    firstName: contact.first_name,
    fullName,
    email:     contact.email ?? '',
  }
}

// ── Signup submission ─────────────────────────────────────────────────────────

export type SignupSlotResult = {
  slotId:          string
  eventDate:       string
  eventLabel:      string
  teamLabel:       string
  roleName:        string
  startTime:       string | null
  endTime:         string | null
  locationName:    string | null
  locationAddress: string | null
  filled:          boolean
}

export async function submitVolunteerSignup(data: {
  programId:      string
  teamId:         string
  slotIds:        string[]
  volunteerName:  string
  volunteerEmail: string
  contactId?:     string
  schoolName:     string
  sportName:      string
}): Promise<{
  error?:      string
  success?:    true
  results?:    SignupSlotResult[]
  icsContent?: string
}> {
  const { programId, slotIds, volunteerName, volunteerEmail, contactId, schoolName, sportName } = data
  const name  = volunteerName.trim()
  const email = volunteerEmail.trim()
  if (!name)            return { error: 'Name is required.' }
  if (!email)           return { error: 'Email is required.' }
  if (!slotIds.length)  return { error: 'No slots selected.' }

  const service = svc()

  // Fetch slot + event details for all selected slots
  const { data: slotRows } = await service
    .from('event_volunteer_slots')
    .select(`
      id, slot_count, start_time, end_time,
      volunteer_roles(name),
      events(
        id, event_type, title, opponent, is_home, event_date,
        location_name, location_address
      )
    `)
    .in('id', slotIds)

  if (!slotRows || slotRows.length === 0) return { error: 'Invalid slots.' }

  // Fetch team levels for each event so we can label them in the email
  const eventIds = [...new Set(slotRows.map(s => (s.events as any)?.id).filter(Boolean))]
  const teamLabelByEvent = new Map<string, string>()
  if (eventIds.length > 0) {
    const { data: etdRows } = await service
      .from('event_team_details')
      .select('event_id, teams(level)')
      .in('event_id', eventIds)
    for (const row of etdRows ?? []) {
      const level = (row.teams as any)?.level ?? ''
      const label = formatTeamShortLabel(level)
      if (!label) continue
      const existing = teamLabelByEvent.get(row.event_id)
      teamLabelByEvent.set(row.event_id, existing ? `${existing} · ${label}` : label)
    }
  }

  const results: SignupSlotResult[] = []

  for (const slotRow of slotRows) {
    const event    = slotRow.events as any
    const roleBase = (slotRow.volunteer_roles as any)?.name ?? 'Volunteer'
    const startT   = slotRow.start_time  as string | null
    const endT     = slotRow.end_time    as string | null

    const roleName = (() => {
      if (!startT && !endT) return roleBase
      const parts = [startT && formatTime(startT), endT && formatTime(endT)].filter(Boolean)
      return `${roleBase} (${parts.join(' – ')})`
    })()

    const label = (() => {
      if (!event)                             return 'Event'
      if (event.event_type === 'practice')    return 'Practice'
      if (event.event_type === 'meeting')     return 'Team Meeting'
      if (event.event_type === 'tournament')  return event.title ?? 'Tournament'
      if (event.opponent) return `${event.is_home ? 'vs' : '@'} ${event.opponent}`
      return event.title ?? 'Event'
    })()

    // Race-condition-safe fill check
    const { count } = await service
      .from('volunteer_assignments')
      .select('id', { count: 'exact', head: true })
      .eq('event_volunteer_slot_id', slotRow.id)
      .neq('status', 'cancelled')

    const teamLabel = teamLabelByEvent.get(event?.id ?? '') ?? ''

    if ((count ?? 0) >= slotRow.slot_count) {
      results.push({
        slotId:          slotRow.id,
        eventDate:       event?.event_date ?? '',
        eventLabel:      label,
        teamLabel,
        roleName,
        startTime:       startT,
        endTime:         endT,
        locationName:    event?.location_name    ?? null,
        locationAddress: event?.location_address ?? null,
        filled:          true,
      })
      continue
    }

    const { error: insertError } = await service
      .from('volunteer_assignments')
      .insert({
        event_volunteer_slot_id: slotRow.id,
        contact_id:              contactId || null,
        volunteer_name:          name,
        volunteer_email:         email,
        status:                  'assigned',
        signup_source:           'self',
      })

    if (insertError) {
      results.push({
        slotId:          slotRow.id,
        eventDate:       event?.event_date ?? '',
        eventLabel:      label,
        teamLabel,
        roleName,
        startTime:       startT,
        endTime:         endT,
        locationName:    event?.location_name    ?? null,
        locationAddress: event?.location_address ?? null,
        filled:          true,
      })
      continue
    }

    results.push({
      slotId:          slotRow.id,
      eventDate:       event?.event_date ?? '',
      eventLabel:      label,
      teamLabel,
      roleName,
      startTime:       startT,
      endTime:         endT,
      locationName:    event?.location_name    ?? null,
      locationAddress: event?.location_address ?? null,
      filled:          false,
    })
  }

  const savedSlots = results.filter(r => !r.filled)

  if (savedSlots.length === 0) {
    return {
      error:   'Sorry, all selected slots filled up just as you were signing up. Please try again.',
      results,
    }
  }

  // Generate ICS for saved slots
  const icsSlots: IcsSlot[] = savedSlots.map(r => ({
    eventDate:       r.eventDate,
    eventTitle:      r.eventLabel,
    roleName:        r.roleName,
    startTime:       r.startTime,
    endTime:         r.endTime,
    locationName:    r.locationName,
    locationAddress: r.locationAddress,
  }))
  const icsContent = generateVolunteerIcs(icsSlots, name)

  // Send confirmation email
  if (email) {
    try {
      // Group by event date for email body
      const grouped = new Map<string, SignupSlotResult[]>()
      for (const s of savedSlots) {
        if (!grouped.has(s.eventDate)) grouped.set(s.eventDate, [])
        grouped.get(s.eventDate)!.push(s)
      }

      const eventBlocksHtml = Array.from(grouped.entries()).map(([date, slots]) => {
        const slotLines = slots.map(s =>
          `<p style="margin:2px 0;font-size:14px;color:#e2e8f0;">• ${esc(s.roleName)}</p>`
        ).join('')
        const teamBadge = slots[0]?.teamLabel
          ? `<span style="display:inline-block;background:#1e3a5f;color:#93c5fd;font-size:11px;font-weight:600;padding:1px 8px;border-radius:99px;margin-left:8px;">${esc(slots[0].teamLabel)}</span>`
          : ''
        return `<div style="margin-bottom:16px;">
          <p style="margin:0 0 4px;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;">${esc(formatDate(date))}</p>
          <p style="margin:0 0 6px;font-size:14px;color:#cbd5e1;font-weight:600;">${esc(slots[0]?.eventLabel ?? '')}${teamBadge}</p>
          ${slotLines}
        </div>`
      }).join('')

      const firstName = name.split(' ')[0]
      const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
        <tr><td style="background:#1e293b;border-radius:16px 16px 0 0;padding:24px 32px;border-bottom:1px solid rgba(255,255,255,0.08);">
          <p style="margin:0;font-size:18px;font-weight:700;color:#fff;">${esc(schoolName)} ${esc(sportName)}</p>
          <p style="margin:4px 0 0;font-size:13px;color:#94a3b8;">Volunteer Sign-Up Confirmation</p>
        </td></tr>
        <tr><td style="background:#1e293b;border-radius:0 0 16px 16px;padding:32px;">
          <p style="margin:0 0 16px;font-size:15px;color:#e2e8f0;">Hi ${esc(firstName)},</p>
          <p style="margin:0 0 24px;font-size:15px;color:#94a3b8;line-height:1.6;">
            Thanks for signing up to volunteer for ${esc(schoolName)} ${esc(sportName)}! Here's what you're signed up for:
          </p>
          <div style="background:#0f172a;border-radius:12px;border:1px solid rgba(255,255,255,0.08);padding:20px 24px;margin-bottom:24px;">
            ${eventBlocksHtml}
          </div>
          <p style="margin:0;font-size:13px;color:#475569;line-height:1.6;">
            We'll see you out there!<br>
            — ${esc(schoolName)} ${esc(sportName)} Team
          </p>
        </td></tr>
        <tr><td style="padding:20px 0 0;text-align:center;">
          <p style="margin:0;font-size:11px;color:#334155;">Sent via SidelineOps</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

      const resend = new Resend(process.env.RESEND_API_KEY)
      await resend.emails.send({
        from:    `${schoolName} ${sportName} via SidelineOps <${process.env.NEXT_PUBLIC_FROM_EMAIL}>`,
        to:      email,
        subject: `You're signed up to volunteer — ${schoolName} ${sportName}`,
        html,
        attachments: [{
          filename: 'volunteer-schedule.ics',
          content:  Buffer.from(icsContent).toString('base64'),
        }],
      })
    } catch (err) {
      console.error('[submitVolunteerSignup] email error:', err)
    }
  }

  return { success: true, results, icsContent }
}
