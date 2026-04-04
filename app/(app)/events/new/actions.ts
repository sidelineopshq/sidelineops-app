'use server'

import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { sendNewEventAlert, sendMealCoordinatorNotification } from '@/lib/notifications/channel-router'
import { formatTeamShortLabel, formatProgramLabel } from '@/lib/utils/team-label'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function createEvent(formData: {
  event_type: string
  event_date: string
  opponent?: string
  is_home?: boolean
  location_name?: string
  location_address?: string
  status: string
  notes?: string
  uniform_notes?: string
  is_tournament: boolean
  meal_required: boolean
  meal_notes?: string
  meal_time?: string
  is_public: boolean
  title?: string
  team_assignments: {
    team_id: string
    start_time?: string
    arrival_time?: string
    end_time?: string
  }[]
  volunteer_slots?: {
    volunteer_role_id: string
    slot_count:        number
    start_time?:       string
    end_time?:         string
    notes?:            string
  }[]
}) {
  // Step 1: Auth check
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/login')

  if (!formData.team_assignments?.length) {
    return { error: 'At least one team must be selected.' }
  }

  // Step 2: Verify user has can_manage_events for all selected teams
  const selectedTeamIds = formData.team_assignments.map(a => a.team_id)

  const { data: teamUsers } = await authClient
    .from('team_users')
    .select('team_id, can_manage_events')
    .eq('user_id', user.id)
    .in('team_id', selectedTeamIds)

  const authorizedTeamIds = (teamUsers ?? [])
    .filter(t => t.can_manage_events)
    .map(t => t.team_id)

  const unauthorized = selectedTeamIds.filter(id => !authorizedTeamIds.includes(id))
  if (unauthorized.length > 0) {
    return { error: 'You do not have permission to create events for one or more selected teams.' }
  }

  // Step 3: Look up program_id from the first team
  const { data: teamData } = await authClient
    .from('teams')
    .select('program_id')
    .eq('id', selectedTeamIds[0])
    .single()

  if (!teamData?.program_id) {
    return { error: 'Could not determine program. Please contact support.' }
  }

  // Auto-populate home location from program defaults if coach left location blank
  if (formData.is_home && !formData.location_name) {
    const { data: programDefaults } = await authClient
      .from('programs')
      .select('home_location_name, home_location_address')
      .eq('id', teamData.program_id)
      .single()
    if (programDefaults?.home_location_name) {
      formData.location_name    = programDefaults.home_location_name
      formData.location_address = programDefaults.home_location_address ?? undefined
    }
  }

  // Build title for non-game types
  let title = formData.title || null
  if (formData.event_type === 'practice')                  title = 'Practice'
  if (formData.event_type === 'meeting')                   title = 'Team Meeting'
  if (formData.event_type === 'tournament' && !title)      title = 'Tournament'

  // Step 4: Write event with service role
  const supabase = createServiceClient()

  // Use first team's times as the event-level defaults (fallback for public/external views)
  const firstAssignment = formData.team_assignments[0]

  const { data: event, error: eventError } = await supabase
    .from('events')
    .insert({
      program_id:           teamData.program_id,
      event_type:           formData.event_type,
      title,
      opponent:             formData.opponent || null,
      is_home:              formData.is_home ?? null,
      location_name:        formData.location_name || null,
      location_address:     formData.location_address || null,
      event_date:           formData.event_date,
      default_start_time:   firstAssignment.start_time   || null,
      default_arrival_time: firstAssignment.arrival_time || null,
      default_end_time:     firstAssignment.end_time     || null,
      status:               formData.status,
      notes:                formData.notes || null,
      uniform_notes:        formData.uniform_notes || null,
      is_tournament:        formData.is_tournament,
      meal_required:        formData.meal_required,
      meal_notes:           formData.meal_notes || null,
      meal_time:            formData.meal_time || null,
      is_public:            formData.is_public,
      created_by_user_id:   user.id,
    })
    .select('id')
    .single()

  if (eventError || !event) {
    console.error('Event insert error:', eventError)
    return { error: 'Failed to save event. Please try again.' }
  }

  // Step 5: Link event to each selected team with per-team times
  const detailRows = formData.team_assignments.map(a => ({
    event_id:             event.id,
    team_id:              a.team_id,
    start_time:           a.start_time   || null,
    arrival_time:         a.arrival_time || null,
    end_time:             a.end_time     || null,
    notification_enabled: true,
  }))

  const { error: detailsError } = await supabase
    .from('event_team_details')
    .insert(detailRows)

  if (detailsError) {
    console.error('Event team details error:', detailsError)
  }

  // ── Step 6: Insert volunteer slots (home events only) ────────────────────
  let insertedSlots: { id: string; volunteer_role_id: string; slot_count: number }[] = []

  if (formData.is_home && formData.volunteer_slots?.length) {
    const slotRows = formData.volunteer_slots.map(s => ({
      event_id:          event.id,
      volunteer_role_id: s.volunteer_role_id,
      slot_count:        s.slot_count,
      start_time:        s.start_time || null,
      end_time:          s.end_time   || null,
      notes:             s.notes      || null,
    }))
    const { data: insertedSlotData, error: slotsError } = await supabase
      .from('event_volunteer_slots')
      .insert(slotRows)
      .select('id, volunteer_role_id, slot_count')
    if (slotsError) {
      console.error('[createEvent] volunteer slots error:', slotsError)
    } else {
      insertedSlots = insertedSlotData ?? []
    }
  }

  // ── Step 6b: Auto-apply standing assignments ──────────────────────────────
  if (formData.is_home && insertedSlots.length > 0) {
    const { data: standingRaw } = await supabase
      .from('volunteer_standing_assignments')
      .select(`
        id, volunteer_role_id, contact_id, volunteer_name, volunteer_email,
        contacts(first_name, last_name, email)
      `)
      .eq('program_id', teamData.program_id)
      .eq('is_active', true)

    for (const standing of standingRaw ?? []) {
      const matchingSlot = insertedSlots.find(s => s.volunteer_role_id === (standing as any).volunteer_role_id)
      if (!matchingSlot) continue

      // Check current fill (should be 0 for a new event, but be safe)
      const { count } = await supabase
        .from('volunteer_assignments')
        .select('id', { count: 'exact', head: true })
        .eq('event_volunteer_slot_id', matchingSlot.id)
        .neq('status', 'cancelled')

      if ((count ?? 0) >= matchingSlot.slot_count) continue

      const contact        = (standing as any).contacts as any
      const volunteerName  = standing.volunteer_name
        ?? (contact ? `${contact.first_name} ${contact.last_name ?? ''}`.trim() : null)
      const volunteerEmail = standing.volunteer_email ?? contact?.email ?? null

      if (!volunteerName) continue

      const { error: assignError } = await supabase
        .from('volunteer_assignments')
        .insert({
          event_volunteer_slot_id: matchingSlot.id,
          contact_id:              standing.contact_id ?? null,
          volunteer_name:          volunteerName,
          volunteer_email:         volunteerEmail,
          status:                  'assigned',
          signup_source:           'standing',
        })

      if (assignError) {
        console.error('[createEvent] standing assignment error:', assignError)
      }
    }
  }

  // ── Step 7: Fire new-event notifications (non-blocking) ──────────────────
  void (async () => {
    try {
      // Date check — skip all fetches if event is not today or tomorrow (Central time)
      const _now             = new Date()
      const _centralToday    = _now.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
      const _centralTomorrow = new Date(_now.getTime() + 86400000)
        .toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
      const isUrgent = formData.event_date === _centralToday || formData.event_date === _centralTomorrow
      if (!isUrgent) return

      // Fetch program (shared) + all team records + all contacts in parallel
      const [{ data: program }, { data: teamRecords }, { data: allContacts }] = await Promise.all([
        supabase
          .from('programs')
          .select('name')
          .eq('id', teamData.program_id)
          .single(),
        supabase
          .from('teams')
          .select('id, name, level, slug, notify_on_change, groupme_enabled, groupme_bot_id, programs(sport, schools(name))')
          .in('id', selectedTeamIds),
        supabase
          .from('contacts')
          .select('id, first_name, email, email_unsubscribed, team_id')
          .in('team_id', selectedTeamIds)
          .is('deleted_at', null)
          .not('email', 'is', null),
      ])

      if (!teamRecords?.length) return

      // Derive program label from first team's nested join (all teams share a program)
      const notifSchoolName    = (teamRecords[0] as any)?.programs?.schools?.name ?? ''
      const notifSport         = (teamRecords[0] as any)?.programs?.sport ?? ''
      const notifProgramLabel  = formatProgramLabel(notifSchoolName, notifSport) || program?.name || ''

      // Build the full assigned-teams list (all teams, shown in every notification)
      const assignedTeams = teamRecords.map(tr => {
        const assignment = formData.team_assignments.find(a => a.team_id === tr.id)
        return {
          name:       formatTeamShortLabel(tr.level ?? ''),
          level:      tr.level ?? null,
          start_time: assignment?.start_time || null,
        }
      })

      // Fire once per team — each team gets its own contacts + channel config
      for (const tr of teamRecords) {
        const teamContacts = (allContacts ?? []).filter(c => c.team_id === tr.id)
        await sendNewEventAlert({
          team: {
            id:               tr.id,
            name:             formatTeamShortLabel(tr.level ?? ''),
            level:            tr.level ?? null,
            slug:             tr.slug ?? null,
            notify_on_change: tr.notify_on_change,
            groupme_enabled:  tr.groupme_enabled,
            groupme_bot_id:   tr.groupme_bot_id,
          },
          programName: notifProgramLabel,
          event: {
            title:           title,
            event_type:      formData.event_type,
            event_date:      formData.event_date,
            opponent:        formData.opponent || null,
            is_home:         formData.is_home ?? null,
            location_name:   formData.location_name || null,
            is_tournament:   formData.is_tournament,
            parent_event_id: null,
          },
          assignedTeams,
          contacts: teamContacts.map(c => ({
            id:                 c.id,
            first_name:         c.first_name,
            email:              c.email,
            email_unsubscribed: c.email_unsubscribed,
          })),
        })
      }
      // Fire meal coordinator notification if meal is required (non-blocking)
      if (formData.meal_required) {
        try {
          await sendMealCoordinatorNotification({
            programId:   teamData.program_id,
            programName: notifProgramLabel,
            event: {
              title:         title ?? 'Event',
              event_date:    formData.event_date,
              start_time:    firstAssignment.start_time || null,
              meal_time:     formData.meal_time  || null,
              meal_notes:    formData.meal_notes || null,
              meal_required: true,
            },
            changes:     [],
            triggerType: 'new_event_with_meal',
          })
        } catch (err) {
          console.error('[createEvent] meal coordinator notification failed:', err)
        }
      }
    } catch (err) {
      console.error('[createEvent] notification fire failed:', err)
    }
  })()

  redirect('/schedule')
}
