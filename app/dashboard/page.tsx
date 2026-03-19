import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

// Helper to format time from HH:MM:SS to 12-hour
function formatTime(time: string | null): string {
  if (!time) return ''
  const [hourStr, minuteStr] = time.split(':')
  const hour = parseInt(hourStr)
  const minute = minuteStr
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const hour12 = hour % 12 || 12
  return `${hour12}:${minute} ${ampm}`
}

// Helper to format date from YYYY-MM-DD to "Apr 1"
function formatDate(date: string | null): string {
  if (!date) return ''
  const d = new Date(date + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default async function Home() {
  const supabase = await createClient()

  // Auth check
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Get the user's team membership
  const { data: teamUser } = await supabase
    .from('team_users')
    .select(`
      role,
      team:teams (
        id,
        name,
        level,
        slug,
        program:programs (
          id,
          name,
          sport,
          school:schools (
            name
          )
        )
      )
    `)
    .eq('user_id', user.id)
    .single()

  const team = teamUser?.team as any
  const program = team?.program as any
  const school = program?.school as any

  // Get next upcoming event for this team
  const today = new Date().toISOString().split('T')[0]

  const { data: nextEventData } = await supabase
    .from('event_team_details')
    .select(`
      start_time,
      arrival_time,
      event:events (
        id,
        title,
        event_type,
        opponent,
        is_home,
        location_name,
        event_date,
        default_start_time,
        default_arrival_time,
        status,
        meal_required,
        meal_time
      )
    `)
    .eq('team_id', team?.id)
    .gte('event.event_date', today)
    .eq('event.status', 'scheduled')
    .order('event_date', { referencedTable: 'events', ascending: true })
    .limit(1)
    .single()

  const nextEvent = nextEventData?.event as any
  const nextEventStart = nextEventData?.start_time || nextEvent?.default_start_time
  const nextEventArrival = nextEventData?.arrival_time || nextEvent?.default_arrival_time

  // Get upcoming events count (next 7 days)
  const nextWeek = new Date()
  nextWeek.setDate(nextWeek.getDate() + 7)
  const nextWeekStr = nextWeek.toISOString().split('T')[0]

  const { count: upcomingCount } = await supabase
    .from('event_team_details')
    .select('id', { count: 'exact', head: true })
    .eq('team_id', team?.id)
    .gte('event.event_date', today)
    .lte('event.event_date', nextWeekStr)

  // Get volunteer slot status for next event
  const { data: volunteerSlots } = await supabase
    .from('event_volunteer_slots')
    .select(`
      id,
      slot_count,
      volunteer_assignments (id, status)
    `)
    .eq('event_id', nextEvent?.id || '00000000-0000-0000-0000-000000000000')

  const totalSlots = volunteerSlots?.reduce((sum, s) => sum + (s.slot_count || 0), 0) ?? 0
  const filledSlots = volunteerSlots?.reduce((sum, s) => {
    const active = (s.volunteer_assignments as any[])?.filter(
      a => a.status === 'assigned' || a.status === 'confirmed'
    ).length ?? 0
    return sum + active
  }, 0) ?? 0
  const openSlots = totalSlots - filledSlots

  // Build display values
  const teamDisplayName = program?.name ?? 'Your Team'
  const schoolDisplayName = school?.name ?? ''

  const nextEventTitle = nextEvent
    ? nextEvent.event_type === 'practice'
      ? 'Practice'
      : nextEvent.opponent
        ? `${nextEvent.is_home ? 'vs' : '@'} ${nextEvent.opponent}`
        : nextEvent.title ?? 'Event'
    : null

  return (
    <main className="min-h-screen bg-slate-950 text-white">

      {/* Top Nav */}
      <div className="border-b border-white/10 bg-slate-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">

            <div className="flex items-center gap-3">
            <img
                src="/sidelineops-logo-cropped.png"
                alt="SidelineOps"
                style={{ height: '60px', width: 'auto' }}
            />
            
            </div>

            <nav className="hidden gap-6 text-sm text-slate-300 md:flex">
            <span className="text-white font-medium">Dashboard</span>
            <span className="cursor-pointer hover:text-white transition-colors">Schedule</span>
            <span className="cursor-pointer hover:text-white transition-colors">Volunteers</span>
            <span className="cursor-pointer hover:text-white transition-colors">Messages</span>
            <span className="cursor-pointer hover:text-white transition-colors">Contacts</span>
            </nav>

        </div>
        </div>

      

      <section className="mx-auto max-w-7xl px-6 py-10">

        {/* Team Header */}
        <div className="mb-8 rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-lg">
          <p className="mb-1 text-sm font-semibold uppercase tracking-wide text-sky-400">
            {program?.sport ?? 'Program'}
          </p>
          <h2 className="text-3xl font-bold">{teamDisplayName}</h2>
          {team?.name && (
            <p className="mt-1 text-slate-400 text-sm">
              {team.name} · {teamUser?.role?.replace('_', ' ')}
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

          {/* Quick Action */}
          <div className="rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-lg">
            <p className="text-sm font-semibold uppercase tracking-wide text-sky-400">
              Quick Actions
            </p>
            <button className="mt-4 w-full rounded-lg bg-sky-600 hover:bg-sky-500 px-4 py-2 text-sm font-semibold transition-colors">
              <a href="/events/new">
                Create New Event
              </a>
            </button>
            <button className="mt-4 w-full rounded-lg bg-sky-600 hover:bg-sky-500 px-4 py-2 text-sm font-semibold transition-colors">
              <a href="">
                Send Team Message
              </a>
            </button>
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
            <h3 className="mt-3 text-xl font-semibold">Team Page</h3>
            <p className="mt-2 text-slate-300">
              Share your public schedule with parents and fans.
            </p>
            {team?.slug && (
              <p className="mt-3 text-xs text-slate-500 font-mono break-all">
                /schedule/{team.slug}
              </p>
            )}
            <button className="mt-4 w-full rounded-lg border border-white/10 hover:bg-slate-800 px-4 py-2 text-sm font-semibold transition-colors">
              View Page
            </button>
          </div>

        </div>

        {/* This Week */}
        <div className="mt-8 rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-lg">
          <p className="text-sm font-semibold uppercase tracking-wide text-sky-400">
            This Week
          </p>
          {upcomingCount && upcomingCount > 0 ? (
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
          <button className="mt-4 rounded-lg bg-slate-800 hover:bg-slate-700 px-4 py-2 text-sm font-semibold transition-colors">
            View Full Schedule →
          </button>
        </div>

      </section>
    </main>
  )
}