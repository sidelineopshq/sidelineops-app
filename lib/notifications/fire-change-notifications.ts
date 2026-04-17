import { createClient }      from '@supabase/supabase-js'
import {
  detectEventChanges,
  type EventSnapshot,
  type TeamDetailSnapshot,
} from './change-detector'
import { sendChangeAlert } from './channel-router'
import { formatProgramLabel } from '@/lib/utils/team-label'

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
  eventType,
  teamNotifications,
}: {
  eventDate:         string
  displayTitle:      string
  eventType:         string
  teamNotifications: TeamNotificationInput[]
}): Promise<void> {
  if (!teamNotifications.length) return

  const supabase = createServiceClient()
  const sentGroupMeBotIds = new Set<string>()

  for (const tn of teamNotifications) {
    try {
      const diff = detectEventChanges({
        eventDate,
        oldEvent:      tn.oldEvent,
        newEvent:      tn.newEvent,
        oldTeamDetail: tn.oldTeamDetail,
        newTeamDetail: tn.newTeamDetail,
        teamName:      tn.teamName,
      })

      if (!diff.hasChanges || !diff.isUrgent) continue

      // ── Fetch team (with channel config) + contact_teams + program in parallel ─
      const [{ data: team }, { data: ctRows }] = await Promise.all([
        supabase
          .from('teams')
          .select('name, level, slug, notify_on_change, groupme_enabled, groupme_bot_id, program_id, schedule_published, programs(sport, schools(name))')
          .eq('id', tn.teamId)
          .single(),
        supabase
          .from('contact_teams')
          .select('contact_id')
          .eq('team_id', tn.teamId),
      ])

      // Fetch contacts: legacy (contacts.team_id) + program-join (contact_teams)
      const ctContactIds = (ctRows ?? []).map(r => r.contact_id)
      const contactsBuilder = supabase
        .from('contacts')
        .select('id, first_name, email, sms_consent, email_unsubscribed')
        .is('deleted_at', null)
        .or('email.not.is.null,sms_consent.eq.true')
      const { data: contacts } = ctContactIds.length > 0
        ? await contactsBuilder.or(`team_id.eq.${tn.teamId},id.in.(${ctContactIds.join(',')})`)
        : await contactsBuilder.eq('team_id', tn.teamId)

      if (!team) continue

      const schoolName   = (team as any).programs?.schools?.name ?? ''
      const sport        = (team as any).programs?.sport ?? ''
      const programLabel = formatProgramLabel(schoolName, sport)

      // ── GroupMe dedup: skip if this bot already sent for this event ──────
      const botId = team.groupme_enabled ? (team.groupme_bot_id ?? null) : null
      const skipGroupMe = botId !== null && sentGroupMeBotIds.has(botId)
      if (botId) sentGroupMeBotIds.add(botId)

      // ── Delegate to channel router ────────────────────────────────────────
      await sendChangeAlert({
        team: {
          id:                tn.teamId,
          name:              programLabel,
          slug:              team.slug ?? null,
          notify_on_change:  team.notify_on_change,
          groupme_enabled:   team.groupme_enabled,
          groupme_bot_id:    team.groupme_bot_id,
          schedule_published: (team as any).schedule_published ?? null,
        },
        programId:   team.program_id,
        programName: programLabel,
        event: {
          title:              displayTitle,
          event_date:         eventDate,
          default_start_time: tn.newTeamDetail.start_time,
          location_name:      tn.newEvent.location_name,
          location_address:   tn.newEvent.location_address,
          event_type:         eventType,
        },
        changes:  diff.changes,
        contacts: (contacts ?? []).map(c => ({
          id:                 c.id,
          first_name:         c.first_name,
          email:              c.email,
          email_unsubscribed: c.email_unsubscribed,
        })),
        skipGroupMe,
      })
    } catch (err) {
      console.error(`[fireChangeNotifications] team ${tn.teamId}:`, err)
    }
  }
}
