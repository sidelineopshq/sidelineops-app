export type NotificationType =
  | 'General Update'
  | 'Game Reminder'
  | 'Cancellation'
  | 'Schedule Change'
  | 'Practice Reminder'
  | 'Meal Notice'

export interface EmailEvent {
  title:           string
  date:            string
  time:            string | null
  location:        string | null
  locationAddress: string | null | undefined
  teamName:        string
  programName:     string
  teamSlug:        string | null
}

type Accent = { main: string; bg: string; border: string }

function accent(type: NotificationType): Accent {
  if (type === 'Cancellation')    return { main: '#ef4444', bg: '#fef2f2', border: '#fecaca' }
  if (type === 'Schedule Change') return { main: '#f59e0b', bg: '#fffbeb', border: '#fde68a' }
  return                                 { main: '#0ea5e9', bg: '#f0f9ff', border: '#bae6fd' }
}

/** Escapes < and > to prevent XSS in the coach's message. */
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function buildEventNotificationEmail({
  type,
  event,
  customMessage,
  appUrl,
  unsubscribeUrl,
}: {
  type:            NotificationType
  event:           EmailEvent
  customMessage:   string
  appUrl:          string
  unsubscribeUrl?: string
}): string {
  const { main, bg, border } = accent(type)
  const scheduleUrl = event.teamSlug
    ? `${appUrl}/schedule/${event.teamSlug}`
    : appUrl

  const mapUrl = event.locationAddress
    ? `https://maps.apple.com/?q=${encodeURIComponent(event.locationAddress)}`
    : null

  type DetailRow = { icon: string; label: string; value: string; mapUrl?: string }
  const detailRows = [
    { icon: '📅', label: 'Date',     value: event.date },
    event.time     ? { icon: '🕐', label: 'Time',     value: event.time }                                     : null,
    event.location ? { icon: '📍', label: 'Location', value: event.location, mapUrl: mapUrl ?? undefined }    : null,
  ].filter(Boolean) as DetailRow[]

  const detailsHtml = detailRows.map((row, i) => `
    <tr>
      <td style="padding:12px 16px;${i < detailRows.length - 1 ? 'border-bottom:1px solid #f1f5f9;' : ''}">
        <table cellpadding="0" cellspacing="0"><tr>
          <td style="font-size:18px;line-height:1;padding-right:12px;vertical-align:middle;">${row.icon}</td>
          <td style="vertical-align:middle;">
            <p style="margin:0;font-size:11px;color:#94a3b8;text-transform:uppercase;font-weight:600;letter-spacing:0.05em;">${row.label}</p>
            <p style="margin:2px 0 0;font-size:14px;font-weight:600;color:#1e293b;">${esc(row.value)}</p>
            ${row.mapUrl ? `<a href="${row.mapUrl}" style="display:inline-block;margin-top:3px;font-size:12px;color:#0284c7;text-decoration:none;font-weight:600;">Get Directions →</a>` : ''}
          </td>
        </tr></table>
      </td>
    </tr>`).join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${esc(type)}: ${esc(event.title)}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
    <tr><td align="center">
    <table width="100%" style="max-width:560px;">

      <!-- Header -->
      <tr><td style="background:#0f172a;border-radius:12px 12px 0 0;padding:24px 32px;">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td>
            <p style="margin:0;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#475569;">SidelineOps</p>
            <p style="margin:4px 0 0;font-size:19px;font-weight:800;color:#f1f5f9;">${esc(event.teamName)}</p>
            <p style="margin:2px 0 0;font-size:13px;color:#64748b;">${esc(event.programName)}</p>
          </td>
          <td align="right" style="vertical-align:top;">
            <span style="display:inline-block;background:${main};color:#fff;font-size:11px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;padding:5px 14px;border-radius:999px;white-space:nowrap;">
              ${esc(type)}
            </span>
          </td>
        </tr></table>
      </td></tr>

      <!-- Event title -->
      <tr><td style="background:#fff;padding:28px 32px 20px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
        <h1 style="margin:0;font-size:26px;font-weight:800;color:#0f172a;line-height:1.2;">${esc(event.title)}</h1>

        <!-- Details grid -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;background:#f8fafc;">
          ${detailsHtml}
        </table>
      </td></tr>

      <!-- Coach message -->
      <tr><td style="background:#fff;padding:4px 32px 28px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
        <div style="background:${bg};border:1px solid ${border};border-left:4px solid ${main};border-radius:6px;padding:16px 20px;">
          <p style="margin:0;font-size:14px;color:#334155;line-height:1.75;white-space:pre-wrap;">${esc(customMessage)}</p>
        </div>
      </td></tr>

      <!-- CTA -->
      <tr><td style="background:#fff;padding:0 32px 32px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;text-align:center;">
        <a href="${scheduleUrl}"
           style="display:inline-block;background:${main};color:#fff;font-size:14px;font-weight:700;text-decoration:none;padding:12px 30px;border-radius:8px;letter-spacing:0.01em;">
          View Full Schedule →
        </a>
      </td></tr>

      <!-- Footer -->
      <tr><td style="background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;padding:20px 32px;text-align:center;">
        <p style="margin:0;font-size:12px;color:#94a3b8;">
          This message was sent by <strong style="color:#64748b;">${esc(event.programName)}</strong> via SidelineOps.
        </p>
        <p style="margin:6px 0 0;font-size:11px;color:#cbd5e1;">
          You received this because you are listed as a contact for this team.
          Contact your coach to update your notification preferences.
        </p>
      </td></tr>

      ${unsubscribeUrl ? `
      <!-- Unsubscribe -->
      <tr><td style="padding:16px 32px 8px;text-align:center;">
        <hr style="margin:0 0 14px;border:none;border-top:1px solid #e5e7eb;" />
        <p style="margin:0;font-size:12px;color:#9ca3af;">
          You're receiving this because you signed up for updates from <strong style="color:#9ca3af;">${esc(event.programName)}</strong>.<br/>
          <a href="${unsubscribeUrl}" style="color:#9ca3af;">Unsubscribe</a>
        </p>
      </td></tr>` : ''}

    </table>
    </td></tr>
  </table>
</body>
</html>`
}

export function defaultSubject(
  type:       NotificationType,
  eventTitle: string,
  eventDate:  string,
): string {
  switch (type) {
    case 'Game Reminder':    return `Game Reminder: ${eventTitle} — ${eventDate}`
    case 'Cancellation':     return `Cancelled: ${eventTitle} — ${eventDate}`
    case 'Schedule Change':  return `Schedule Update: ${eventTitle} — ${eventDate}`
    case 'Practice Reminder': return `Practice Reminder — ${eventDate}`
    case 'Meal Notice':      return `Meal Info: ${eventTitle} — ${eventDate}`
    default:                 return `Team Update — ${eventDate}`
  }
}
