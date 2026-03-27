import { createClient }             from '@supabase/supabase-js'
import { Resend }                    from 'resend'
import {
  detectEventChanges,
  type EventSnapshot,
  type TeamDetailSnapshot,
} from './change-detector'
import { buildEventNotificationEmail } from '@/lib/email/eventNotification'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  })
}

function formatTime(time: string | null): string | null {
  if (!time) return null
  const [h, m] = time.split(':')
  const hour   = parseInt(h, 10)
  return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`
}

/** Computes the human-readable event title shown in notifications. */
export function buildDisplayTitle(event: {
  event_type: string
  title:      string | null
  opponent:   string | null
  is_home:    boolean | null
}): string {
  if (event.event_type === 'tournament') return event.title ?? 'Tournament'
  if (event.opponent) return `${event.is_home ? 'vs' : '@'} ${event.opponent}`
  return event.title ?? 'Event'
}

export interface TeamNotificationInput {
  teamId:        string
  oldEvent:      EventSnapshot
  newEvent:      EventSnapshot
  oldTeamDetail: TeamDetailSnapshot
  newTeamDetail: TeamDetailSnapshot
}

/**
 * Non-blocking notification dispatcher — call with `void` after a successful save.
 *
 * For each team entry in `teamNotifications`:
 *  1. Runs change detection; skips if no urgent changes
 *  2. Checks `teams.notify_on_change`; skips if false
 *  3. Fetches all contacts with email (or sms_consent) for the team
 *  4. Sends a "Schedule Change" email via Resend
 *  5. Inserts a row into `notification_log`
 *
 * Errors per-team are caught individually so one failure does not
 * prevent notifications for the remaining teams.
 */
export async function fireChangeNotifications({
  eventId,
  eventDate,
  displayTitle,
  teamNotifications,
}: {
  eventId:           string
  eventDate:         string
  displayTitle:      string
  teamNotifications: TeamNotificationInput[]
}): Promise<void> {
  if (!teamNotifications.length) return

  const supabase = createServiceClient()
  const resend   = new Resend(process.env.RESEND_API_KEY)
  const appUrl   = process.env.NEXT_PUBLIC_APP_URL ?? 'https://sidelineopshq.com'

  for (const tn of teamNotifications) {
    try {
      const diff = detectEventChanges({
        eventDate,
        oldEvent:      tn.oldEvent,
        newEvent:      tn.newEvent,
        oldTeamDetail: tn.oldTeamDetail,
        newTeamDetail: tn.newTeamDetail,
      })

      if (!diff.hasChanges || !diff.isUrgent) continue

      // ── Check team notification preference ──────────────────────────────
      const { data: team } = await supabase
        .from('teams')
        .select('name, slug, notify_on_change, program_id')
        .eq('id', tn.teamId)
        .single()

      if (!team || team.notify_on_change === false) continue

      // ── Fetch contacts with any contact method ───────────────────────────
      // Includes anyone with an email address OR who has given SMS consent
      const { data: contacts } = await supabase
        .from('contacts')
        .select('id, email')
        .eq('team_id', tn.teamId)
        .is('deleted_at', null)
        .or('email.not.is.null,sms_consent.eq.true')

      const withEmail = (contacts ?? []).filter(
        (c): c is typeof c & { email: string } => typeof c.email === 'string' && c.email.length > 0,
      )
      if (!withEmail.length) continue

      // ── Fetch program name for email header ──────────────────────────────
      const { data: program } = await supabase
        .from('programs')
        .select('name')
        .eq('id', team.program_id)
        .single()

      // ── Build message body from diff rows ────────────────────────────────
      const changeLines   = diff.changes.map(c => `${c.label}: ${c.from} → ${c.to}`).join('\n')
      const customMessage = `The following updates have been made to this event:\n\n${changeLines}`
      const subject       = `Schedule Update: ${displayTitle} — ${formatDate(eventDate)}`

      const html = buildEventNotificationEmail({
        type:  'Schedule Change',
        event: {
          title:       displayTitle,
          date:        formatDate(eventDate),
          time:        formatTime(tn.newEvent.default_start_time),
          location:    tn.newEvent.location_name,
          teamName:    team.name ?? '',
          programName: program?.name ?? '',
          teamSlug:    team.slug ?? null,
        },
        customMessage,
        appUrl,
      })

      const fromName = team.name ? `${team.name} via SidelineOps` : 'SidelineOps'
      const from     = `${fromName} <${process.env.NEXT_PUBLIC_FROM_EMAIL}>`

      // ── Send in batches of 10 ────────────────────────────────────────────
      let sent    = 0
      let failed  = 0
      const BATCH = 10

      for (let i = 0; i < withEmail.length; i += BATCH) {
        const results = await Promise.all(
          withEmail.slice(i, i + BATCH).map(c =>
            resend.emails.send({ from, to: c.email, subject, html })
              .catch(() => ({ error: true }))
          )
        )
        results.forEach(r => ('error' in r && r.error) ? failed++ : sent++)
      }

      // ── Log to notification_log ──────────────────────────────────────────
      await supabase.from('notification_log').insert({
        team_id:           tn.teamId,
        event_id:          eventId,
        sent_count:        sent,
        failed_count:      failed,
        notification_type: 'event_change',
        recipient_group:   'all_contacts',
        subject,
        message:           customMessage,
      })
    } catch (err) {
      console.error(`[fireChangeNotifications] team ${tn.teamId}:`, err)
    }
  }
}
