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
  date:            string   // YYYY-MM-DD
  eventType:       string   // game, practice, tournament, scrimmage
  team:            string   // "Varsity" | "JV" | "All" | "Varsity, JV"
  opponent:        string
  homeAway:        string   // Home, Away, Neutral
  locationName:    string
  locationAddress: string
  startTime:       string   // HH:MM:SS
  arrivalTime:     string
  endTime:         string
  uniformNotes:    string
  notes:           string
  mealRequired:    string   // Yes, No
  mealTime:        string
  mealNotes:       string
}

// A resolved row after team lookup — one row per team
export type ResolvedRow = ImportRow & {
  teamId: string   // single team ID (client already resolved multi-team to multiple rows)
}

// Group of resolved rows sharing the same event
export type ImportGroup = {
  primaryRow:      ResolvedRow   // drives event-level fields and default times
  allRows:         ResolvedRow[] // one per team_detail row
}

export type DuplicateRecord = {
  key:             string        // "YYYY-MM-DD|eventType|opponent"
  eventId:         string
  isHome:          boolean | null
  slotCount:       number
  assignmentCount: number
}

export type ImportResult = {
  imported:            number
  updated:             number
  replaced:            number
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
  const min  = m[2]
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

function groupKey(date: string, eventType: string, opponent: string): string {
  return `${date}|${eventType}|${(opponent ?? '').trim().toLowerCase()}`
}

// ── checkForDuplicates ────────────────────────────────────────────────────────
// items now include opponent so the key matches group-level duplicate detection

export async function checkForDuplicates(
  items:     { date: string; eventType: string; opponent: string }[],
  programId: string,
): Promise<{ duplicates: DuplicateRecord[] }> {
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/login')

  if (!items.length) return { duplicates: [] }

  const parsedItems = items
    .map(i => ({
      date:     parseDate(i.date),
      type:     mapEventType(i.eventType),
      opponent: (i.opponent ?? '').trim().toLowerCase(),
    }))
    .filter((i): i is { date: string; type: string; opponent: string } =>
      i.date !== null && i.type !== null
    )

  if (!parsedItems.length) return { duplicates: [] }

  const dates = [...new Set(parsedItems.map(i => i.date))]
  const service = createServiceClient()

  const { data: existing } = await service
    .from('events')
    .select('id, event_date, event_type, opponent, is_home')
    .eq('program_id', programId)
    .in('event_date', dates)

  if (!existing?.length) return { duplicates: [] }

  const wantKeys = new Set(
    parsedItems.map(i => groupKey(i.date, i.type, i.opponent))
  )

  const matched = existing.filter(e =>
    wantKeys.has(groupKey(e.event_date, e.event_type, e.opponent ?? ''))
  )

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
        key:             groupKey(e.event_date, e.event_type, e.opponent ?? ''),
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
// rows may represent multiple teams per event; server groups them by
// date+eventType+opponent and creates one event per group.

export async function importSchedule(
  rows:      ImportRow[],
  programId: string,
): Promise<ImportResult> {
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/login')

  // Permission check
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
    return {
      imported: 0, updated: 0, replaced: 0,
      volunteersPreserved: 0, volunteersLost: 0, failed: 0,
      warnings: [], errors: ['You do not have permission to import events.'],
    }
  }

  const service = createServiceClient()

  // Build team lookup for this program
  const { data: allTeams } = await service
    .from('teams')
    .select('id, level, is_primary, sort_order')
    .eq('program_id', programId)
    .order('is_primary', { ascending: false })
    .order('sort_order', { ascending: true })

  const allTeamIds  = (allTeams ?? []).map(t => t.id)
  const teamByLevel = new Map<string, { id: string; isPrimary: boolean }>()
  for (const t of allTeams ?? []) {
    if (t.level) teamByLevel.set(t.level.toLowerCase(), { id: t.id, isPrimary: !!(t as any).is_primary })
  }
  const primaryTeamId = (allTeams ?? []).find(t => (t as any).is_primary)?.id ?? null

  function resolveTeamIds(val: string): string[] | null {
    const v = val.trim()
    if (!v) return null
    if (v.toLowerCase() === 'all') return allTeamIds
    const parts = v.split(',').map(p => p.trim()).filter(Boolean)
    const ids: string[] = []
    for (const part of parts) {
      const entry = teamByLevel.get(part.toLowerCase())
      if (!entry) return null
      ids.push(entry.id)
    }
    return ids.length > 0 ? [...new Set(ids)] : null
  }

  // Build groups: group key = date|eventType|opponent
  // For Use Case 1 (comma-separated teams in one row): expand to one ResolvedRow per team
  // For Use Case 2 (separate rows same event): they naturally share the same key

  type ResolvedRowInternal = {
    row:    ImportRow
    teamId: string
    isPrimaryTeam: boolean
    date:    string
    type:    string
    isHome:  boolean | null
  }

  const groups = new Map<string, ResolvedRowInternal[]>()
  let failed = 0
  const errors: string[] = []

  for (const row of rows) {
    const date = parseDate(row.date)
    const type = mapEventType(row.eventType)
    if (!date) {
      failed++
      errors.push(`Invalid date: "${row.date}"`)
      continue
    }
    if (!type) {
      failed++
      errors.push(`Invalid event type: "${row.eventType}" on ${row.date}`)
      continue
    }
    const teamIds = resolveTeamIds(row.team)
    if (!teamIds) {
      failed++
      errors.push(`Team "${row.team}" not found in this program (${row.date})`)
      continue
    }

    const isHome = mapIsHome(row.homeAway)
    const key    = groupKey(date, type, row.opponent)

    for (const teamId of teamIds) {
      const entry = teamByLevel.get(
        [...teamByLevel.entries()].find(([, v]) => v.id === teamId)?.[0] ?? ''
      )
      const isPrimaryTeam = teamId === primaryTeamId
      const group = groups.get(key) ?? []
      group.push({ row, teamId, isPrimaryTeam, date, type, isHome })
      groups.set(key, group)
    }
  }

  let imported            = 0
  let updated             = 0
  let replaced            = 0
  let volunteersPreserved = 0
  let volunteersLost      = 0
  const warnings: string[] = []

  for (const [key, groupRows] of groups) {
    try {
      // Sort so primary team is first
      groupRows.sort((a, b) => (a.isPrimaryTeam ? -1 : 1) - (b.isPrimaryTeam ? -1 : 1))

      const lead = groupRows[0]
      const primaryRow = lead.row
      const eventDate  = lead.date
      const eventType  = lead.type
      const isHome     = lead.isHome

      const startTime    = parseTime(primaryRow.startTime)
      const arrivalTime  = parseTime(primaryRow.arrivalTime)
      const endTime      = parseTime(primaryRow.endTime)
      const mealTime     = parseTime(primaryRow.mealTime)
      const mealRequired = primaryRow.mealRequired.trim().toLowerCase() === 'yes'

      // Duplicate check (by date + type + opponent)
      const { data: existing } = await service
        .from('events')
        .select('id, is_home')
        .eq('program_id', programId)
        .eq('event_date', eventDate)
        .eq('event_type', eventType)
        .filter('opponent', 'is', primaryRow.opponent.trim() ? null : null) // handled below

      // Re-query properly: match opponent (null or value)
      const opponentVal = primaryRow.opponent.trim() || null
      const dupQuery = service
        .from('events')
        .select('id, is_home')
        .eq('program_id', programId)
        .eq('event_date', eventDate)
        .eq('event_type', eventType)

      const { data: dupRows } = opponentVal
        ? await dupQuery.eq('opponent', opponentVal)
        : await dupQuery.is('opponent', null)

      const ex = dupRows?.[0] ?? null

      let eventId: string

      if (ex) {
        const { data: slots } = await service
          .from('event_volunteer_slots')
          .select('id, volunteer_assignments(id)')
          .eq('event_id', ex.id)

        const slotCount       = (slots ?? []).length
        const assignmentCount = (slots ?? []).reduce(
          (sum, s) => sum + ((s as any).volunteer_assignments?.length ?? 0), 0
        )

        const shouldPreserve = slotCount > 0 && isHome === true && ex.is_home === true

        if (shouldPreserve) {
          await service.from('events').update({
            opponent:             opponentVal,
            is_home:              isHome,
            location_name:        primaryRow.locationName    || null,
            location_address:     primaryRow.locationAddress || null,
            default_start_time:   startTime                  || null,
            default_arrival_time: arrivalTime                || null,
            default_end_time:     endTime                    || null,
            uniform_notes:        primaryRow.uniformNotes    || null,
            notes:                primaryRow.notes           || null,
            meal_required:        mealRequired,
            meal_time:            mealTime                   || null,
            meal_notes:           primaryRow.mealNotes       || null,
          }).eq('id', ex.id)

          eventId = ex.id
          updated++
          volunteersPreserved += slotCount
        } else {
          if (assignmentCount > 0) {
            const fmt = new Date(eventDate + 'T00:00:00').toLocaleDateString('en-US', {
              weekday: 'short', month: 'short', day: 'numeric',
            })
            warnings.push(
              `${fmt} — Volunteer assignments removed because the event's home/away status changed.`
            )
            volunteersLost += assignmentCount
          }

          if (slotCount > 0) {
            const slotIds = (slots ?? []).map((s: any) => s.id as string)
            await service.from('volunteer_assignments').delete().in('event_volunteer_slot_id', slotIds)
            await service.from('event_volunteer_slots').delete().eq('event_id', ex.id)
          }
          await service.from('event_team_details').delete().eq('event_id', ex.id)
          await service.from('events').delete().eq('id', ex.id)

          const { data: newEvent, error: insertErr } = await service
            .from('events')
            .insert({
              program_id:           programId,
              event_type:           eventType,
              event_date:           eventDate,
              opponent:             opponentVal,
              is_home:              isHome,
              location_name:        primaryRow.locationName    || null,
              location_address:     primaryRow.locationAddress || null,
              default_start_time:   startTime                  || null,
              default_arrival_time: arrivalTime                || null,
              default_end_time:     endTime                    || null,
              uniform_notes:        primaryRow.uniformNotes    || null,
              notes:                primaryRow.notes           || null,
              meal_required:        mealRequired,
              meal_time:            mealTime                   || null,
              meal_notes:           primaryRow.mealNotes       || null,
              status:               'scheduled',
              is_public:            true,
              is_tournament:        eventType === 'tournament',
              created_by_user_id:   user.id,
            })
            .select('id')
            .single()

          if (insertErr || !newEvent) {
            failed++
            errors.push(`Failed to recreate event on ${primaryRow.date}: ${insertErr?.message ?? 'unknown'}`)
            continue
          }

          eventId = newEvent.id
          replaced++
        }
      } else {
        // New event
        const { data: newEvent, error: insertErr } = await service
          .from('events')
          .insert({
            program_id:           programId,
            event_type:           eventType,
            event_date:           eventDate,
            opponent:             opponentVal,
            is_home:              isHome,
            location_name:        primaryRow.locationName    || null,
            location_address:     primaryRow.locationAddress || null,
            default_start_time:   startTime                  || null,
            default_arrival_time: arrivalTime                || null,
            default_end_time:     endTime                    || null,
            uniform_notes:        primaryRow.uniformNotes    || null,
            notes:                primaryRow.notes           || null,
            meal_required:        mealRequired,
            meal_time:            mealTime                   || null,
            meal_notes:           primaryRow.mealNotes       || null,
            status:               'scheduled',
            is_public:            true,
            is_tournament:        eventType === 'tournament',
            created_by_user_id:   user.id,
          })
          .select('id')
          .single()

        if (insertErr || !newEvent) {
          failed++
          errors.push(`Failed to insert event on ${primaryRow.date}: ${insertErr?.message ?? 'unknown error'}`)
          continue
        }

        eventId = newEvent.id
        imported++
      }

      // Upsert event_team_details for every team in this group
      for (const gr of groupRows) {
        const rowStartTime   = parseTime(gr.row.startTime)
        const rowArrivalTime = parseTime(gr.row.arrivalTime)
        const rowEndTime     = parseTime(gr.row.endTime)

        // Use Case 1 (comma-separated): only primary team gets times; others get null
        // Use Case 2 (separate rows): each row has its own times
        // We distinguish by checking if the row is the lead row or a multi-team expansion.
        // The simplest rule: if this teamId appears in multiple groupRows with distinct rows,
        // use that row's times. If it came from a comma-expanded single row, non-primary → null.
        const isCommaExpanded = groupRows.some(
          other => other !== gr && other.row === primaryRow
        )
        const useNullTimes = isCommaExpanded && !gr.isPrimaryTeam

        await service.from('event_team_details').upsert(
          {
            event_id:             eventId,
            team_id:              gr.teamId,
            start_time:           useNullTimes ? null : rowStartTime   || null,
            arrival_time:         useNullTimes ? null : rowArrivalTime || null,
            end_time:             useNullTimes ? null : rowEndTime     || null,
            status:               'scheduled',
            notification_enabled: true,
          },
          { onConflict: 'event_id,team_id' }
        )
      }

    } catch (err: any) {
      failed++
      errors.push(`Unexpected error on group (${key}): ${err?.message ?? String(err)}`)
    }
  }

  return { imported, updated, replaced, volunteersPreserved, volunteersLost, failed, warnings, errors }
}
