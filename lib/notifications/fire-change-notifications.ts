import { createClient }      from '@supabase/supabase-js'
import {
  detectEventChanges,
  type EventSnapshot,
  type TeamDetailSnapshot,
} from './change-detector'
import { sendChangeAlert } from './channel-router'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
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
  teamName:      string
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
 *  2. Fetches team (with channel config), contacts, and program in parallel
 *  3. Delegates to sendChangeAlert (channel router) which handles email, GroupMe, etc.
 *
 * Errors per-team are caught individually so one failure does not
 * prevent notifications for the remaining teams.
 */
export async function fireChangeNotifications({
  eventDate,
  displayTitle,
  teamNotifications,
}: {
  eventDate:         string
  displayTitle:      string
  teamNotifications: TeamNotificationInput[]
}): Promise<void> {
  if (!teamNotifications.length) return

  const supabase = createServiceClient()

  for (const tn of teamNotifications) {
    try {
      console.log('[CHANGE ALERT] Old event status:', tn.oldEvent.status)
      console.log('[CHANGE ALERT] Old team status:', tn.oldTeamDetail.status)
      console.log('[CHANGE ALERT] New event status:', tn.newEvent.status)
      console.log('[CHANGE ALERT] New team status:', tn.newTeamDetail.status)
      console.log('[CHANGE ALERT] Event date:', eventDate)

      const diff = detectEventChanges({
        eventDate,
        oldEvent:      tn.oldEvent,
        newEvent:      tn.newEvent,
        oldTeamDetail: tn.oldTeamDetail,
        newTeamDetail: tn.newTeamDetail,
        teamName:      tn.teamName,
      })

      const now = new Date()
      console.log('[CHANGE ALERT] Server UTC time:', now.toISOString())
      console.log('[CHANGE ALERT] Event date from DB:', eventDate)
      console.log('[CHANGE ALERT] Central today:', now.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }))
      console.log('[CHANGE ALERT] Central tomorrow:', new Date(now.getTime() + 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }))
      console.log('[CHANGE ALERT] isUrgent:', diff.isUrgent)
      console.log('[CHANGE ALERT] hasChanges:', diff.hasChanges)
      console.log('[CHANGE ALERT] changes:', JSON.stringify(diff.changes))

      if (!diff.hasChanges || !diff.isUrgent) continue

      // ── Fetch team (with channel config) + contacts + program in parallel ─
      const [{ data: team }, { data: contacts }] = await Promise.all([
        supabase
          .from('teams')
          .select('name, slug, notify_on_change, groupme_enabled, groupme_bot_id, program_id')
          .eq('id', tn.teamId)
          .single(),
        supabase
          .from('contacts')
          .select('id, first_name, email, sms_consent, email_unsubscribed')
          .eq('team_id', tn.teamId)
          .is('deleted_at', null)
          .or('email.not.is.null,sms_consent.eq.true'),
      ])

      console.log('[CHANGE ALERT] notify_on_change:', team?.notify_on_change)
      console.log('[CHANGE ALERT] contacts found:', contacts?.length ?? 0)

      if (!team) continue

      const { data: program } = await supabase
        .from('programs')
        .select('name')
        .eq('id', team.program_id)
        .single()

      // ── Delegate to channel router ────────────────────────────────────────
      await sendChangeAlert({
        team: {
          id:               tn.teamId,
          name:             team.name ?? '',
          slug:             team.slug ?? null,
          notify_on_change: team.notify_on_change,
          groupme_enabled:  team.groupme_enabled,
          groupme_bot_id:   team.groupme_bot_id,
        },
        programName: program?.name ?? '',
        event: {
          title:              displayTitle,
          event_date:         eventDate,
          default_start_time: tn.newTeamDetail.start_time,
          location_name:      tn.newEvent.location_name,
        },
        changes:  diff.changes,
        contacts: (contacts ?? []).map(c => ({
          id:                 c.id,
          first_name:         c.first_name,
          email:              c.email,
          email_unsubscribed: c.email_unsubscribed,
        })),
      })
    } catch (err) {
      console.error(`[fireChangeNotifications] team ${tn.teamId}:`, err)
    }
  }
}
