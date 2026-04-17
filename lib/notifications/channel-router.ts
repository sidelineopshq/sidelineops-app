/**
 * Central notification dispatcher for outbound notifications.
 *
 * Exports:
 *  - sendChangeAlert   — change alerts for existing events
 *  - sendNewEventAlert — alerts when a new near-term event is added
 *
 * Channels dispatched (in order) for each function:
 *  1. Email  — via Resend, per-contact unsubscribe links
 *  2. GroupMe — via GroupMe Bots API (plain text)
 *  3. SMS/Twilio — reserved for a future block
 *
 * All sends are non-blocking. Errors per channel are caught and logged
 * so one failure never prevents the next channel from firing.
 */

import { createClient }             from '@supabase/supabase-js'
import { Resend }                    from 'resend'
import { buildEventNotificationEmail } from '@/lib/email/eventNotification'
import { generateUnsubscribeToken }   from './unsubscribe-token'
import { sendGroupMeMessage }         from './groupme'
import { getBaseUrl }                 from '@/lib/utils/base-url'

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

/** Returns 'Today' | 'Tomorrow' | null for a YYYY-MM-DD date in Central time. */
function dayLabel(eventDate: string): 'Today' | 'Tomorrow' | null {
  const now             = new Date()
  const centralToday    = now.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
  const centralTomorrow = new Date(now.getTime() + 86400000)
    .toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })

  if (eventDate === centralToday)    return 'Today'
  if (eventDate === centralTomorrow) return 'Tomorrow'
  return null
}

export interface ChangeRecord {
  field: string
  label: string
  from:  string
  to:    string
}

export interface AlertContact {
  id:                string
  email:             string | null
  first_name:        string | null
  email_unsubscribed: boolean | null
}

export interface AlertTeam {
  id:                string
  name:              string
  slug:              string | null
  notify_on_change:  boolean | null
  groupme_enabled:   boolean | null
  groupme_bot_id:    string | null
  schedule_published?: boolean | null
}

export interface AlertEvent {
  title:               string   // display title already formatted
  event_date:          string   // YYYY-MM-DD
  default_start_time:  string | null
  location_name:       string | null
  location_address?:   string | null
  event_type?:         string
}

function cancellationLabel(eventType: string | undefined): string {
  switch ((eventType ?? '').toLowerCase()) {
    case 'practice':   return 'Practice Cancelled'
    case 'tournament': return 'Tournament Cancelled'
    case 'meeting':    return 'Meeting Cancelled'
    default:           return 'Game Cancelled'
  }
}

/**
 * Sends change-alert notifications across all enabled channels for a single team.
 * Call with `void` — never awaited from a server action that also calls redirect().
 */
export async function sendChangeAlert({
  team,
  programId,
  programName,
  event,
  changes,
  contacts,
  skipGroupMe,
}: {
  team:         AlertTeam
  programId:    string
  programName:  string
  event:        AlertEvent
  changes:      ChangeRecord[]
  contacts:     AlertContact[]
  skipGroupMe?: boolean
}): Promise<void> {
  // ── 1. Guard: notification preference ────────────────────────────────────────
  if (!team.notify_on_change) return
  if (!changes.length)        return

  const appUrl      = getBaseUrl()
  const supabase    = createServiceClient()
  const formattedDate = formatDate(event.event_date)

  const isCancellation = changes.some(
    c => (c.field === 'status' || c.field === 'team_status') && c.to === 'Cancelled'
  )

  // Block non-cancellation alerts when schedule is private
  if (!isCancellation && team.schedule_published === false) return

  const cancelLabel = cancellationLabel(event.event_type)

  const subject = isCancellation
    ? `${cancelLabel}: ${event.title} — ${formattedDate}`
    : `Schedule Update: ${event.title} — ${formattedDate}`

  const changeLines   = changes.map(c => `${c.label}: ${c.from} → ${c.to}`).join('\n')
  const customMessage = isCancellation
    ? cancelLabel
    : `The following updates have been made to this event:\n\n${changeLines}`

  // ── 2. Email channel ──────────────────────────────────────────────────────────
  try {
    const withEmail = contacts.filter(
      (c): c is AlertContact & { email: string } =>
        typeof c.email === 'string' &&
        c.email.length > 0 &&
        !c.email_unsubscribed,
    )

    if (withEmail.length > 0) {
      const resend      = new Resend(process.env.RESEND_API_KEY)
      const senderLabel = programName || 'SidelineOps'
      const from        = `${senderLabel} via SidelineOps <${process.env.NEXT_PUBLIC_FROM_EMAIL}>`

      const emailBase = {
        type:  (isCancellation ? 'Cancellation' : 'Schedule Change') as 'Cancellation' | 'Schedule Change',
        event: {
          title:       event.title,
          date:        formattedDate,
          time:        formatTime(event.default_start_time),
          location:        event.location_name,
          locationAddress: event.location_address ?? null,
          teamName:        team.name,
          programName,
          teamSlug:        team.slug,
        },
        customMessage,
        appUrl,
      }

      let sent   = 0
      let failed = 0
      const BATCH = 10

      for (let i = 0; i < withEmail.length; i += BATCH) {
        const results = await Promise.all(
          withEmail.slice(i, i + BATCH).map(async c => {
            const token          = generateUnsubscribeToken(c.id)
            const unsubscribeUrl = `${appUrl}/api/unsubscribe?token=${token}`
            const html           = buildEventNotificationEmail({ ...emailBase, unsubscribeUrl })
            return resend.emails.send({ from, to: c.email, subject, html })
              .catch(() => ({ error: true }))
          })
        )
        results.forEach(r => ('error' in r && r.error) ? failed++ : sent++)
      }

      await supabase.from('notification_log').insert({
        team_id:           team.id,
        sent_count:        sent,
        failed_count:      failed,
        notification_type: 'event_change',
        recipient_group:   'all_contacts',
        channel:           'email',
        subject,
        message:           customMessage,
      })
    }
  } catch (err) {
    console.error(`[channel-router] email channel for team ${team.id}:`, err)
  }

  // ── 3. GroupMe channel ────────────────────────────────────────────────────────
  if (team.groupme_enabled && team.groupme_bot_id && !skipGroupMe) {
    try {
      const scheduleUrl = team.slug ? `${appUrl}/schedule/${team.slug}` : appUrl

      const text = isCancellation
        ? [
            `❌ ${cancelLabel}: ${event.title} — ${formattedDate}`,
            '',
            `View schedule: ${scheduleUrl}`,
          ].join('\n')
        : [
            `📅 Schedule Update: ${event.title} — ${formattedDate}`,
            '',
            changes.map(c => `• ${c.label}: ${c.from} → ${c.to}`).join('\n'),
            '',
            `View schedule: ${scheduleUrl}`,
          ].join('\n')

      const ok = await sendGroupMeMessage(team.groupme_bot_id, text)

      await supabase.from('notification_log').insert({
        team_id:           team.id,
        sent_count:        ok ? 1 : 0,
        failed_count:      ok ? 0 : 1,
        notification_type: 'event_change',
        recipient_group:   'all_contacts',
        channel:           'groupme',
        subject,
        message:           customMessage,
      })
    } catch (err) {
      console.error(`[channel-router] groupme channel for team ${team.id}:`, err)
    }
  }

  // ── 4. External Subscribers ───────────────────────────────────────────────────
  try {
    const { data: extSubs } = await supabase
      .from('external_subscribers')
      .select('id, name, email, token')
      .eq('program_id', programId)
      .or(`team_id.eq.${team.id},team_id.is.null`)
      .not('opted_in_at', 'is', null)
      .is('unsubscribed_at', null)
      .eq('is_active', true)

    if (extSubs && extSubs.length > 0) {
      const resend      = new Resend(process.env.RESEND_API_KEY)
      const senderLabel = programName || 'SidelineOps'
      const from        = `${senderLabel} via SidelineOps <${process.env.NEXT_PUBLIC_FROM_EMAIL}>`

      const emailBase = {
        type:  (isCancellation ? 'Cancellation' : 'Schedule Change') as 'Cancellation' | 'Schedule Change',
        event: {
          title:       event.title,
          date:        formattedDate,
          time:        formatTime(event.default_start_time),
          location:        event.location_name,
          locationAddress: event.location_address ?? null,
          teamName:        team.name,
          programName,
          teamSlug:        team.slug,
        },
        customMessage,
        appUrl,
      }

      let sent   = 0
      let failed = 0
      const BATCH = 10

      for (let i = 0; i < extSubs.length; i += BATCH) {
        const results = await Promise.all(
          extSubs.slice(i, i + BATCH).map(async (sub: { id: string; name: string; email: string; token: string }) => {
            const unsubscribeUrl = `${appUrl}/external-subscribe/unsubscribe?token=${sub.token}`
            const html           = buildEventNotificationEmail({ ...emailBase, unsubscribeUrl })
            return resend.emails.send({ from, to: sub.email, subject, html })
              .catch(() => ({ error: true }))
          })
        )
        results.forEach(r => ('error' in r && r.error) ? failed++ : sent++)
      }

      if (sent > 0 || failed > 0) {
        await supabase.from('notification_log').insert({
          team_id:           team.id,
          sent_count:        sent,
          failed_count:      failed,
          notification_type: 'external_change_alert',
          recipient_group:   'external_subscribers',
          channel:           'email',
          subject,
          message:           customMessage,
        })
      }
    }
  } catch (err) {
    console.error(`[channel-router] external subscribers channel for team ${team.id}:`, err)
  }

  // ── 5. SMS/Twilio ─────────────────────────────────────────────────────────────
  // Reserved for a future block.
}

// =============================================================================
// sendMealCoordinatorNotification
// =============================================================================

export interface MealCoordinatorEvent {
  title:         string
  event_date:    string
  start_time:    string | null
  meal_time:     string | null
  meal_notes:    string | null
  meal_required: boolean
}

/**
 * Sends a targeted email to all meal coordinators (can_manage_meals = true) for the
 * given program. Call with `void` on event create; `await` on event update.
 */
export async function sendMealCoordinatorNotification({
  programId,
  programName,
  event,
  changes,
  triggerType,
}: {
  programId:   string
  programName: string
  event:       MealCoordinatorEvent
  changes:     ChangeRecord[]
  triggerType: 'new_event_with_meal' | 'meal_change' | 'event_cancelled' | 'event_time_change'
}): Promise<void> {
  const supabase      = createServiceClient()
  const appUrl        = getBaseUrl()
  const formattedDate = formatDate(event.event_date)

  // 1. Find all teams in this program
  const { data: programTeams } = await supabase
    .from('teams')
    .select('id')
    .eq('program_id', programId)

  const teamIds = (programTeams ?? []).map(t => t.id)
  if (!teamIds.length) return

  // 2. Find users with can_manage_meals on any of those teams (deduplicated)
  const { data: mealCoordRows } = await supabase
    .from('team_users')
    .select('user_id')
    .in('team_id', teamIds)
    .eq('can_manage_meals', true)

  const uniqueUserIds = [...new Set((mealCoordRows ?? []).map(r => r.user_id))]
  if (!uniqueUserIds.length) return

  // 3. Fetch emails
  const { data: userRows } = await supabase
    .from('users')
    .select('id, email')
    .in('id', uniqueUserIds)

  const recipients = (userRows ?? []).filter(
    (u): u is typeof u & { email: string } => typeof u.email === 'string' && u.email.length > 0,
  )
  if (!recipients.length) return

  // 4. Build email content
  const subjectMap: Record<string, string> = {
    new_event_with_meal: `Meal Coordination Needed: ${event.title} — ${formattedDate}`,
    meal_change:         `Meal Update: ${event.title} — ${formattedDate}`,
    event_cancelled:     `Event Cancelled: ${event.title} — ${formattedDate}`,
    event_time_change:   `Start Time Changed: ${event.title} — ${formattedDate}`,
  }
  const subject = subjectMap[triggerType]

  const introMap: Record<string, string> = {
    new_event_with_meal: 'A new event has been scheduled that requires meal coordination.',
    meal_change:         'Meal details have been updated for this event.',
    event_cancelled:     'This event has been cancelled.',
    event_time_change:   'The event start time has been updated. Please review the meal schedule.',
  }

  const bodyParts: string[] = [introMap[triggerType]]

  if (changes.length > 0) {
    bodyParts.push('')
    changes.forEach(c => bodyParts.push(`${c.label}: ${c.from} → ${c.to}`))
  }

  if (event.meal_time) {
    bodyParts.push(`\nMeal Time: ${formatTime(event.meal_time) ?? event.meal_time}`)
  }
  if (event.meal_notes) {
    bodyParts.push(`Meal Notes: ${event.meal_notes}`)
  }

  const customMessage = bodyParts.join('\n')

  const emailType =
    triggerType === 'event_cancelled'   ? ('Cancellation'   as const) :
    triggerType === 'event_time_change' ? ('Schedule Change' as const) :
                                          ('Meal Notice'     as const)

  // 5. Send emails
  try {
    const resend = new Resend(process.env.RESEND_API_KEY)
    const from   = `${programName || 'SidelineOps'} via SidelineOps <${process.env.NEXT_PUBLIC_FROM_EMAIL}>`
    const BATCH  = 10

    let sent   = 0
    let failed = 0

    for (let i = 0; i < recipients.length; i += BATCH) {
      const results = await Promise.all(
        recipients.slice(i, i + BATCH).map(u => {
          const html = buildEventNotificationEmail({
            type:  emailType,
            event: {
              title:           event.title,
              date:            formattedDate,
              time:            formatTime(event.start_time),
              location:        null,
              locationAddress: null,
              teamName:        programName,
              programName,
              teamSlug:        null,
            },
            customMessage,
            appUrl,
          })
          return resend.emails.send({ from, to: u.email, subject, html })
            .catch(() => ({ error: true }))
        })
      )
      results.forEach(r => ('error' in r && r.error) ? failed++ : sent++)
    }

    console.log(`[channel-router] meal coordinator notification (${triggerType}): ${sent} sent, ${failed} failed`)
  } catch (err) {
    console.error('[channel-router] sendMealCoordinatorNotification:', err)
  }
}

// =============================================================================
// sendNewEventAlert
// =============================================================================

export interface NewEventTeam {
  id:                string
  name:              string
  level:             string | null
  slug:              string | null
  notify_on_change:  boolean | null
  groupme_enabled:   boolean | null
  groupme_bot_id:    string | null
  schedule_published?: boolean | null
}

export interface NewEventInput {
  title:            string | null
  event_type:       string
  event_date:       string   // YYYY-MM-DD
  opponent:         string | null
  is_home:          boolean | null
  location_name:    string | null
  location_address: string | null | undefined
  is_tournament:    boolean
  parent_event_id:  string | null
}

export interface AssignedTeam {
  name:       string
  level:      string | null
  start_time: string | null
}

export interface NewEventContact {
  id:                 string
  email:              string | null
  first_name:         string | null
  email_unsubscribed: boolean | null
}

function buildNewEventLabel(event: NewEventInput): string {
  if (event.is_tournament || event.event_type === 'tournament') return event.title ?? 'Tournament'
  // Child games inside a tournament get a clearer label
  if (event.parent_event_id) {
    return event.opponent ? `Tournament Game vs ${event.opponent}` : 'Tournament Game'
  }
  if (event.event_type === 'practice') return 'Practice'
  if (event.event_type === 'meeting')  return 'Team Meeting'
  if (event.opponent) return `${event.is_home ? 'vs' : '@'} ${event.opponent}`
  return event.title ?? 'Event'
}

function buildLocationLine(event: NewEventInput): string | null {
  if (!event.location_name) return null
  if (event.is_home === true)  return `Home — ${event.location_name}`
  if (event.is_home === false) return `Away — ${event.location_name}`
  return event.location_name
}

/**
 * Sends new-event notifications when an event falls today or tomorrow.
 * Call with `void` — never awaited from a server action that also calls redirect().
 */
export async function sendNewEventAlert({
  team,
  programName,
  event,
  assignedTeams,
  contacts,
  skipGroupMe,
}: {
  team:          NewEventTeam
  programName:   string
  event:         NewEventInput
  assignedTeams: AssignedTeam[]
  contacts:      NewEventContact[]
  skipGroupMe?:  boolean
}): Promise<void> {
  // ── 1. Urgency guard ──────────────────────────────────────────────────────────
  const day = dayLabel(event.event_date)
  if (!day) return
  if (team.schedule_published === false) return

  const appUrl        = getBaseUrl()
  const supabase      = createServiceClient()
  const formattedDate = formatDate(event.event_date)
  const eventLabel    = buildNewEventLabel(event)
  const locationLine  = buildLocationLine(event)
  const subject       = `${programName || team.name} — New Event Added`

  // Team time lines: "Varsity: 4:00 PM", "JV: 3:00 PM"
  const teamTimeLines = assignedTeams
    .map(t => {
      const time = formatTime(t.start_time)
      return time ? `${t.name}: ${time}` : t.name
    })
    .join('\n')

  // Build custom message body
  const bodyParts: string[] = [
    `${day} · ${formattedDate} · ${eventLabel}`,
  ]
  if (locationLine)  bodyParts.push(`📍 ${locationLine}`)
  if (teamTimeLines) bodyParts.push(`\n${teamTimeLines}`)

  const customMessage = bodyParts.join('\n')

  // Primary time shown in the email detail grid (receiving team's start time)
  const receivingTeam  = assignedTeams.find(t => t.name === team.name) ?? assignedTeams[0]
  const primaryTime    = formatTime(receivingTeam?.start_time ?? null)

  // ── 2. Email channel ──────────────────────────────────────────────────────────
  try {
    const withEmail = contacts.filter(
      (c): c is NewEventContact & { email: string } =>
        typeof c.email === 'string' &&
        c.email.length > 0 &&
        !c.email_unsubscribed,
    )

    if (withEmail.length > 0) {
      const resend      = new Resend(process.env.RESEND_API_KEY)
      const senderLabel = programName || 'SidelineOps'
      const from        = `${senderLabel} via SidelineOps <${process.env.NEXT_PUBLIC_FROM_EMAIL}>`

      const emailBase = {
        type:  'General Update' as const,
        event: {
          title:       eventLabel,
          date:        formattedDate,
          time:        primaryTime,
          location:        locationLine,
          locationAddress: event.location_address ?? null,
          teamName:        team.name,
          programName,
          teamSlug:        team.slug,
        },
        customMessage,
        appUrl,
      }

      let sent   = 0
      let failed = 0
      const BATCH = 10

      for (let i = 0; i < withEmail.length; i += BATCH) {
        const results = await Promise.all(
          withEmail.slice(i, i + BATCH).map(async c => {
            const token          = generateUnsubscribeToken(c.id)
            const unsubscribeUrl = `${appUrl}/api/unsubscribe?token=${token}`
            const html           = buildEventNotificationEmail({ ...emailBase, unsubscribeUrl })
            return resend.emails.send({ from, to: c.email, subject, html })
              .catch(() => ({ error: true }))
          })
        )
        results.forEach(r => ('error' in r && r.error) ? failed++ : sent++)
      }

      await supabase.from('notification_log').insert({
        team_id:           team.id,
        sent_count:        sent,
        failed_count:      failed,
        notification_type: 'new_event',
        recipient_group:   'all_contacts',
        channel:           'email',
        subject,
        message:           customMessage,
      })
    }
  } catch (err) {
    console.error(`[channel-router] new-event email for team ${team.id}:`, err)
  }

  // ── 3. GroupMe channel ────────────────────────────────────────────────────────
  if (team.groupme_enabled && team.groupme_bot_id && !skipGroupMe) {
    try {
      const timePart = assignedTeams
        .map(t => {
          const time = formatTime(t.start_time)
          return time ? `${t.name}: ${time}` : t.name
        })
        .join(' | ')

      const textParts: string[] = [
        `📅 ${programName || team.name} — New Event Added`,
        '',
        `${day} ${formattedDate} · ${eventLabel}`,
      ]
      if (locationLine) textParts.push(`📍 ${locationLine}`)
      if (timePart)     textParts.push(`⏰ ${timePart}`)
      
      const text = textParts.join('\n')
      const ok   = await sendGroupMeMessage(team.groupme_bot_id, text)

      await supabase.from('notification_log').insert({
        team_id:           team.id,
        sent_count:        ok ? 1 : 0,
        failed_count:      ok ? 0 : 1,
        notification_type: 'new_event',
        recipient_group:   'all_contacts',
        channel:           'groupme',
        subject,
        message:           customMessage,
      })
    } catch (err) {
      console.error(`[channel-router] new-event groupme for team ${team.id}:`, err)
    }
  }

  // ── 4. SMS/Twilio ─────────────────────────────────────────────────────────────
  // Reserved for a future block.
}
