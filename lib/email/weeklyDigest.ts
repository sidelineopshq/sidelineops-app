/** Escapes HTML special characters to prevent XSS. */
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export interface DigestEvent {
  event_type:        string
  title:             string | null
  is_tournament:     boolean
  opponent:          string | null
  is_home:           boolean | null
  event_date:        string   // YYYY-MM-DD
  team_start_time:   string | null  // from event_team_details
  default_start_time: string | null // fallback
  location_name:     string | null
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'short', day: 'numeric',
  })
}

function formatTime(time: string | null): string {
  if (!time) return ''
  const [h, m] = time.split(':')
  const hour   = parseInt(h, 10)
  const mins   = parseInt(m, 10)
  const period = hour >= 12 ? 'PM' : 'AM'
  const h12    = hour % 12 || 12
  return mins === 0 ? `${h12} ${period}` : `${h12}:${String(mins).padStart(2, '0')} ${period}`
}

function eventLabel(event: DigestEvent): string {
  if (event.event_type === 'practice') return 'Practice'
  if (event.event_type === 'meeting')  return 'Team Meeting'
  if (event.event_type === 'tournament' || event.is_tournament) return event.title ?? 'Tournament'
  if (event.opponent) return `${event.is_home ? 'vs' : '@'} ${event.opponent}`
  return event.title ?? 'Event'
}

function eventTypeTag(event: DigestEvent): { label: string; color: string } {
  if (event.event_type === 'game')       return { label: 'GAME',       color: '#0ea5e9' }
  if (event.event_type === 'practice')   return { label: 'PRACTICE',   color: '#8b5cf6' }
  if (event.event_type === 'tournament') return { label: 'TOURNAMENT', color: '#f59e0b' }
  if (event.event_type === 'meeting')    return { label: 'MEETING',    color: '#64748b' }
  return                                        { label: 'EVENT',       color: '#64748b' }
}

/**
 * Builds a weekly schedule digest email in the same visual style as the
 * event notification emails (dark header, white card body).
 */
export function buildWeeklyDigestEmail({
  teamName,
  programName,
  teamSlug,
  weekLabel,
  events,
  appUrl,
}: {
  teamName:    string
  programName: string
  teamSlug:    string | null
  weekLabel:   string   // e.g. "Apr 7 – Apr 13"
  events:      DigestEvent[]
  appUrl:      string
}): string {
  const scheduleUrl = teamSlug ? `${appUrl}/schedule/${teamSlug}` : appUrl

  const eventRows = events.length === 0
    ? `<tr><td style="padding:20px 24px;text-align:center;color:#64748b;font-size:13px;">
         No events scheduled for this week.
       </td></tr>`
    : events.map((ev, i) => {
        const time      = formatTime(ev.team_start_time ?? ev.default_start_time)
        const label     = eventLabel(ev)
        const tag       = eventTypeTag(ev)
        const border    = i < events.length - 1 ? 'border-bottom:1px solid #f1f5f9;' : ''

        return `
        <tr>
          <td style="padding:14px 24px;${border}">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="vertical-align:top;padding-right:12px;">
                  <p style="margin:0;font-size:11px;color:#94a3b8;font-weight:600;
                             letter-spacing:0.04em;text-transform:uppercase;">
                    ${esc(formatDate(ev.event_date))}
                  </p>
                  <p style="margin:4px 0 0;font-size:15px;font-weight:700;color:#0f172a;line-height:1.3;">
                    ${esc(label)}
                  </p>
                  ${time ? `<p style="margin:3px 0 0;font-size:13px;color:#475569;">${esc(time)}</p>` : ''}
                  ${ev.location_name
                    ? `<p style="margin:3px 0 0;font-size:12px;color:#94a3b8;">${esc(ev.location_name)}</p>`
                    : ''}
                </td>
                <td style="vertical-align:top;text-align:right;white-space:nowrap;">
                  <span style="display:inline-block;background:${tag.color}1a;color:${tag.color};
                               font-size:10px;font-weight:700;letter-spacing:0.08em;
                               text-transform:uppercase;padding:3px 8px;border-radius:999px;
                               border:1px solid ${tag.color}33;">
                    ${tag.label}
                  </span>
                </td>
              </tr>
            </table>
          </td>
        </tr>`
      }).join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Weekly Schedule: ${esc(teamName)}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
    <tr><td align="center">
    <table width="100%" style="max-width:560px;">

      <!-- Header -->
      <tr><td style="background:#0f172a;border-radius:12px 12px 0 0;padding:24px 32px;">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td>
            <p style="margin:0;font-size:10px;font-weight:700;letter-spacing:0.12em;
                       text-transform:uppercase;color:#475569;">SidelineOps</p>
            <p style="margin:4px 0 0;font-size:19px;font-weight:800;color:#f1f5f9;">
              ${esc(teamName)}
            </p>
            <p style="margin:2px 0 0;font-size:13px;color:#64748b;">${esc(programName)}</p>
          </td>
          <td align="right" style="vertical-align:top;">
            <span style="display:inline-block;background:#8b5cf6;color:#fff;font-size:11px;
                         font-weight:700;letter-spacing:0.07em;text-transform:uppercase;
                         padding:5px 14px;border-radius:999px;white-space:nowrap;">
              Weekly Digest
            </span>
          </td>
        </tr></table>
      </td></tr>

      <!-- Week label -->
      <tr><td style="background:#fff;padding:20px 32px 0;border-left:1px solid #e2e8f0;
                     border-right:1px solid #e2e8f0;">
        <p style="margin:0;font-size:18px;font-weight:800;color:#0f172a;">
          Schedule for ${esc(weekLabel)}
        </p>
        <p style="margin:4px 0 0;font-size:13px;color:#64748b;">
          Here's what's coming up for your team this week.
        </p>
      </td></tr>

      <!-- Events list -->
      <tr><td style="background:#fff;padding:12px 8px 8px;border-left:1px solid #e2e8f0;
                     border-right:1px solid #e2e8f0;">
        <table width="100%" cellpadding="0" cellspacing="0"
               style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;background:#f8fafc;">
          ${eventRows}
        </table>
      </td></tr>

      <!-- CTA -->
      <tr><td style="background:#fff;padding:20px 32px 32px;border-left:1px solid #e2e8f0;
                     border-right:1px solid #e2e8f0;text-align:center;">
        <a href="${scheduleUrl}"
           style="display:inline-block;background:#0ea5e9;color:#fff;font-size:14px;
                  font-weight:700;text-decoration:none;padding:12px 30px;
                  border-radius:8px;letter-spacing:0.01em;">
          View Full Schedule →
        </a>
      </td></tr>

      <!-- Footer -->
      <tr><td style="background:#f8fafc;border:1px solid #e2e8f0;border-top:none;
                     border-radius:0 0 12px 12px;padding:20px 32px;text-align:center;">
        <p style="margin:0;font-size:12px;color:#94a3b8;">
          This weekly digest was sent by
          <strong style="color:#64748b;">${esc(teamName)}</strong> via SidelineOps.
        </p>
        <p style="margin:6px 0 0;font-size:11px;color:#cbd5e1;">
          You received this because you are listed as a contact for this team.
          Contact your coach to update your notification preferences.
        </p>
      </td></tr>

    </table>
    </td></tr>
  </table>
</body>
</html>`
}
