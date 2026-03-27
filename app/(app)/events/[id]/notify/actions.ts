'use server'


import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient }                        from '@supabase/supabase-js'
import { Resend }                              from 'resend'
import { redirect }                            from 'next/navigation'
import {
  buildEventNotificationEmail,
  type NotificationType,
} from '@/lib/email/eventNotification'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function formatTime(time: string | null): string | null {
  if (!time) return null
  const [h, m] = time.split(':')
  const hour = parseInt(h)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  return `${hour % 12 || 12}:${m} ${ampm}`
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  })
}

export async function sendNotification(payload: {
  eventId:          string
  contactIds:       string[]
  notificationType: NotificationType
  subject:          string
  message:          string
  teamId:           string        // primary team context
}) {
  const { eventId, contactIds, notificationType, subject, message, teamId } = payload

  if (!contactIds.length)   return { error: 'No contacts selected.' }
  if (!message.trim())      return { error: 'Message cannot be empty.' }
  if (!subject.trim())      return { error: 'Subject cannot be empty.' }

  // ── Auth ──────────────────────────────────────────────────────────────────
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/login')

  // ── Permission check ──────────────────────────────────────────────────────
  const { data: teamUser } = await authClient
    .from('team_users')
    .select('can_send_notifications, team_id')
    .eq('user_id', user.id)
    .eq('team_id', teamId)
    .single()

  if (!teamUser?.can_send_notifications) {
    return { error: 'You do not have permission to send notifications.' }
  }

  const service = createServiceClient()

  // ── Fetch event (server-side, never trust client) ─────────────────────────
  const { data: event } = await service
    .from('events')
    .select(`
      id, event_type, title, opponent, is_home, is_tournament,
      location_name, event_date, default_start_time, program_id
    `)
    .eq('id', eventId)
    .single()

  if (!event) return { error: 'Event not found.' }

  // ── Fetch team + program for email context ────────────────────────────────
  const { data: team } = await service
    .from('teams')
    .select('name, slug')
    .eq('id', teamId)
    .single()

  const { data: program } = await service
    .from('programs')
    .select('name, sport')
    .eq('id', event.program_id)
    .single()

  // ── Fetch contacts server-side (verify ownership) ─────────────────────────
  const { data: teamUsersAll } = await authClient
    .from('team_users')
    .select('team_id')
    .eq('user_id', user.id)

  const allTeamIds = (teamUsersAll ?? []).map(t => t.team_id)

  const { data: contacts } = await service
    .from('contacts')
    .select('id, first_name, last_name, email, team_id')
    .in('id', contactIds)
    .in('team_id', allTeamIds)     // verify contacts belong to coach's teams
    .is('deleted_at', null)

  if (!contacts?.length) return { error: 'No valid contacts found.' }

  const withEmail    = contacts.filter(c => c.email)
  const skipped      = contacts.length - withEmail.length

  if (!withEmail.length) {
    return { error: 'None of the selected contacts have an email address.' }
  }

  // ── Build email ───────────────────────────────────────────────────────────
  const appUrl   = process.env.NEXT_PUBLIC_APP_URL ?? 'https://sidelineopshq.com'
  const senderLabel = program?.name ?? ''
  const fromName    = senderLabel ? `${senderLabel} via SidelineOps` : 'SidelineOps'
  const from     = `${fromName} <${process.env.NEXT_PUBLIC_FROM_EMAIL}>`
  const replyTo  = user.email ?? undefined

  const eventTitle = event.event_type === 'tournament'
    ? event.title ?? 'Tournament'
    : event.opponent
      ? `${event.is_home ? 'vs' : '@'} ${event.opponent}`
      : event.title ?? 'Event'

  const html = buildEventNotificationEmail({
    type: notificationType,
    event: {
      title:       eventTitle,
      date:        formatDate(event.event_date),
      time:        formatTime(event.default_start_time),
      location:    event.location_name,
      teamName:    team?.name ?? '',
      programName: program?.name ?? '',
      teamSlug:    team?.slug ?? null,
    },
    customMessage: message,
    appUrl,
  })

  // ── Send in batches of 10 ─────────────────────────────────────────────────
  const resend    = new Resend(process.env.RESEND_API_KEY)
  const batchSize = 10
  let sent        = 0
  let failed      = 0

  for (let i = 0; i < withEmail.length; i += batchSize) {
    const batch = withEmail.slice(i, i + batchSize)
    const results = await Promise.all(
      batch.map(contact =>
        resend.emails.send({
          from,
          to:      contact.email!,
          subject,
          html,
          replyTo,
        }).catch(() => ({ error: true }))
      )
    )
    results.forEach(r => ('error' in r && r.error) ? failed++ : sent++)
  }

  // ── Log to notification_log ───────────────────────────────────────────────
  await service.from('notification_log').insert({
    team_id:           teamId,
    event_id:          eventId,
    sent_count:        sent,
    failed_count:      failed + skipped,
    notification_type: notificationType,
    recipient_group:   notificationType,
    subject,
    message,
    created_by:        user.id,
  })

  return { success: true, sent, skipped: skipped + failed }
}
