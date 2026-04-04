import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import CopyLinkButton from '../CopyLinkButton'
import { formatTeamShortLabel, formatProgramLabel } from '@/lib/utils/team-label'

export const metadata = { title: 'Dashboard' }

function formatTime(time: string | null): string {
  if (!time) return ''
  const [hourStr, minuteStr] = time.split(':')
  const hour = parseInt(hourStr)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const hour12 = hour % 12 || 12
  return `${hour12}:${minuteStr} ${ampm}`
}

function formatDate(date: string | null): string {
  if (!date) return ''
  const d = new Date(date + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Get all team memberships
  const { data: teamUsersRaw } = await supabase
    .from('team_users')
    .select('role, team_id, can_manage_events, can_send_notifications, can_manage_volunteers')
    .eq('user_id', user.id)

  // New user with no team assignment — send to onboarding
  if (!teamUsersRaw?.length) redirect('/onboarding')

  const teamUser = teamUsersRaw[0]
  const teamIds  = teamUsersRaw.map(t => t.team_id)

  // Fetch all teams the coach belongs to — order descending by name so
  // "Varsity" (V) sorts before "JV" (J) in the Public Schedule card.
  const { data: allTeamsData } = await supabase
    .from('teams')
    .select('id, name, level, slug, program_id, team_schedule_token, primary_color, programs(sport, schools(name))')
    .in('id', teamIds)
    .order('name', { ascending: false })

  // First team used for dashboard header context
  const team = allTeamsData?.[0]

  const { data: program } = await supabase
    .from('programs')
    .select('id, name, sport')
    .eq('id', team?.program_id ?? '')
    .single()

  // Next upcoming event
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })

  const { data: nextEventRows } = await supabase
    .from('events')
    .select(`
      id, title, event_type, opponent, is_home,
      location_name, event_date, default_start_time,
      default_arrival_time, status, meal_required, meal_time,
      event_team_details!inner(team_id, start_time, arrival_time)
    `)
    .in('event_team_details.team_id', teamIds)
    .gte('event_date', today)
    .eq('status', 'scheduled')
    .order('event_date', { ascending: true })
    .limit(1)

  const nextEventRow = nextEventRows?.[0] as any
  const nextEvent = nextEventRow ?? null
  const nextEventStart   = nextEventRow?.event_team_details?.[0]?.start_time   || nextEventRow?.default_start_time
  const nextEventArrival = nextEventRow?.event_team_details?.[0]?.arrival_time || nextEventRow?.default_arrival_time

  // This week count
  const nextWeekStr = new Date(new Date().getTime() + 7 * 86400000)
    .toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })

  const { data: upcomingEvents } = await supabase
    .from('events')
    .select('id, event_team_details!inner(team_id)')
    .in('event_team_details.team_id', teamIds)
    .gte('event_date', today)
    .lte('event_date', nextWeekStr)
    .neq('status', 'cancelled')

  const upcomingCount = upcomingEvents?.length ?? 0

  // ── Volunteer card data ────────────────────────────────────────────────────
  const canSeeVolunteers = (teamUsersRaw ?? []).some(
    t => (t as any).can_manage_volunteers || t.role === 'admin' || t.role === 'volunteer_admin'
  )

  const primaryColor = (allTeamsData?.[0] as any)?.primary_color ?? '#0ea5e9'

  type VolSlot = {
    id: string; role_name: string; slot_count: number
    start_time: string | null; end_time: string | null; filled: number
  }
  type VolCard = {
    event: { id: string; event_date: string; event_type: string; opponent: string | null; title: string | null; start_time: string | null }
    slots: VolSlot[]; totalSlots: number; filledSlots: number
  }
  let volunteerCard: VolCard | null = null

  if (canSeeVolunteers && teamIds.length > 0) {
    // Find upcoming home events for this user's teams
    const { data: homeEventRows } = await supabase
      .from('events')
      .select(`
        id, event_date, event_type, opponent, title, is_home,
        event_team_details!inner(team_id, start_time)
      `)
      .in('event_team_details.team_id', teamIds)
      .eq('is_home', true)
      .gte('event_date', today)
      .eq('status', 'scheduled')
      .order('event_date', { ascending: true })
      .limit(20)

    const homeEventIds = (homeEventRows ?? []).map(e => e.id)

    if (homeEventIds.length > 0) {
      // Find which events have volunteer slots
      const { data: slotEventRows } = await supabase
        .from('event_volunteer_slots')
        .select('event_id')
        .in('event_id', homeEventIds)

      const eventIdWithSlots = homeEventIds.find(id =>
        (slotEventRows ?? []).some(s => s.event_id === id)
      )

      if (eventIdWithSlots) {
        const eventRow = (homeEventRows ?? []).find(e => e.id === eventIdWithSlots) as any
        const startTime = (eventRow?.event_team_details as any[])?.[0]?.start_time ?? null

        const { data: slotRows } = await supabase
          .from('event_volunteer_slots')
          .select(`
            id, slot_count, start_time, end_time,
            volunteer_roles(name),
            volunteer_assignments(id, status)
          `)
          .eq('event_id', eventIdWithSlots)
          .order('created_at', { ascending: true })

        const slots: VolSlot[] = (slotRows ?? []).map(s => ({
          id:         s.id,
          role_name:  (s.volunteer_roles as any)?.name ?? 'Volunteer',
          slot_count: s.slot_count,
          start_time: s.start_time ?? null,
          end_time:   s.end_time   ?? null,
          filled:     ((s.volunteer_assignments as any[]) ?? [])
            .filter(a => a.status !== 'cancelled').length,
        }))

        const totalSlots  = slots.reduce((sum, s) => sum + s.slot_count, 0)
        const filledSlots = slots.reduce((sum, s) => sum + Math.min(s.filled, s.slot_count), 0)

        volunteerCard = {
          event: {
            id:         eventRow.id,
            event_date: eventRow.event_date,
            event_type: eventRow.event_type,
            opponent:   eventRow.opponent ?? null,
            title:      eventRow.title    ?? null,
            start_time: startTime,
          },
          slots,
          totalSlots,
          filledSlots,
        }
      }
    }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://sidelineopshq.com'

  // Build public + team schedule URLs for every team
  const teamLinks = (allTeamsData ?? [])
    .filter(t => t.slug)
    .map(t => ({
      id:        t.id,
      name:      formatTeamShortLabel((t as any).level ?? ''),
      slug:      t.slug as string,
      publicUrl: `${appUrl}/schedule/${t.slug}`,
      teamUrl:   (t as any).team_schedule_token
        ? `${appUrl}/schedule/${t.slug}/team/${(t as any).team_schedule_token}`
        : null,
    }))

  return (
    <section className="mx-auto max-w-7xl px-6 py-10">

      {/* Team Header */}
      <div className="mb-8 rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-lg">
        <p className="mb-1 text-sm font-semibold uppercase tracking-wide text-sky-400">
          {program?.sport ?? 'Program'}
        </p>
        <h2 className="text-3xl font-bold">
          {formatProgramLabel(
            (team as any)?.programs?.schools?.name ?? '',
            (team as any)?.programs?.sport ?? program?.sport ?? '',
          ) || program?.name || 'Your Team'}
        </h2>
        {team?.name && (
          <p className="mt-1 text-slate-400 text-sm">
            {formatTeamShortLabel((team as any).level ?? '')} · {teamUser?.role?.replace('_', ' ')}
          </p>
        )}
      </div>

      {/* Dashboard Cards */}
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">

        {/* Next Event */}
        <div className="rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-lg">
          <p className="text-sm font-semibold uppercase tracking-wide text-sky-400">
            Next Event
          </p>
          {nextEvent ? (
            <>
              <h3 className="mt-3 text-xl font-semibold leading-tight">
                {nextEvent.event_type === 'practice'
                  ? 'Practice'
                  : nextEvent.opponent
                    ? `${nextEvent.is_home ? 'vs' : '@'} ${nextEvent.opponent}`
                    : nextEvent.title ?? 'Event'}
              </h3>
              <p className="mt-2 text-slate-300">
                {formatDate(nextEvent.event_date)}
                {nextEventStart && ` • ${formatTime(nextEventStart)}`}
              </p>
              {nextEventArrival && (
                <p className="text-slate-400 text-sm">
                  Arrival: {formatTime(nextEventArrival)}
                </p>
              )}
              {nextEvent.location_name && (
                <p className="text-slate-400 text-sm mt-1">
                  {nextEvent.location_name}
                </p>
              )}
              {nextEvent.meal_required && (
                <p className="mt-2 text-xs text-amber-400 font-medium">
                  🍽 Meal included{nextEvent.meal_time ? ` · ${formatTime(nextEvent.meal_time)}` : ''}
                </p>
              )}
              <a
                href={`/events/${nextEvent.id}/edit`}
                className="mt-4 block w-full rounded-lg border border-white/10 hover:bg-slate-800 px-4 py-2 text-xs font-semibold text-center transition-colors"
              >
                Edit Event
              </a>
            </>
          ) : (
            <>
              <h3 className="mt-3 text-xl font-semibold text-slate-400">
                No upcoming events
              </h3>
              <p className="mt-2 text-slate-500 text-sm">
                Add events to your schedule to see them here.
              </p>
            </>
          )}
        </div>

        {/* Quick Actions */}
        <div className="rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-lg">
          <p className="text-sm font-semibold uppercase tracking-wide text-sky-400">
            Quick Actions
          </p>
          <a
            href="/events/new"
            className="mt-4 block w-full rounded-lg bg-sky-600 hover:bg-sky-500 px-4 py-2 text-sm font-semibold text-center transition-colors"
          >
            + New Event
          </a>
          <a
            href="/messages"
            className="mt-3 block w-full rounded-lg border border-white/10 hover:bg-slate-800 px-4 py-2 text-sm font-semibold text-center transition-colors"
          >
            Send Team Message
          </a>
          <a
            href="/schedule"
            className="mt-3 block w-full rounded-lg border border-white/10 hover:bg-slate-800 px-4 py-2 text-sm font-semibold text-center transition-colors"
          >
            View Schedule
          </a>
        </div>

        {/* Volunteers */}
        {canSeeVolunteers && (
          <div className="rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-lg flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <a
                href="/volunteers"
                className="text-sm font-semibold uppercase tracking-wide text-sky-400 hover:text-sky-300 transition-colors"
              >
                Volunteers
              </a>
            </div>

            {volunteerCard ? (() => {
              const { event, slots, totalSlots, filledSlots } = volunteerCard
              const allFilled = filledSlots >= totalSlots
              const eventTitle = event.event_type === 'practice'
                ? 'Practice'
                : event.opponent
                  ? `vs ${event.opponent}`
                  : event.title ?? 'Event'
              const visibleSlots = slots.slice(0, 4)
              const hiddenCount  = slots.length - visibleSlots.length

              return (
                <>
                  {/* Event info */}
                  <div className="mb-3">
                    <p className="text-base font-bold text-white leading-tight">{eventTitle}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {formatDate(event.event_date)}
                      {event.start_time && ` · ${formatTime(event.start_time)}`}
                    </p>
                  </div>

                  {/* Fill summary */}
                  {allFilled ? (
                    <p className="text-sm font-semibold text-green-400 mb-3">
                      ✓ All volunteers confirmed for next game
                    </p>
                  ) : (
                    <p className="text-sm text-slate-300 mb-2">
                      {filledSlots} of {totalSlots} volunteers confirmed
                    </p>
                  )}

                  {/* Progress bar */}
                  <div className="h-1.5 rounded-full bg-slate-700 mb-4">
                    <div
                      className="h-1.5 rounded-full transition-all"
                      style={{
                        width: `${totalSlots > 0 ? (filledSlots / totalSlots) * 100 : 0}%`,
                        backgroundColor: allFilled ? '#22c55e' : primaryColor,
                      }}
                    />
                  </div>

                  {/* Per-slot breakdown */}
                  <div className="space-y-1.5 flex-1">
                    {visibleSlots.map(slot => {
                      const open      = Math.max(0, slot.slot_count - slot.filled)
                      const slotFull  = open === 0
                      const timeLabel = slot.start_time
                        ? slot.end_time
                          ? ` (${formatTime(slot.start_time)}–${formatTime(slot.end_time)})`
                          : ` (${formatTime(slot.start_time)})`
                        : ''
                      return (
                        <div key={slot.id} className="flex items-center justify-between gap-2">
                          <p className="text-xs text-slate-300 truncate min-w-0">
                            {slot.role_name}{timeLabel}
                          </p>
                          <p className={`text-xs font-semibold shrink-0 ${slotFull ? 'text-green-400' : 'text-slate-400'}`}>
                            {slotFull
                              ? `${slot.slot_count} of ${slot.slot_count} ✓`
                              : `${slot.filled} of ${slot.slot_count}`
                            }
                          </p>
                        </div>
                      )
                    })}
                    {hiddenCount > 0 && (
                      <p className="text-xs text-slate-500">+ {hiddenCount} more slot{hiddenCount !== 1 ? 's' : ''}</p>
                    )}
                  </div>

                  <a
                    href="/volunteers"
                    className="mt-4 block w-full rounded-lg border border-white/10 hover:bg-slate-800 px-4 py-2 text-xs font-semibold text-center transition-colors"
                  >
                    View All →
                  </a>
                </>
              )
            })() : (
              <>
                <p className="text-slate-400 text-sm flex-1">
                  No volunteer slots set up for upcoming games.
                </p>
                <a
                  href="/volunteers"
                  className="mt-4 block w-full rounded-lg border border-white/10 hover:bg-slate-800 px-4 py-2 text-xs font-semibold text-center transition-colors"
                >
                  Set up volunteer slots →
                </a>
              </>
            )}
          </div>
        )}

        {/* Public Schedule */}
        <div className="rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-lg">
          <p className="text-sm font-semibold uppercase tracking-wide text-sky-400">
            Public Schedule
          </p>
          <p className="mt-3 text-sm text-slate-300">
            Share your schedule with parents, fans, and your team.
          </p>

          {teamLinks.map(t => (
            <div key={t.id}>
              {/* Team label — only shown when coach has multiple teams */}
              {teamLinks.length > 1 && (
                <p className="mt-4 text-xs text-slate-500 font-semibold uppercase tracking-wide">
                  {t.name}
                </p>
              )}

              {/* Public page */}
              <div className={`space-y-2 ${teamLinks.length > 1 ? 'mt-2' : 'mt-4'}`}>
                {teamLinks.length === 1 && (
                  <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide">
                    Public Page (Games Only)
                  </p>
                )}
                <a
                  href={`/schedule/${t.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full rounded-lg border border-white/10 hover:bg-slate-800 px-4 py-2 text-xs font-semibold text-center text-slate-300 transition-colors"
                >
                  View Public Page ↗
                </a>
                <CopyLinkButton url={t.publicUrl} label={teamLinks.length > 1 ? `${t.name} Public` : 'Public'} />
              </div>

              {/* Team page */}
              {t.teamUrl && (
                <div className="mt-3 space-y-2">
                  {teamLinks.length === 1 && (
                    <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide">
                      Team Page (Players & Parents)
                    </p>
                  )}
                  <a
                    href={t.teamUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full rounded-lg border border-sky-500/20 bg-sky-500/10 hover:bg-sky-500/20 px-4 py-2 text-xs font-semibold text-center text-sky-300 transition-colors"
                  >
                    View Team Page ↗
                  </a>
                  <CopyLinkButton url={t.teamUrl} label={teamLinks.length > 1 ? `${t.name} Team` : 'Team'} />
                </div>
              )}
            </div>
          ))}
        </div>

      </div>

      {/* This Week */}
      <div className="mt-8 rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-lg">
        <p className="text-sm font-semibold uppercase tracking-wide text-sky-400">
          This Week
        </p>
        {upcomingCount > 0 ? (
          <p className="mt-3 text-slate-300">
            You have{' '}
            <span className="text-white font-semibold">{upcomingCount}</span>{' '}
            event{upcomingCount !== 1 ? 's' : ''} in the next 7 days.
          </p>
        ) : (
          <p className="mt-3 text-slate-400">
            No events scheduled in the next 7 days.
          </p>
        )}
        <a
          href="/schedule"
          className="mt-4 inline-block rounded-lg bg-slate-800 hover:bg-slate-700 px-4 py-2 text-sm font-semibold transition-colors"
        >
          View Full Schedule →
        </a>
      </div>

    </section>
  )
}