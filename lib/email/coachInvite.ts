function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function joinTeamNames(names: string[]): string {
  if (names.length === 0) return 'your team'
  if (names.length === 1) return names[0]
  return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1]
}

export function buildCoachInviteEmail({
  inviterName,
  teamNames,
  programName,
  sport,
  role,
  acceptUrl,
}: {
  inviterName:  string
  teamNames:    string[]
  programName:  string
  sport:        string
  role:         'admin' | 'coach' | 'volunteer_admin' | 'meal_coordinator'
  acceptUrl:    string
}): string {
  const teamList  = joinTeamNames(teamNames)
  const roleLabel = role === 'admin' ? 'Admin' : role === 'volunteer_admin' ? 'Volunteer Admin' : role === 'meal_coordinator' ? 'Meal Coordinator' : 'Coach'

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>You've been invited to join ${esc(programName)} on SidelineOps</title>
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
            <p style="margin:4px 0 0;font-size:19px;font-weight:800;color:#f1f5f9;">${esc(programName)}</p>
            <p style="margin:2px 0 0;font-size:13px;color:#64748b;">${esc(sport)}</p>
          </td>
          <td align="right" style="vertical-align:top;">
            <span style="display:inline-block;background:#0ea5e9;color:#fff;font-size:11px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;padding:5px 14px;border-radius:999px;white-space:nowrap;">
              Invitation
            </span>
          </td>
        </tr></table>
      </td></tr>

      <!-- Body -->
      <tr><td style="background:#fff;padding:28px 32px 24px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
        <h1 style="margin:0 0 10px;font-size:22px;font-weight:800;color:#0f172a;line-height:1.2;">You&rsquo;re invited to join SidelineOps</h1>
        <p style="margin:0;font-size:15px;color:#334155;line-height:1.6;">
          <strong>${esc(inviterName)}</strong> has invited you to manage
          <strong>${esc(teamList)}</strong> as a <strong>${esc(roleLabel)}</strong>.
        </p>

        <!-- Details grid -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;background:#f8fafc;">
          <tr>
            <td style="padding:12px 16px;border-bottom:1px solid #f1f5f9;">
              <table cellpadding="0" cellspacing="0"><tr>
                <td style="font-size:18px;line-height:1;padding-right:12px;vertical-align:middle;">👤</td>
                <td style="vertical-align:middle;">
                  <p style="margin:0;font-size:11px;color:#94a3b8;text-transform:uppercase;font-weight:600;letter-spacing:0.05em;">Role</p>
                  <p style="margin:2px 0 0;font-size:14px;font-weight:600;color:#1e293b;">${esc(roleLabel)}</p>
                </td>
              </tr></table>
            </td>
          </tr>
          <tr>
            <td style="padding:12px 16px;">
              <table cellpadding="0" cellspacing="0"><tr>
                <td style="font-size:18px;line-height:1;padding-right:12px;vertical-align:middle;">🏆</td>
                <td style="vertical-align:middle;">
                  <p style="margin:0;font-size:11px;color:#94a3b8;text-transform:uppercase;font-weight:600;letter-spacing:0.05em;">Team${teamNames.length > 1 ? 's' : ''}</p>
                  <p style="margin:2px 0 0;font-size:14px;font-weight:600;color:#1e293b;">${esc(teamList)}</p>
                </td>
              </tr></table>
            </td>
          </tr>
        </table>
      </td></tr>

      <!-- CTA -->
      <tr><td style="background:#fff;padding:4px 32px 32px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;text-align:center;">
        <a href="${acceptUrl}"
           style="display:inline-block;background:#0ea5e9;color:#fff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 36px;border-radius:8px;letter-spacing:0.01em;">
          Accept Invitation &rarr;
        </a>
        <p style="margin:16px 0 0;font-size:12px;color:#94a3b8;">This invitation expires in 7 days.</p>
      </td></tr>

      <!-- Footer -->
      <tr><td style="background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;padding:20px 32px;text-align:center;">
        <p style="margin:0;font-size:12px;color:#94a3b8;">
          This invitation was sent by <strong style="color:#64748b;">${esc(programName)}</strong> via SidelineOps.
        </p>
        <p style="margin:6px 0 0;font-size:11px;color:#cbd5e1;">
          If you did not expect this invitation, you can safely ignore this email.
        </p>
      </td></tr>

    </table>
    </td></tr>
  </table>
</body>
</html>`
}
