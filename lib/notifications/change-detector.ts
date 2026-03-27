/**
 * change-detector.ts
 *
 * Compares old and new versions of an event + event_team_details record
 * and returns a structured diff of fields that warrant a notification.
 *
 * Usage:
 * ```ts
 * import { detectEventChanges } from '@/lib/notifications/change-detector'
 *
 * const diff = detectEventChanges({
 *   eventDate: '2026-03-28',
 *   oldEvent: { default_end_time: null, status: 'scheduled', ... },
 *   newEvent: { default_end_time: null, status: 'cancelled', ... },
 *   oldTeamDetail: { start_time: null, end_time: null, status: 'scheduled' },
 *   newTeamDetail: { start_time: '17:30:00', end_time: null, status: 'scheduled' },
 *   teamName: 'Varsity',
 * })
 *
 * if (diff.hasChanges) {
 *   // diff.changes  — array of { field, label, from, to }
 *   // diff.isUrgent — true when the event is today or tomorrow
 * }
 * ```
 */

export interface EventSnapshot {
  default_end_time:   string | null
  location_name:      string | null
  location_address:   string | null
  status:             string
}

export interface TeamDetailSnapshot {
  start_time: string | null
  end_time:   string | null
  status:     string
}

export interface ChangeRecord {
  field: string
  label: string
  from:  string
  to:    string
}

export interface EventChangeDiff {
  hasChanges: boolean
  changes:    ChangeRecord[]
  isUrgent:   boolean
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

/**
 * Converts a database time string (HH:MM:SS or HH:MM) to a human-readable
 * 12-hour format like "4:00 PM". Returns the original string unchanged if it
 * cannot be parsed.
 */
function formatTime(value: string | null): string {
  if (!value) return 'None'

  const match = value.match(/^(\d{1,2}):(\d{2})/)
  if (!match) return value

  let hours = parseInt(match[1], 10)
  const minutes = parseInt(match[2], 10)
  const period = hours >= 12 ? 'PM' : 'AM'

  if (hours === 0) hours = 12
  else if (hours > 12) hours -= 12

  const paddedMinutes = minutes === 0 ? '' : `:${String(minutes).padStart(2, '0')}`
  return `${hours}${paddedMinutes} ${period}`
}

const STATUS_LABELS: Record<string, string> = {
  scheduled:  'Scheduled',
  postponed:  'Postponed',
  rescheduled: 'Rescheduled',
  completed:  'Completed',
  cancelled:  'Cancelled',
}

function formatStatus(value: string | null): string {
  if (!value) return 'None'
  return STATUS_LABELS[value.toLowerCase()] ?? value
}

// ---------------------------------------------------------------------------
// Urgency check
// ---------------------------------------------------------------------------

/**
 * Returns true if `eventDate` (YYYY-MM-DD) falls on today or tomorrow in the
 * local timezone.
 */
function isUrgentDate(eventDate: string): boolean {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  // Parse without shifting timezone (treat date as local midnight)
  const [year, month, day] = eventDate.split('-').map(Number)
  const target = new Date(year, month - 1, day)

  return target.getTime() === today.getTime() || target.getTime() === tomorrow.getTime()
}

// ---------------------------------------------------------------------------
// Core diff logic
// ---------------------------------------------------------------------------

/**
 * Detects notifiable changes between two snapshots of an event and its
 * team-specific detail row.
 *
 * @param eventDate      - ISO date string (YYYY-MM-DD) for the event; used to
 *                         determine urgency.
 * @param oldEvent       - Previous state of the event row fields.
 * @param newEvent       - Updated state of the event row fields.
 * @param oldTeamDetail  - Previous state of the event_team_details row.
 * @param newTeamDetail  - Updated state of the event_team_details row.
 * @param teamName       - Team display name (e.g. "Varsity") used in change labels.
 */
export function detectEventChanges({
  eventDate,
  oldEvent,
  newEvent,
  oldTeamDetail,
  newTeamDetail,
  teamName,
}: {
  eventDate:     string
  oldEvent:      EventSnapshot
  newEvent:      EventSnapshot
  oldTeamDetail: TeamDetailSnapshot
  newTeamDetail: TeamDetailSnapshot
  teamName:      string
}): EventChangeDiff {
  const changes: ChangeRecord[] = []

  // -- event fields ----------------------------------------------------------

  if (oldEvent.default_end_time !== newEvent.default_end_time) {
    changes.push({
      field: 'default_end_time',
      label: 'Default End Time',
      from:  formatTime(oldEvent.default_end_time),
      to:    formatTime(newEvent.default_end_time),
    })
  }

  if (oldEvent.location_name !== newEvent.location_name) {
    changes.push({
      field: 'location_name',
      label: 'Location',
      from:  oldEvent.location_name ?? 'None',
      to:    newEvent.location_name ?? 'None',
    })
  }

  if (oldEvent.location_address !== newEvent.location_address) {
    changes.push({
      field: 'location_address',
      label: 'Location Address',
      from:  oldEvent.location_address ?? 'None',
      to:    newEvent.location_address ?? 'None',
    })
  }

  if (oldEvent.status !== newEvent.status) {
    changes.push({
      field: 'status',
      label: 'Event Status',
      from:  formatStatus(oldEvent.status),
      to:    formatStatus(newEvent.status),
    })
  }

  // -- event_team_details fields ---------------------------------------------

  if (oldTeamDetail.start_time !== newTeamDetail.start_time) {
    changes.push({
      field: 'team_start_time',
      label: `${teamName} Start Time`,
      from:  formatTime(oldTeamDetail.start_time),
      to:    formatTime(newTeamDetail.start_time),
    })
  }

  if (oldTeamDetail.end_time !== newTeamDetail.end_time) {
    changes.push({
      field: 'team_end_time',
      label: `${teamName} End Time`,
      from:  formatTime(oldTeamDetail.end_time),
      to:    formatTime(newTeamDetail.end_time),
    })
  }

  if (oldTeamDetail.status !== newTeamDetail.status) {
    changes.push({
      field: 'team_status',
      label: 'Team Status',
      from:  formatStatus(oldTeamDetail.status),
      to:    formatStatus(newTeamDetail.status),
    })
  }

  return {
    hasChanges: changes.length > 0,
    changes,
    isUrgent:   isUrgentDate(eventDate),
  }
}
