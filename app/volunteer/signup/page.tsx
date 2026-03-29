import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import SignupForm from './SignupForm'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })
}

function formatTime(time: string | null): string {
  if (!time) return ''
  const [hourStr, minuteStr] = time.split(':')
  const hour = parseInt(hourStr)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const hour12 = hour % 12 || 12
  return `${hour12}:${minuteStr} ${ampm}`
}

export default async function VolunteerSignupPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams
  if (!token) notFound()

  const svc = serviceClient()

  const { data: slot } = await svc
    .from('event_volunteer_slots')
    .select(`
      id, slot_count, start_time, end_time, notes,
      volunteer_roles(name),
      events(
        id, event_type, title, opponent, is_home, event_date,
        location_name, default_start_time,
        programs(name)
      ),
      volunteer_assignments(id, status)
    `)
    .eq('signup_token', token)
    .single()

  if (!slot) notFound()

  const event     = slot.events as any
  const program   = event?.programs as any
  const roleName  = (slot.volunteer_roles as any)?.name ?? 'Volunteer'
  const filled    = (slot.volunteer_assignments as any[]).filter(a => a.status !== 'cancelled').length
  const isFull    = filled >= slot.slot_count

  function eventLabel() {
    if (event.event_type === 'practice')   return 'Practice'
    if (event.event_type === 'meeting')    return 'Team Meeting'
    if (event.event_type === 'tournament') return event.title ?? 'Tournament'
    if (event.opponent) return `${event.is_home ? 'vs' : '@'} ${event.opponent}`
    return event.title ?? 'Event'
  }

  const startTime = slot.start_time ?? event.default_start_time

  return (
    <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">

        {/* Header */}
        <div className="text-center mb-8">
          <p className="text-sm text-sky-400 font-semibold mb-1">{program?.name}</p>
          <h1 className="text-2xl font-bold">Volunteer Sign-up</h1>
        </div>

        {/* Event details card */}
        <div className="rounded-2xl border border-white/10 bg-slate-900 p-5 mb-6">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Role</span>
              <span className="text-white font-semibold">{roleName}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Event</span>
              <span className="text-white font-semibold">{eventLabel()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Date</span>
              <span className="text-white font-semibold">{formatDate(event.event_date)}</span>
            </div>
            {startTime && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Time</span>
                <span className="text-white font-semibold">
                  {formatTime(startTime)}
                  {slot.end_time && ` – ${formatTime(slot.end_time)}`}
                </span>
              </div>
            )}
            {event.location_name && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Location</span>
                <span className="text-white font-semibold">{event.location_name}</span>
              </div>
            )}
            {slot.notes && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Notes</span>
                <span className="text-white font-semibold">{slot.notes}</span>
              </div>
            )}
            <div className="flex justify-between text-sm pt-1 border-t border-white/5 mt-1">
              <span className="text-slate-400">Spots remaining</span>
              <span className={`font-semibold ${isFull ? 'text-red-400' : 'text-green-400'}`}>
                {isFull ? 'Full' : `${slot.slot_count - filled} of ${slot.slot_count}`}
              </span>
            </div>
          </div>
        </div>

        {isFull ? (
          <div className="rounded-2xl border border-white/10 bg-slate-900 p-6 text-center">
            <p className="text-slate-400 text-sm">This volunteer slot is currently full.</p>
            <p className="text-slate-500 text-xs mt-1">Contact the coaching staff if you'd like to help.</p>
          </div>
        ) : (
          <SignupForm token={token} />
        )}

        <p className="text-center text-xs text-slate-600 mt-6">Powered by SidelineOps</p>
      </div>
    </main>
  )
}
