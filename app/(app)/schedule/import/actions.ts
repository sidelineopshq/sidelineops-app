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
  date:            string   // YYYY-MM-DD (after parseExcelDate)
  eventType:       string   // Game, Practice, Tournament, Scrimmage
  team:            string   // "Varsity" | "JV" | "All" | "Varsity, JV" …
  opponent:        string
  homeAway:        string   // Home, Away, Neutral
  locationName:    string
  locationAddress: string
  startTime:       string   // HH:MM:SS (after parseExcelTime)
  arrivalTime:     string
  endTime:         string
  uniformNotes:    string
  notes:           string
  mealRequired:    string   // Yes, No
  mealTime:        string
  mealNotes:       string
}

export type DuplicateRecord = {
  key:             string        // "YYYY-MM-DD|eventType"
  eventId:         string
  isHome:          boolean | null
  slotCount:       number
  assignmentCount: number
}

export type ImportResult = {
  imported:            number   // new events created
  updated:             number   // existing events updated in place (slots preserved)
  replaced:            number   // deleted + recreated (type/home changed)
  volunteersPreserved: number
  volunteersLost:      number
  failed:              number
  warnings:            string[]
  errors:              string[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseDate(val: string): string | null {
  if (!val.trim()) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(val.trim())) return val.trim()
  const m = val.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
}

function parseTime(val: string): string | null {
  if (!val.trim()) return null
  if (/^\d{2}:\d{2}:\d{2}$/.test(val.trim())) return val.trim()
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
    game: 'game', practice: 'practice', tournament: 'tournament', scrimmage: 'scrimmage',
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

export async function checkForDuplicates(
  items:     { date: string; eventType: string }[],
  programId: string,
): Promise<{ duplicates: DuplicateRecord[] }> {
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/login')

  if (!items.length) return { duplicates: [] }

  const parsedItems = items
    .map(i => ({ date: parseDate(i.date), type: mapEventType(i.eventType) }))
    .filter((i): i is { date: string; type: string } => i.date !== null && i.type !== null)

  if (!parsedItems.length) return { duplicates: [] }

  const dates = [...new Set(parsedItems.map(i => i.date))]

  const service = createServiceClient()

  const { data: existing } = await service
    .from('events')
    .select('id, event_date, event_type, is_home')
    .eq('program_id', programId)
    .in('event_date', dates)

  if (!existing?.length) return { duplicates: [] }

  // Filter to only the dates+types we're importing
  const wantKeys = new Set(parsedItems.map(i => `${i.date}|${i.type}`))
  const matched  = existing.filter(e => wantKeys.has(`${e.event_date}|${e.event_type}`))

  // Fetch volunteer slot + assignment counts for matched events
  const duplicates: DuplicateRecord[] = await Promise.all(
    matched.map(async e => {
      const { data: slots } = await service
        .from('event_volunteer_slots')
        .select('id, volunteer_assignments(id)')
        .eq('event_id', e.id)

      const slotCount       = (slots ?? []).length
      const assignmentCount = (slots ?? []).reduce(
        (sum, slot) => sum + ((slot as any).volunteer_assignments?.length ?? 0), 0
      )

      return {
        key:             `${e.event_date}|${e.event_type}`,
        eventId:         e.id,
        isHome:          e.is_home,
        slotCount,
        assignmentCount,
      }
    })
  )

  return { duplicates }
}

// ── importSchedule ────────────────────────────────────────────────────────────

export async function importSchedule(
  rows:      ImportRow[],
  programId: string,
): Promise<ImportResult> {
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/login')

  // Permission: user must have can_manage_events on at least one team in this program
  const { data: programTeamsAuth } = await authClient
    .from('teams')
    .select('id')
    .eq('program_id', programId)

  const programTeamIds = (programTeamsAuth ?? []).map(t => t.id)

  const { data: teamUsers } = await authClient
    .from('team_users')
    .select('can_manage_events')
    .eq('user_id', user.id)
    .in('team_id', programTeamIds)

  if (!teamUsers?.some(t => t.can_manage_events)) {
    return { imported: 0, updated: 0, replaced: 0, volunteersPreserved: 0, volunteersLost: 0, failed: 0, warnings: [], errors: ['You do not have permission to import events.'] }
  }

  const service = createServiceClient()

  // Build team level → id lookup for this program
  const { data: allTeams } = await service
    .from('teams')
    .select('id, level')
    .eq('program_id', programId)

  const allTeamIds   = (allTeams ?? []).map(t => t.id)
  const teamByLevel  = new Map<string, string>()
  for (const t of allTeams ?? []) {
    if (t.level) teamByLevel.set(t.level.toLowerCase(), t.id)
  }

  function parseTeamIds(val: string): string[] | null {
    const v = val.trim()
    if (!v) return null
    if (v.toLowerCase() === 'all') return allTeamIds
    const parts = v.split(',').map(p => p.trim()).filter(Boolean)
    const ids: string[] = []
    for (const part of parts) {
      const id = teamByLevel.get(part.toLowerCase())
      if (!id) return null   // unknown level → invalid row
      ids.push(id)
    }
    return ids.length > 0 ? [...new Set(ids)] : null
  }

  let imported            = 0
  let updated             = 0
  let replaced            = 0
  let volunteersPreserved = 0
  let volunteersLost      = 0
  let failed              = 0
  const warnings: string[] = []
  const errors:   string[] = []

  for (const row of rows) {
    try {
      const eventDate = parseDate(row.date)
      const eventType = mapEventType(row.eventType)
      const teamIds   = parseTeamIds(row.team)

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
      if (!teamIds) {
        failed++
        errors.push(`Team "${row.team}" not found in this program (${row.date})`)
        continue
      }

      const startTime    = parseTime(row.startTime)
      const arrivalTime  = parseTime(row.arrivalTime)
      const endTime      = parseTime(row.endTime)
      const mealTime     = parseTime(row.mealTime)
      const isHome       = mapIsHome(row.homeAway)
      const mealRequired = row.mealRequired.trim().toLowerCase() === 'yes'

      // ── Duplicate check ─────────────────────────────────────────────────────
      const { data: existing } = await service
        .from('events')
        .select('id, is_home')
        .eq('program_id', programId)
        .eq('event_date', eventDate)
        .eq('event_type', eventType)

      if (existing && existing.length > 0) {
        // Use the first match (there should only be one)
        const ex = existing[0]

        // Fetch volunteer slot / assignment counts
        const { data: slots } = await service
          .from('event_volunteer_slots')
          .select('id, volunteer_assignments(id)')
          .eq('event_id', ex.id)

        const slotCount       = (slots ?? []).length
        const assignmentCount = (slots ?? []).reduce(
          (sum, slot) => sum + ((slot as any).volunteer_assignments?.length ?? 0), 0
        )

        const hasVolunteers = slotCount > 0
        const shouldPreserveSlots =
          hasVolunteers &&
          isHome === true &&
          ex.is_home === true

        if (shouldPreserveSlots) {
          // ── In-place UPDATE: volunteer slots are preserved ─────────────────
          await service
            .from('events')
            .update({
              opponent:             row.opponent        || null,
              is_home:              isHome,
              location_name:        row.locationName    || null,
              location_address:     row.locationAddress || null,
              default_start_time:   startTime           || null,
              default_arrival_time: arrivalTime         || null,
              default_end_time:     endTime             || null,
              uniform_notes:        row.uniformNotes    || null,
              notes:                row.notes           || null,
              meal_required:        mealRequired,
              meal_time:            mealTime            || null,
              meal_notes:           row.mealNotes       || null,
            })
            .eq('id', ex.id)

          // Upsert event_team_details for each team in the import row
          for (const teamId of teamIds) {
            await service
              .from('event_team_details')
              .upsert(
                {
                  event_id:     ex.id,
                  team_id:      teamId,
                  start_time:   startTime   || null,
                  arrival_time: arrivalTime || null,
                  end_time:     endTime     || null,
                },
                { onConflict: 'event_id,team_id' }
              )
          }

          // Notifications intentionally suppressed during bulk import
          updated++
          volunteersPreserved += slotCount

        } else {
          // ── DELETE + recreate ───────────────────────────────────────────────
          if (assignmentCount > 0) {
            // Warn that assignments will be lost
            const fmt = new Date(eventDate + 'T00:00:00').toLocaleDateString('en-US', {
              weekday: 'short', month: 'short', day: 'numeric',
            })
            warnings.push(
              `${fmt} — Volunteer assignments removed because the event's home/away status changed.`
            )
            volunteersLost += assignmentCount
          }

          // Delete in dependency order
          if (slotCount > 0) {
            const slotIds = (slots ?? []).map((s: any) => s.id as string)
            await service.from('volunteer_assignments').delete().in('event_volunteer_slot_id', slotIds)
            await service.from('event_volunteer_slots').delete().eq('event_id', ex.id)
          }
          await service.from('event_team_details').delete().eq('event_id', ex.id)
          await service.from('events').delete().eq('id', ex.id)

          // Fall through to INSERT below
          const { data: newEvent, error: insertErr } = await service
            .from('events')
            .insert({
              program_id:           programId,
              event_type:           eventType,
              event_date:           eventDate,
              opponent:             row.opponent        || null,
              is_home:              isHome,
              location_name:        row.locationName    || null,
              location_address:     row.locationAddress || null,
              default_start_time:   startTime           || null,
              default_arrival_time: arrivalTime         || null,
              default_end_time:     endTime             || null,
              uniform_notes:        row.uniformNotes    || null,
              notes:                row.notes           || null,
              meal_required:        mealRequired,
              meal_time:            mealTime            || null,
              meal_notes:           row.mealNotes       || null,
              status:               'scheduled',
              is_public:            true,
              is_tournament:        eventType === 'tournament',
              created_by_user_id:   user.id,
            })
            .select('id')
            .single()

          if (insertErr || !newEvent) {
            failed++
            errors.push(`Failed to recreate event on ${row.date}: ${insertErr?.message ?? 'unknown'}`)
            continue
          }

          for (const teamId of teamIds) {
            await service.from('event_team_details').insert({
              event_id:             newEvent.id,
              team_id:              teamId,
              start_time:           startTime   || null,
              arrival_time:         arrivalTime || null,
              end_time:             endTime     || null,
              status:               'scheduled',
              notification_enabled: true,
            })
          }

          // Notifications intentionally suppressed during bulk import
          replaced++
        }

      } else {
        // ── New event INSERT ───────────────────────────────────────────────────
        const { data: newEvent, error: insertErr } = await service
          .from('events')
          .insert({
            program_id:           programId,
            event_type:           eventType,
            event_date:           eventDate,
            opponent:             row.opponent        || null,
            is_home:              isHome,
            location_name:        row.locationName    || null,
            location_address:     row.locationAddress || null,
            default_start_time:   startTime           || null,
            default_arrival_time: arrivalTime         || null,
            default_end_time:     endTime             || null,
            uniform_notes:        row.uniformNotes    || null,
            notes:                row.notes           || null,
            meal_required:        mealRequired,
            meal_time:            mealTime            || null,
            meal_notes:           row.mealNotes       || null,
            status:               'scheduled',
            is_public:            true,
            is_tournament:        eventType === 'tournament',
            created_by_user_id:   user.id,
          })
          .select('id')
          .single()

        if (insertErr || !newEvent) {
          failed++
          errors.push(`Failed to insert event on ${row.date}: ${insertErr?.message ?? 'unknown error'}`)
          continue
        }

        for (const teamId of teamIds) {
          await service.from('event_team_details').insert({
            event_id:             newEvent.id,
            team_id:              teamId,
            start_time:           startTime   || null,
            arrival_time:         arrivalTime || null,
            end_time:             endTime     || null,
            status:               'scheduled',
            notification_enabled: true,
          })
        }

        // Notifications intentionally suppressed during bulk import
        imported++
      }

    } catch (err: any) {
      failed++
      errors.push(`Unexpected error on row (${row.date}): ${err?.message ?? String(err)}`)
    }
  }

  return { imported, updated, replaced, volunteersPreserved, volunteersLost, failed, warnings, errors }
}
