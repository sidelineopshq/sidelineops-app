'use server'

import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function formatTime(time: string | null): string {
  if (!time) return ''
  const [hourStr, minuteStr] = time.split(':')
  const hour = parseInt(hourStr)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const hour12 = hour % 12 || 12
  return `${hour12}:${minuteStr} ${ampm}`
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })
}

function buildConfirmationEmail({
  volunteerName,
  roleName,
  eventLabel,
  eventDate,
  startTime,
  locationName,
  programName,
}: {
  volunteerName: string
  roleName:      string
  eventLabel:    string
  eventDate:     string
  startTime:     string | null
  locationName:  string | null
  programName:   string
}): string {
  const formattedDate = formatDate(eventDate)

  const rows = [
    { label: 'Role',     value: roleName },
    { label: 'Event',    value: eventLabel },
    { label: 'Date',     value: formattedDate },
    ...(startTime   ? [{ label: 'Time',     value: formatTime(startTime) }]  : []),
    ...(locationName ? [{ label: 'Location', value: locationName }]           : []),
  ]

  const rowsHtml = rows.map(r => `
    <tr>
      <td style="padding:6px 0;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;width:100px;">${esc(r.label)}</td>
      <td style="padding:6px 0;font-size:14px;color:#e2e8f0;">${esc(r.value)}</td>
    </tr>`).join('')

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Volunteer Confirmation</title></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

        <tr><td style="background:#1e293b;border-radius:16px 16px 0 0;padding:24px 32px;border-bottom:1px solid rgba(255,255,255,0.08);">
          <p style="margin:0;font-size:18px;font-weight:700;color:#fff;">${esc(programName)}</p>
          <p style="margin:4px 0 0;font-size:13px;color:#94a3b8;">Volunteer Confirmation</p>
        </td></tr>

        <tr><td style="background:#1e293b;border-radius:0 0 16px 16px;padding:32px;">
          <p style="margin:0 0 16px;font-size:15px;color:#e2e8f0;">Hi ${esc(volunteerName)},</p>
          <p style="margin:0 0 24px;font-size:15px;color:#94a3b8;line-height:1.6;">
            You're signed up to volunteer. Here are your details:
          </p>

          <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;border-radius:12px;border:1px solid rgba(255,255,255,0.08);margin-bottom:24px;">
            <tr><td style="padding:20px 24px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                ${rowsHtml}
              </table>
            </td></tr>
          </table>

          <p style="margin:0;font-size:13px;color:#475569;line-height:1.6;">
            If you need to cancel or have questions, contact the coaching staff directly.
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
}

export async function publicSignup(
  token: string,
  data: { volunteer_name: string; volunteer_email: string },
) {
  const name  = data.volunteer_name.trim()
  const email = data.volunteer_email.trim()
  if (!name)  return { error: 'Name is required.' }
  if (!email) return { error: 'Email is required.' }

  const svc = serviceClient()

  // Look up the slot with event + role info
  const { data: slot } = await svc
    .from('event_volunteer_slots')
    .select(`
      id, slot_count, start_time, end_time,
      volunteer_roles(name),
      events(
        id, event_type, title, opponent, is_home, event_date,
        default_start_time, location_name, program_id,
        programs(name)
      )
    `)
    .eq('signup_token', token)
    .single()

  if (!slot) return { error: 'Invalid signup link.' }

  // Race-condition-safe fill check
  const { count } = await svc
    .from('volunteer_assignments')
    .select('id', { count: 'exact', head: true })
    .eq('event_volunteer_slot_id', slot.id)
    .neq('status', 'cancelled')

  if ((count ?? 0) >= slot.slot_count) {
    return { error: 'This volunteer slot is already full.' }
  }

  // Insert assignment
  const { error: insertError } = await svc
    .from('volunteer_assignments')
    .insert({
      event_volunteer_slot_id: slot.id,
      volunteer_name:          name,
      volunteer_email:         email,
      status:                  'assigned',
      signup_source:           'self',
    })

  if (insertError) return { error: insertError.message }

  // Send confirmation email (non-blocking — don't fail signup if email fails)
  const event        = slot.events as any
  const program      = event?.programs as any
  const roleBaseName = (slot.volunteer_roles as any)?.name ?? 'Volunteer'
  const startTime    = slot.start_time ?? event?.default_start_time ?? null

  // Show time range in role label if slot has its own start/end time
  const roleName = (() => {
    if (!slot.start_time && !slot.end_time) return roleBaseName
    const parts: string[] = []
    if (slot.start_time) parts.push(formatTime(slot.start_time))
    if (slot.end_time)   parts.push(formatTime(slot.end_time))
    return `${roleBaseName} (${parts.join(' – ')})`
  })()

  function eventLabel(): string {
    if (event.event_type === 'practice')   return 'Practice'
    if (event.event_type === 'meeting')    return 'Team Meeting'
    if (event.event_type === 'tournament') return event.title ?? 'Tournament'
    if (event.opponent) return `${event.is_home ? 'vs' : '@'} ${event.opponent}`
    return event.title ?? 'Event'
  }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({
      from:    `${program?.name ?? 'SidelineOps'} via SidelineOps <${process.env.NEXT_PUBLIC_FROM_EMAIL}>`,
      to:      email,
      subject: `You're signed up to volunteer — ${event?.event_date ? formatDate(event.event_date) : 'upcoming event'}`,
      html:    buildConfirmationEmail({
        volunteerName: name,
        roleName,
        eventLabel:    eventLabel(),
        eventDate:     event.event_date,
        startTime,
        locationName:  event.location_name ?? null,
        programName:   program?.name ?? '',
      }),
    })
  } catch (err) {
    console.error('[publicSignup] email failed:', err)
  }

  return {
    success:   true,
    eventDate: event?.event_date as string,
    eventLabel: eventLabel(),
    roleName,
    startTime,
    locationName: event?.location_name as string | null,
  }
}
