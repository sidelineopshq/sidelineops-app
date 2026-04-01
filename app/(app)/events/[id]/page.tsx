import { createClient } from '@/lib/supabase/server'
import { createClient as createSvcClient } from '@supabase/supabase-js'
import { redirect, notFound } from 'next/navigation'
import EventVolunteersClient from './EventVolunteersClient'

function serviceClient() {
  return createSvcClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: teamUsersRaw } = await supabase
    .from('team_users')
    .select('team_id, can_manage_events')
    .eq('user_id', user.id)

  const canManage = teamUsersRaw?.some(t => t.can_manage_events) ?? false
  if (!canManage) redirect('/schedule')

  const teamIds = (teamUsersRaw ?? []).map(t => t.team_id)

  // Verify coach has access to this event
  const { data: event } = await supabase
    .from('events')
    .select(`
      id, event_type, title, opponent, is_home, is_tournament,
      location_name, event_date, default_start_time, status, program_id,
      event_team_details!inner(team_id, start_time)
    `)
    .eq('id', id)
    .in('event_team_details.team_id', teamIds)
    .single()

  if (!event) notFound()

  const svc = serviceClient()

  // Fetch slug for the "Share Volunteer Signup Page" button
  const eventTeamIds = ((event as any).event_team_details ?? []).map((d: any) => d.team_id)
  const { data: teamWithSlug } = await supabase
    .from('teams')
    .select('slug')
    .in('id', eventTeamIds)
    .not('slug', 'is', null)
    .limit(1)
    .maybeSingle()

  // Fetch slots with role name and assignments
  const { data: slotsRaw } = await svc
    .from('event_volunteer_slots')
    .select(`
      id, slot_count, start_time, end_time, notes,
      volunteer_roles(id, name),
      volunteer_assignments(
        id, volunteer_name, volunteer_email, signup_source, status, contact_id
      )
    `)
    .eq('event_id', id)
    .order('created_at', { ascending: true })

  // Fetch contacts for the program (for the assign modal search)
  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, first_name, last_name, email, contact_type')
    .in('team_id', teamIds)
    .is('deleted_at', null)
    .order('last_name', { ascending: true })
    .order('first_name', { ascending: true })

  const { data: program } = await supabase
    .from('programs')
    .select('name')
    .eq('id', event.program_id)
    .single()

  const slots = (slotsRaw ?? []).map((s: any) => ({
    id:          s.id,
    volunteer_role_id: s.volunteer_roles?.id ?? '',
    role_name:  s.volunteer_roles?.name ?? 'Unknown',
    slot_count: s.slot_count,
    start_time: s.start_time,
    end_time:   s.end_time,
    notes:      s.notes,
    assignments: (s.volunteer_assignments ?? []).map((a: any) => ({
      id:              a.id,
      volunteer_name:  a.volunteer_name,
      volunteer_email: a.volunteer_email,
      signup_source:   a.signup_source,
      status:          a.status,
      contact_id:      a.contact_id,
    })),
  }))

  const teamSlug = teamWithSlug?.slug ?? null

  const ev = event!
  let label = ev.title ?? 'Event'
  if (ev.event_type === 'practice')   label = 'Practice'
  else if (ev.event_type === 'meeting')    label = 'Team Meeting'
  else if (ev.event_type === 'tournament') label = ev.title ?? 'Tournament'
  else if (ev.opponent) label = `${ev.is_home ? 'vs' : '@'} ${ev.opponent}`

  return (
    <EventVolunteersClient
      eventId={ev.id}
      eventLabel={label}
      eventDate={ev.event_date}
      programName={program?.name ?? ''}
      slots={slots}
      contacts={contacts ?? []}
      teamSlug={teamSlug}
    />
  )
}
