import { NextRequest, NextResponse }                 from 'next/server'
import { createClient }                              from '@supabase/supabase-js'
import { Resend }                                    from 'resend'
import { buildWeeklyDigestEmail, type DigestEvent }  from '@/lib/email/weeklyDigest'
import { generateUnsubscribeToken }                  from '@/lib/notifications/unsubscribe-token'
import { getBaseUrl }                                from '@/lib/utils/base-url'

// ── Supabase service client (bypasses RLS — safe here, server-only route) ──
function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// ── Date helpers ─────────────────────────────────────────────────────────────

/** Returns YYYY-MM-DD for a given Date in local time. */
function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/**
 * Computes the coming Mon–Sun window relative to `now`.
 * The cron fires Sunday evening, so "coming week" = the 7 days starting Monday.
 */
function comingWeekRange(now: Date): { monday: string; sunday: string; label: string } {
  const monday = new Date(now)
  const dayOfWeek = now.getUTCDay() // 0 = Sun, 1 = Mon, …
  const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek
  monday.setUTCDate(now.getUTCDate() + daysUntilMonday)
  monday.setUTCHours(0, 0, 0, 0)

  const sunday = new Date(monday)
  sunday.setUTCDate(monday.getUTCDate() + 6)

  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

  return {
    monday: toDateStr(monday),
    sunday: toDateStr(sunday),
    label:  `${fmt(monday)} – ${fmt(sunday)}`,
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // ── Auth: verify Vercel cron secret ────────────────────────────────────────
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase  = createServiceClient()
  const resend    = new Resend(process.env.RESEND_API_KEY)
  const appUrl    = getBaseUrl()
  const { monday, sunday, label: weekLabel } = comingWeekRange(new Date())

  const summary = {
    weekRange:      `${monday} to ${sunday}`,
    teamsProcessed: 0,
    emailsSent:     0,
    emailsFailed:   0,
    errors:         [] as string[],
  }

  // ── Fetch all teams with digest enabled ─────────────────────────────────────
  const { data: teams, error: teamsError } = await supabase
    .from('teams')
    .select('id, name, slug, program_id, notify_digest_enabled')
    .eq('notify_digest_enabled', true)

  if (teamsError) {
    console.error('[weekly-digest] Failed to fetch teams:', teamsError)
    return NextResponse.json({ error: 'Failed to fetch teams', detail: teamsError.message }, { status: 500 })
  }

  if (!teams?.length) {
    return NextResponse.json({ ...summary, message: 'No teams with digest enabled.' })
  }

  // ── Process each team independently ─────────────────────────────────────────
  for (const team of teams) {
    try {
      // ── Fetch program name ─────────────────────────────────────────────────
      const { data: program } = await supabase
        .from('programs')
        .select('name, sport')
        .eq('id', team.program_id)
        .single()

      // ── Fetch event IDs linked to this team (not cancelled) ────────────────
      const { data: teamDetails } = await supabase
        .from('event_team_details')
        .select('event_id, start_time')
        .eq('team_id', team.id)
        .neq('status', 'cancelled')

      const teamEventIds = (teamDetails ?? []).map(d => d.event_id)

      // ── Fetch events in coming week for those IDs ──────────────────────────
      const weekEvents: DigestEvent[] = []

      if (teamEventIds.length > 0) {
        const { data: events } = await supabase
          .from('events')
          .select('id, event_type, title, opponent, is_home, event_date, default_start_time, location_name, is_tournament')
          .in('id', teamEventIds)
          .gte('event_date', monday)
          .lte('event_date', sunday)
          .neq('status', 'cancelled')
          .order('event_date', { ascending: true })

        if (events?.length) {
          const detailMap = new Map(
            (teamDetails ?? []).map(d => [d.event_id, d.start_time])
          )
          for (const ev of events) {
            weekEvents.push({
              event_type:         ev.event_type,
              title:              ev.title,
              opponent:           ev.opponent,
              is_home:            ev.is_home,
              event_date:         ev.event_date,
              team_start_time:    detailMap.get(ev.id) ?? null,
              default_start_time: ev.default_start_time,
              location_name:      ev.location_name,
              is_tournament:      ev.is_tournament,
            })
          }
        }
      }

      // ── Fetch contacts with email addresses ────────────────────────────────
      // Include both legacy (contacts.team_id) and program-join (contact_teams) contacts
      const { data: ctRows } = await supabase
        .from('contact_teams')
        .select('contact_id')
        .eq('team_id', team.id)
      const ctContactIds = (ctRows ?? []).map((r: any) => r.contact_id)
      const contactsBuilder = supabase
        .from('contacts')
        .select('id, email')
        .is('deleted_at', null)
        .eq('email_unsubscribed', false)
        .not('email', 'is', null)
      const { data: contacts } = ctContactIds.length > 0
        ? await contactsBuilder.or(`team_id.eq.${team.id},id.in.(${ctContactIds.join(',')})`)
        : await contactsBuilder.eq('team_id', team.id)

      const withEmail = (contacts ?? []).filter(
        (c): c is typeof c & { email: string } => typeof c.email === 'string' && c.email.length > 0,
      )

      if (!withEmail.length) continue

      const senderLabel = program?.name ?? ''
      const fromName    = senderLabel ? `${senderLabel} via SidelineOps` : 'SidelineOps'
      const from        = `${fromName} <${process.env.NEXT_PUBLIC_FROM_EMAIL}>`
      const subject     = `Your Week Ahead — ${weekLabel}`

      const digestBase = {
        teamName:    team.name ?? '',
        programName: program?.name ?? '',
        teamSlug:    team.slug ?? null,
        weekLabel,
        events:      weekEvents,
        appUrl,
      }

      // ── Send in batches of 10 ─────────────────────────────────────────────
      let teamSent   = 0
      let teamFailed = 0
      const BATCH    = 10

      for (let i = 0; i < withEmail.length; i += BATCH) {
        const results = await Promise.all(
          withEmail.slice(i, i + BATCH).map(async c => {
            const token          = generateUnsubscribeToken(c.id)
            const unsubscribeUrl = `${appUrl}/api/unsubscribe?token=${token}`
            const html           = buildWeeklyDigestEmail({ ...digestBase, unsubscribeUrl })
            return resend.emails.send({ from, to: c.email, subject, html })
              .catch(() => ({ error: true }))
          })
        )
        results.forEach(r => ('error' in r && r.error) ? teamFailed++ : teamSent++)
      }

      // ── Log to notification_log ────────────────────────────────────────────
      await supabase.from('notification_log').insert({
        team_id:           team.id,
        event_id:          null,
        sent_count:        teamSent,
        failed_count:      teamFailed,
        notification_type: 'weekly_digest',
        recipient_group:   'all_contacts',
        subject,
        message:           `Weekly digest for ${weekLabel} — ${weekEvents.length} event(s) listed.`,
      })

      summary.teamsProcessed++
      summary.emailsSent   += teamSent
      summary.emailsFailed += teamFailed
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[weekly-digest] team ${team.id}:`, msg)
      summary.errors.push(`team ${team.id}: ${msg}`)
    }
  }

  return NextResponse.json(summary)
}
