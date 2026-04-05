import { NextRequest, NextResponse } from 'next/server'
import { createClient }             from '@supabase/supabase-js'
import { Resend }                   from 'resend'
import { getBaseUrl }               from '@/lib/utils/base-url'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// ── Date helpers ──────────────────────────────────────────────────────────────

/** Tomorrow's date string (YYYY-MM-DD) in America/Chicago. */
function tomorrowCentral(): string {
  const now = new Date()
  // Advance by 1 day, then format in Central time
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  return tomorrow.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
}

function formatDateLong(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })
}

function formatTime(time: string | null): string {
  if (!time) return ''
  const [h, m] = time.split(':')
  const hour = parseInt(h)
  return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function slotLabel(roleName: string, startTime: string | null, endTime: string | null): string {
  if (!startTime && !endTime) return roleName
  const parts = [startTime && formatTime(startTime), endTime && formatTime(endTime)].filter(Boolean)
  return `${roleName} (${parts.join(' – ')})`
}

function eventLabel(event: {
  event_type: string; title: string | null;
  opponent: string | null; is_home: boolean | null
}): string {
  if (event.event_type === 'practice')   return 'Practice'
  if (event.event_type === 'meeting')    return 'Team Meeting'
  if (event.event_type === 'tournament') return event.title ?? 'Tournament'
  if (event.opponent) return `${event.is_home ? 'vs' : '@'} ${event.opponent}`
  return event.title ?? 'Event'
}

// ── Email builders ────────────────────────────────────────────────────────────

function buildAdminReminderEmail({
  programName,
  eventLabel,
  eventDate,
  startTime,
  locationName,
  unfilled,
  signupPageUrl,
}: {
  programName:    string
  eventLabel:     string
  eventDate:      string
  startTime:      string | null
  locationName:   string | null
  unfilled:       { roleName: string; open: number; total: number }[]
  signupPageUrl:  string | null
}): string {
  const slotRows = unfilled.map(s => `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
          <p style="margin:0;font-size:14px;font-weight:600;color:#e2e8f0;">${esc(s.roleName)}</p>
          <p style="margin:2px 0 0;font-size:12px;color:#94a3b8;">
            ${s.open} of ${s.total} spot${s.total !== 1 ? 's' : ''} unfilled
          </p>
        </td>
      </tr>`).join('')

  const details = [
    { label: 'Event',    value: eventLabel },
    { label: 'Date',     value: formatDateLong(eventDate) },
    ...(startTime    ? [{ label: 'Time',     value: formatTime(startTime) }]    : []),
    ...(locationName ? [{ label: 'Location', value: locationName }]             : []),
  ].map(r => `
    <tr>
      <td style="padding:4px 0;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;width:90px;">${esc(r.label)}</td>
      <td style="padding:4px 0;font-size:13px;color:#e2e8f0;">${esc(r.value)}</td>
    </tr>`).join('')

  return `<!DOCTYPE html><html lang="en">
<head><meta charset="UTF-8"><title>Volunteer Reminder</title></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

        <tr><td style="background:#1e293b;border-radius:16px 16px 0 0;padding:24px 32px;border-bottom:1px solid rgba(255,255,255,0.08);">
          <p style="margin:0;font-size:18px;font-weight:700;color:#fff;">${esc(programName)}</p>
          <p style="margin:4px 0 0;font-size:13px;color:#f59e0b;">⚠ Volunteer Slots Unfilled</p>
        </td></tr>

        <tr><td style="background:#1e293b;padding:24px 32px;">
          <p style="margin:0 0 16px;font-size:15px;color:#e2e8f0;">
            One or more volunteer slots for tomorrow's event still need to be filled.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;border-radius:10px;border:1px solid rgba(255,255,255,0.08);padding:12px 16px;margin-bottom:20px;">
            <tbody>${details}</tbody>
          </table>
          <p style="margin:0 0 12px;font-size:13px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;">Unfilled Slots</p>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tbody>${slotRows}</tbody>
          </table>
          ${signupPageUrl ? `<p style="margin:20px 0 0;font-size:12px;color:#94a3b8;line-height:1.6;">
            Share the volunteer signup page with parents:<br>
            <a href="${esc(signupPageUrl)}" style="color:#38bdf8;">${esc(signupPageUrl)}</a>
          </p>` : `<p style="margin:20px 0 0;font-size:12px;color:#475569;line-height:1.6;">
            You can assign volunteers manually from the event page.
          </p>`}
        </td></tr>

        <tr><td style="background:#1e293b;border-radius:0 0 16px 16px;padding:16px 32px;border-top:1px solid rgba(255,255,255,0.08);">
          <p style="margin:0;font-size:11px;color:#334155;">Sent via SidelineOps</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

function buildVolunteerReminderEmail({
  volunteerName,
  programName,
  roleName,
  eventLabel,
  eventDate,
  startTime,
  locationName,
}: {
  volunteerName: string
  programName:   string
  roleName:      string
  eventLabel:    string
  eventDate:     string
  startTime:     string | null
  locationName:  string | null
}): string {
  const rows = [
    { label: 'Role',     value: roleName },
    { label: 'Event',    value: eventLabel },
    { label: 'Date',     value: formatDateLong(eventDate) },
    ...(startTime    ? [{ label: 'Time',     value: formatTime(startTime) }]    : []),
    ...(locationName ? [{ label: 'Location', value: locationName }]             : []),
  ].map(r => `
    <tr>
      <td style="padding:6px 0;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;width:100px;">${esc(r.label)}</td>
      <td style="padding:6px 0;font-size:14px;color:#e2e8f0;">${esc(r.value)}</td>
    </tr>`).join('')

  return `<!DOCTYPE html><html lang="en">
<head><meta charset="UTF-8"><title>Volunteer Reminder</title></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

        <tr><td style="background:#1e293b;border-radius:16px 16px 0 0;padding:24px 32px;border-bottom:1px solid rgba(255,255,255,0.08);">
          <p style="margin:0;font-size:18px;font-weight:700;color:#fff;">${esc(programName)}</p>
          <p style="margin:4px 0 0;font-size:13px;color:#94a3b8;">Volunteer Reminder</p>
        </td></tr>

        <tr><td style="background:#1e293b;border-radius:0 0 16px 16px;padding:32px;">
          <p style="margin:0 0 16px;font-size:15px;color:#e2e8f0;">Hi ${esc(volunteerName)},</p>
          <p style="margin:0 0 24px;font-size:15px;color:#94a3b8;line-height:1.6;">
            Just a reminder that you're signed up to volunteer tomorrow. We're looking forward to seeing you!
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;border-radius:12px;border:1px solid rgba(255,255,255,0.08);margin-bottom:24px;">
            <tr><td style="padding:20px 24px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                ${rows}
              </table>
            </td></tr>
          </table>
          <p style="margin:0;font-size:13px;color:#475569;line-height:1.6;">
            If you need to cancel, please contact the coaching staff directly.
          </p>
        </td></tr>

        <tr><td style="padding:20px 0 0;text-align:center;">
          <p style="margin:0;font-size:11px;color:#334155;">Sent via SidelineOps</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // ── Auth ─────────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const resend   = new Resend(process.env.RESEND_API_KEY)
  const baseUrl  = getBaseUrl()
  const tomorrow = tomorrowCentral()

  const summary = {
    date:             tomorrow,
    eventsProcessed:  0,
    adminEmailsSent:  0,
    volunteerReminders: 0,
    unfilledFlagged:  0,
    errors:           [] as string[],
  }

  // ── 1. Fetch tomorrow's home events that have volunteer slots ─────────────────
  const { data: eventSlotRows, error: eventsError } = await supabase
    .from('event_volunteer_slots')
    .select(`
      id, slot_count, start_time, end_time, notes, reminded_at,
      volunteer_roles(name, suppress_reminders),
      volunteer_assignments(id, volunteer_name, volunteer_email, status),
      events!inner(
        id, event_type, title, opponent, is_home, event_date,
        default_start_time, location_name, program_id,
        programs(name),
        event_team_details(team_id)
      )
    `)
    .eq('events.event_date', tomorrow)
    .eq('events.is_home', true)
    .neq('events.status', 'cancelled')

  if (eventsError) {
    console.error('[volunteer-reminders] fetch error:', eventsError)
    return NextResponse.json(
      { error: 'Failed to fetch slots', detail: eventsError.message },
      { status: 500 },
    )
  }

  if (!eventSlotRows?.length) {
    return NextResponse.json({ ...summary, message: 'No volunteer slots for tomorrow.' })
  }

  // Batch-fetch team slugs for the signup page link in admin emails
  const allTeamIds = [...new Set((eventSlotRows).flatMap(row =>
    ((row.events as any).event_team_details ?? []).map((d: any) => d.team_id as string)
  ))]
  const { data: teamSlugRows } = await supabase
    .from('teams')
    .select('id, slug')
    .in('id', allTeamIds.length > 0 ? allTeamIds : ['00000000-0000-0000-0000-000000000000'])
    .not('slug', 'is', null)
  const teamSlugById: Record<string, string> = Object.fromEntries(
    (teamSlugRows ?? []).map(t => [t.id, t.slug as string])
  )

  // ── 2. Group slots by event ───────────────────────────────────────────────────
  const eventMap = new Map<string, {
    event: any
    slots: typeof eventSlotRows
  }>()

  for (const row of eventSlotRows) {
    const ev = row.events as any
    if (!eventMap.has(ev.id)) {
      eventMap.set(ev.id, { event: ev, slots: [] })
    }
    eventMap.get(ev.id)!.slots.push(row)
  }

  // ── 3. Process each event ─────────────────────────────────────────────────────
  for (const { event, slots } of eventMap.values()) {
    try {
      summary.eventsProcessed++

      const program       = event.programs as any
      const programName   = program?.name ?? ''
      const programId     = event.program_id as string
      const label         = eventLabel(event)
      const startTime     = slots[0]?.start_time ?? event.default_start_time ?? null
      const locationName  = event.location_name ?? null
      const teamIds       = ((event.event_team_details ?? []) as any[]).map((d: any) => d.team_id)
      const from          = `${programName} via SidelineOps <${process.env.NEXT_PUBLIC_FROM_EMAIL}>`
      const teamSlug      = teamIds.map(id => teamSlugById[id]).find(Boolean) ?? null
      const signupPageUrl = teamSlug ? `${baseUrl}/volunteer/${teamSlug}` : null

      // ── 3a. Find unfilled slots not yet reminded ──────────────────────────────
      const unfilledUnreminded: {
        slotId:   string
        roleName: string
        open:     number
        total:    number
      }[] = []

      for (const slot of slots) {
        const assignments  = (slot.volunteer_assignments as any[]) ?? []
        const activeCount  = assignments.filter(a => a.status !== 'cancelled').length
        const open         = slot.slot_count - activeCount
        if (open > 0 && !slot.reminded_at) {
          const roleBase = (slot.volunteer_roles as any)?.name ?? 'Volunteer'
          unfilledUnreminded.push({
            slotId:   slot.id,
            roleName: slotLabel(roleBase, slot.start_time, slot.end_time),
            open,
            total:    slot.slot_count,
          })
        }
      }

      summary.unfilledFlagged += unfilledUnreminded.length

      // ── 3b. Send admin email for unfilled slots ───────────────────────────────
      if (unfilledUnreminded.length > 0 && teamIds.length > 0) {
        // Get coach/admin emails for this event's teams
        const { data: teamUsersRaw } = await supabase
          .from('team_users')
          .select('user_id')
          .in('team_id', teamIds)
          .eq('can_manage_events', true)

        const adminUserIds = [...new Set((teamUsersRaw ?? []).map(r => r.user_id))]

        let adminEmails: string[] = []
        if (adminUserIds.length > 0) {
          const { data: usersRaw } = await supabase
            .from('users')
            .select('email')
            .in('id', adminUserIds)
            .not('email', 'is', null)
          adminEmails = (usersRaw ?? [])
            .map(u => u.email as string)
            .filter(Boolean)
        }

        if (adminEmails.length > 0) {
          const html = buildAdminReminderEmail({
            programName,
            eventLabel:    label,
            eventDate:     event.event_date,
            startTime,
            locationName,
            unfilled:      unfilledUnreminded,
            signupPageUrl,
          })

          const results = await Promise.all(
            adminEmails.map(email =>
              resend.emails.send({
                from,
                to:      email,
                subject: `Volunteer slots unfilled for tomorrow's game`,
                html,
              }).catch(err => {
                console.error(`[volunteer-reminders] admin email to ${email}:`, err)
                return { error: true }
              })
            )
          )

          const sent = results.filter(r => !('error' in r && r.error)).length
          summary.adminEmailsSent += sent

          // Log to notification_log
          const { error: logError } = await supabase.from('notification_log').insert({
            team_id:           teamIds[0],
            event_id:          event.id,
            sent_count:        sent,
            failed_count:      adminEmails.length - sent,
            notification_type: 'volunteer_reminder',
            recipient_group:   'program_admins',
            subject:           `Volunteer slots unfilled for tomorrow's game`,
            message:           `${unfilledUnreminded.length} unfilled slot(s) for ${label} on ${event.event_date}.`,
          })
          if (logError) console.error('[volunteer-reminders] log error:', logError)
        }

        // ── 3c. Mark slots as reminded ──────────────────────────────────────────
        const remindedIds = unfilledUnreminded.map(s => s.slotId)
        const { error: remindedError } = await supabase
          .from('event_volunteer_slots')
          .update({ reminded_at: new Date().toISOString() })
          .in('id', remindedIds)
        if (remindedError) console.error('[volunteer-reminders] reminded_at update error:', remindedError)
      }

      // ── 3d. Send reminder emails to confirmed volunteers ──────────────────────
      for (const slot of slots) {
        const assignments      = (slot.volunteer_assignments as any[]) ?? []
        const role             = slot.volunteer_roles as any
        const roleBase         = role?.name ?? 'Volunteer'
        const roleName         = slotLabel(roleBase, slot.start_time, slot.end_time)
        const slotStart        = slot.start_time ?? startTime
        const suppressReminder = role?.suppress_reminders === true

        // Skip volunteer reminder emails for roles with suppress_reminders = true
        if (suppressReminder) continue

        for (const assignment of assignments) {
          if (!assignment.volunteer_email || assignment.status === 'cancelled') continue

          try {
            const html = buildVolunteerReminderEmail({
              volunteerName: assignment.volunteer_name ?? 'Volunteer',
              programName,
              roleName,
              eventLabel:    label,
              eventDate:     event.event_date,
              startTime:     slotStart,
              locationName,
            })

            await resend.emails.send({
              from,
              to:      assignment.volunteer_email,
              subject: `Reminder: You're volunteering tomorrow!`,
              html,
            })

            summary.volunteerReminders++
          } catch (err) {
            console.error(`[volunteer-reminders] volunteer email error for assignment ${assignment.id}:`, err)
            summary.errors.push(`assignment ${assignment.id}: email failed`)
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[volunteer-reminders] event ${event.id}:`, msg)
      summary.errors.push(`event ${event.id}: ${msg}`)
    }
  }

  return NextResponse.json(summary)
}
