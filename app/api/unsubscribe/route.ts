import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyUnsubscribeToken } from '@/lib/notifications/unsubscribe-token'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

function htmlResponse(title: string, body: string, status = 200): Response {
  return new Response(
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${title}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      min-height: 100svh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #0f172a;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, sans-serif;
      padding: 24px;
      color: #f1f5f9;
    }
    .card {
      width: 100%;
      max-width: 440px;
      background: #1e293b;
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 16px;
      padding: 40px 36px;
      text-align: center;
    }
    .icon {
      width: 52px;
      height: 52px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 20px;
      font-size: 22px;
    }
    h1 { font-size: 20px; font-weight: 700; color: #f1f5f9; }
    p  { margin-top: 10px; font-size: 14px; color: #94a3b8; line-height: 1.6; }
    .brand {
      margin-top: 32px;
      padding-top: 20px;
      border-top: 1px solid rgba(255,255,255,0.07);
      font-size: 11px;
      color: #475569;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
  </style>
</head>
<body>
  <div class="card">${body}
    <p class="brand">SidelineOps</p>
  </div>
</body>
</html>`,
    {
      status,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    },
  )
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')

  // ── 1. Token present and parseable ──────────────────────────────────────────
  if (!token) {
    return htmlResponse(
      'Invalid link',
      `<div class="icon" style="background:#ef444420;">⚠️</div>
       <h1>Invalid link</h1>
       <p>This unsubscribe link is missing required information.</p>`,
      400,
    )
  }

  const contactId = verifyUnsubscribeToken(token)

  // ── 2. HMAC signature valid ──────────────────────────────────────────────────
  if (!contactId) {
    return htmlResponse(
      'Invalid link',
      `<div class="icon" style="background:#ef444420;">⚠️</div>
       <h1>Invalid link</h1>
       <p>This unsubscribe link is invalid or has been tampered with.</p>`,
      400,
    )
  }

  const supabase = createServiceClient()

  // ── 3 & 4. Look up the contact ───────────────────────────────────────────────
  const { data: contact } = await supabase
    .from('contacts')
    .select('id, first_name, team_id, email_unsubscribed, teams(name, programs(name, sport))')
    .eq('id', contactId)
    .is('deleted_at', null)
    .single()

  if (!contact) {
    return htmlResponse(
      'Not found',
      `<div class="icon" style="background:#64748b20;">🔍</div>
       <h1>Contact not found</h1>
       <p>We couldn't locate your subscription record.</p>`,
      404,
    )
  }

  // ── 5. Mark unsubscribed (idempotent — safe to call twice) ──────────────────
  if (!contact.email_unsubscribed) {
    await supabase
      .from('contacts')
      .update({
        email_unsubscribed:    true,
        email_unsubscribed_at: new Date().toISOString(),
      })
      .eq('id', contactId)
  }

  // ── 6. Confirmation page ─────────────────────────────────────────────────────
  type ProgramRow = { name: string; sport: string }
  type TeamRow    = { name: string; programs: ProgramRow[] }

  const teamRow   = (Array.isArray(contact.teams) ? contact.teams[0] : contact.teams) as TeamRow | null | undefined
  const programRow = Array.isArray(teamRow?.programs) ? teamRow?.programs[0] : undefined
  const senderLabel = programRow?.name || null

  return htmlResponse(
    "You've been unsubscribed",
    `<div class="icon" style="background:#22c55e20;">✓</div>
     <h1>You've been unsubscribed</h1>
     <p>You will no longer receive emails${senderLabel ? ` from <strong style="color:#e2e8f0;">${senderLabel}</strong>` : ''}.</p>`,
  )
}
