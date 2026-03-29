import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import CopyLinkButton from '../CopyLinkButton'
import { formatTeamShortLabel } from '@/lib/utils/team-label'

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
    .select('role, team_id, can_manage_events, can_send_notifications')
    .eq('user_id', user.id)

  const teamUser = teamUsersRaw?.[0]
  const teamIds  = (teamUsersRaw ?? []).map(t => t.team_id)

  // Fetch all teams the coach belongs to — order descending by name so
  // "Varsity" (V) sorts before "JV" (J) in the Public Schedule card.
  const { data: allTeamsData } = await supabase
    .from('teams')
    .select('id, name, level, slug, program_id, team_schedule_token, programs(sport, schools(name))')
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

  // Volunteer slots for next event
  const { data: volunteerSlots } = await supabase
    .from('event_volunteer_slots')
    .select('id, slot_count, volunteer_assignments(id, status)')
    .eq('event_id', nextEvent?.id ?? '00000000-0000-0000-0000-000000000000')

  const totalSlots  = volunteerSlots?.reduce((sum, s) => sum + (s.slot_count || 0), 0) ?? 0
  const filledSlots = volunteerSlots?.reduce((sum, s) => {
    const active = (s.volunteer_assignments as any[])?.filter(
      a => a.status === 'assigned' || a.status === 'confirmed'
    ).length ?? 0
    return sum + active
  }, 0) ?? 0
  const openSlots = totalSlots - filledSlots

  const nextEventTitle = nextEvent
    ? nextEvent.event_type === 'practice'
      ? 'Practice'
      : nextEvent.opponent
        ? `${nextEvent.is_home ? 'vs' : '@'} ${nextEvent.opponent}`
        : nextEvent.title ?? 'Event'
    : null

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
        <h2 className="text-3xl font-bold">{program?.name ?? 'Your Team'}</h2>
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
                {nextEventTitle}
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

        {/* Volunteer Status */}
        <div className="rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-lg">
          <p className="text-sm font-semibold uppercase tracking-wide text-sky-400">
            Volunteer Status
          </p>
          {totalSlots > 0 ? (
            <>
              <h3 className="mt-3 text-xl font-semibold">
                {openSlots === 0
                  ? 'Fully Staffed'
                  : `${openSlots} Open ${openSlots === 1 ? 'Role' : 'Roles'}`}
              </h3>
              <p className="mt-2 text-slate-300">
                {filledSlots} of {totalSlots} slots filled for next event.
              </p>
              <div className="mt-3 h-2 rounded-full bg-slate-700">
                <div
                  className="h-2 rounded-full bg-green-500 transition-all"
                  style={{ width: `${(filledSlots / totalSlots) * 100}%` }}
                />
              </div>
            </>
          ) : (
            <>
              <h3 className="mt-3 text-xl font-semibold text-slate-400">
                No slots set up
              </h3>
              <p className="mt-2 text-slate-500 text-sm">
                Add volunteer roles to your next event.
              </p>
            </>
          )}
        </div>

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