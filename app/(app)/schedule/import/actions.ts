'use server'

import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient }                        from '@supabase/supabase-js'
import { redirect }                            from 'next/navigation'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// ── Shared types ──────────────────────────────────────────────────────────────

export type ImportRow = {
  date:            string   // MM/DD/YYYY
  eventType:       string   // Game, Practice, Tournament, Scrimmage
  team:            string   // Varsity, JV, etc. (informational only)
  opponent:        string
  homeAway:        string   // Home, Away, Neutral
  locationName:    string
  locationAddress: string
  startTime:       string   // HH:MM AM/PM
  arrivalTime:     string
  endTime:         string
  uniformNotes:    string
  notes:           string
  mealRequired:    string   // Yes, No
  mealTime:        string
  mealNotes:       string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseDate(val: string): string | null {
  const m = val.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
}

function parseTime(val: string): string | null {
  if (!val.trim()) return null
  const m = val.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  if (!m) return null
  let h = parseInt(m[1], 10)
  const min = m[2]
  const ampm = m[3].toUpperCase()
  if (ampm === 'PM' && h !== 12) h += 12
  if (ampm === 'AM' && h === 12) h = 0
  return `${String(h).padStart(2, '0')}:${min}:00`
}

function mapEventType(val: string): string | null {
  const map: Record<string, string> = {
    game:       'game',
    practice:   'practice',
    tournament: 'tournament',
    scrimmage:  'scrimmage',
  }
  return map[val.trim().toLowerCase()] ?? null
}

function mapIsHome(val: string): boolean | null {
  const v = val.trim().toLowerCase()
  if (v === 'home')    return true
  if (v === 'away')    return false
  if (v === 'neutral') return null
  return null
}

// ── checkForDuplicates ────────────────────────────────────────────────────────
// Returns "YYYY-MM-DD|eventType" keys that already exist for this program.

export async function checkForDuplicates(
  items:     { date: string; eventType: string }[],
  programId: string,
): Promise<{ duplicateKeys: string[] }> {
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/login')

  if (!items.length) return { duplicateKeys: [] }

  const parsedItems = items
    .map(i => ({ date: parseDate(i.date), type: mapEventType(i.eventType) }))
    .filter((i): i is { date: string; type: string } => i.date !== null && i.type !== null)

  if (!parsedItems.length) return { duplicateKeys: [] }

  const dates = [...new Set(parsedItems.map(i => i.date))]

  const service = createServiceClient()
  const { data: existing } = await service
    .from('events')
    .select('event_date, event_type')
    .eq('program_id', programId)
    .in('event_date', dates)

  const existingKeys = new Set(
    (existing ?? []).map(e => `${e.event_date}|${e.event_type}`)
  )

  const duplicateKeys = parsedItems
    .filter(i => existingKeys.has(`${i.date}|${i.type}`))
    .map(i => `${i.date}|${i.type}`)

  return { duplicateKeys }
}

// ── importSchedule ────────────────────────────────────────────────────────────

export async function importSchedule(
  rows:      ImportRow[],
  teamId:    string,
  programId: string,
): Promise<{ imported: number; replaced: number; failed: number; errors: string[] }> {
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/login')

  // Permission check
  const { data: teamUser } = await authClient
    .from('team_users')
    .select('can_manage_events')
    .eq('user_id', user.id)
    .eq('team_id', teamId)
    .single()

  if (!teamUser?.can_manage_events) {
    return { imported: 0, replaced: 0, failed: 0, errors: ['You do not have permission to import events.'] }
  }

  const service   = createServiceClient()
  let imported    = 0
  let replaced    = 0
  let failed      = 0
  const errors: string[] = []

  for (const row of rows) {
    try {
      // 1. Parse required fields
      const eventDate = parseDate(row.date)
      const eventType = mapEventType(row.eventType)

      if (!eventDate) {
        failed++
        errors.push(`Invalid date: "${row.date}"`)
        continue
      }
      if (!eventType) {
        failed++
        errors.push(`Invalid event type: "${row.eventType}" on ${row.date}`)
        continue
      }

      // 2. Parse optional fields
      const startTime   = parseTime(row.startTime)
      const arrivalTime = parseTime(row.arrivalTime)
      const endTime     = parseTime(row.endTime)
      const mealTime    = parseTime(row.mealTime)
      const isHome      = mapIsHome(row.homeAway)
      const mealRequired = row.mealRequired.trim().toLowerCase() === 'yes'

      // 3. Duplicate check — delete existing if found
      const { data: existing } = await service
        .from('events')
        .select('id')
        .eq('program_id', programId)
        .eq('event_date', eventDate)
        .eq('event_type', eventType)

      let wasReplaced = false

      if (existing && existing.length > 0) {
        for (const ex of existing) {
          // Delete dependent rows first (cascade not guaranteed)
          await service.from('event_team_details').delete().eq('event_id', ex.id)
          await service.from('event_volunteer_slots').delete().eq('event_id', ex.id)
          await service.from('events').delete().eq('id', ex.id)
        }
        wasReplaced = true
      }

      // 4. Insert event
      const { data: event, error: eventError } = await service
        .from('events')
        .insert({
          program_id:           programId,
          event_type:           eventType,
          event_date:           eventDate,
          opponent:             row.opponent  || null,
          is_home:              isHome,
          location_name:        row.locationName    || null,
          location_address:     row.locationAddress || null,
          default_start_time:   startTime   || null,
          default_arrival_time: arrivalTime || null,
          default_end_time:     endTime     || null,
          uniform_notes:        row.uniformNotes || null,
          notes:                row.notes        || null,
          meal_required:        mealRequired,
          meal_time:            mealTime    || null,
          meal_notes:           row.mealNotes    || null,
          status:               'scheduled',
          is_public:            true,
          is_tournament:        eventType === 'tournament',
          created_by_user_id:   user.id,
        })
        .select('id')
        .single()

      if (eventError || !event) {
        failed++
        errors.push(`Failed to insert event on ${row.date}: ${eventError?.message ?? 'unknown error'}`)
        continue
      }

      // 5. Insert event_team_details
      const { error: detailError } = await service
        .from('event_team_details')
        .insert({
          event_id:             event.id,
          team_id:              teamId,
          start_time:           startTime   || null,
          arrival_time:         arrivalTime || null,
          end_time:             endTime     || null,
          status:               'scheduled',
          notification_enabled: true,
        })

      if (detailError) {
        console.error(`[importSchedule] team detail error for event ${event.id}:`, detailError)
      }

      // Notifications intentionally suppressed during bulk import
      if (wasReplaced) replaced++
      else             imported++

    } catch (err: any) {
      failed++
      errors.push(`Unexpected error on row (${row.date}): ${err?.message ?? String(err)}`)
    }
  }

  return { imported, replaced, failed, errors }
}
