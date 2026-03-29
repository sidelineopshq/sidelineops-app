function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function buildVolunteerConfirmationEmail({
  volunteerName,
  roleName,
  eventLabel,
  eventDate,
  programName,
}: {
  volunteerName: string
  roleName:      string
  eventLabel:    string
  eventDate:     string
  programName:   string
}): string {
  const dateObj      = new Date(eventDate + 'T00:00:00')
  const formattedDate = dateObj.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Volunteer Confirmation</title></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

        <!-- Header -->
        <tr><td style="background:#1e293b;border-radius:16px 16px 0 0;padding:24px 32px;border-bottom:1px solid rgba(255,255,255,0.08);">
          <p style="margin:0;font-size:18px;font-weight:700;color:#fff;">${esc(programName)}</p>
          <p style="margin:4px 0 0;font-size:13px;color:#94a3b8;">Volunteer Confirmation</p>
        </td></tr>

        <!-- Body -->
        <tr><td style="background:#1e293b;border-radius:0 0 16px 16px;padding:32px;">
          <p style="margin:0 0 16px;font-size:15px;color:#e2e8f0;">
            Hi ${esc(volunteerName)},
          </p>
          <p style="margin:0 0 24px;font-size:15px;color:#94a3b8;line-height:1.6;">
            You've been signed up as a volunteer. Here are your details:
          </p>

          <!-- Detail card -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;border-radius:12px;border:1px solid rgba(255,255,255,0.08);margin-bottom:24px;">
            <tr><td style="padding:20px 24px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:6px 0;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;width:100px;">Role</td>
                  <td style="padding:6px 0;font-size:14px;color:#e2e8f0;">${esc(roleName)}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;">Event</td>
                  <td style="padding:6px 0;font-size:14px;color:#e2e8f0;">${esc(eventLabel)}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;">Date</td>
                  <td style="padding:6px 0;font-size:14px;color:#e2e8f0;">${esc(formattedDate)}</td>
                </tr>
              </table>
            </td></tr>
          </table>

          <p style="margin:0;font-size:13px;color:#475569;line-height:1.6;">
            If you have questions, contact your team's coaching staff directly.
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:20px 0 0;text-align:center;">
          <p style="margin:0;font-size:11px;color:#334155;">Sent via SidelineOps</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}
