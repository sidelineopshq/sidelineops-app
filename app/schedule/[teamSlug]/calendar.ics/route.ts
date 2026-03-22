import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { NextResponse } from 'next/server'

// Escape special characters for ICS format
function icsEscape(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}

// Format a date+time for ICS (YYYYMMDDTHHMMSS)
function icsDateTime(dateStr: string, timeStr: string | null): string {
  const datePart = dateStr.replace(/-/g, '')
  if (!timeStr) return `${datePart}T000000`
  const [h, m] = timeStr.split(':')
  return `${datePart}T${h.padStart(2,'0')}${m.padStart(2,'0')}00`
}

// Format a date-only for ICS all-day events (YYYYMMDD)
function icsDate(dateStr: string): string {
  return dateStr.replace(/-/g, '')
}

function eventSummary(event: any): string {
  if (event.event_type === 'practice') return 'Practice'
  if (event.event_type === 'tournament') return event.title ?? 'Tournament'
  if (event.opponent) return `${event.is_home ? 'vs' : '@'} ${event.opponent}`
  return event.title ?? 'Event'
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ teamSlug: string }> }
) {
  const { teamSlug } = await params

  // Detect if this is the team calendar (request from /team path context)
  // We use a query param ?type=team to differentiate
  const url = new URL(request.url)
  const isTeamCalendar = url.searchParams.get('type') === 'team'

  const supabase = await createClient()

  const { data: team } = await supabase
    .from('teams')
    .select('id, name, slug, program_id')
    .eq('slug', teamSlug)
    .single()

  if (!team) return new NextResponse('Not found', { status: 404 })

  const { data: program } = await supabase
    .from('programs')
    .select('name, sport, season_year, school_id')
    .eq('id', team.program_id)
    .single()

  const { data: school } = await supabase
    .from('schools')
    .select('name')
    .eq('id', program?.school_id)
    .single()

  // Fetch events based on type
  const eventTypes = isTeamCalendar
    ? ['game', 'tournament', 'practice', 'scrimmage']
    : ['game', 'tournament']

  const { data: eventRows } = await supabase
    .from('events')
    .select(`
      id,
      title,
      event_type,
      opponent,
      is_home,
      location_name,
      location_address,
      event_date,
      default_start_time,
      default_end_time,
      default_arrival_time,
      status,
      uniform_notes,
      notes,
      meal_required,
      meal_time,
      meal_notes,
      event_team_details!inner(
        team_id,
        start_time,
        arrival_time,
        end_time
      )
    `)
    .eq('event_team_details.team_id', team.id)
    .in('event_type', eventTypes)
    .eq('status', 'scheduled')
    .eq('is_public', true)
    .order('event_date', { ascending: true })

  const events = (eventRows ?? []).map((row: any) => ({
    ...row,
    display_time:    row.event_team_details?.[0]?.start_time   || row.default_start_time,
    display_end:     row.event_team_details?.[0]?.end_time     || row.default_end_time,
    display_arrival: row.event_team_details?.[0]?.arrival_time || row.default_arrival_time,
  }))

  const calendarName = isTeamCalendar
    ? `${program?.name ?? team.name} - Team Schedule`
    : `${program?.name ?? team.name} - Game Schedule`

  const calendarDescription = isTeamCalendar
    ? `Full team schedule for ${school?.name ?? ''} ${program?.name ?? team.name} - ${program?.season_year} Season`
    : `Game schedule for ${school?.name ?? ''} ${program?.name ?? team.name} - ${program?.season_year} Season`

  // Build ICS content
  const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SidelineOps//SidelineOps Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsEscape(calendarName)}`,
    `X-WR-CALDESC:${icsEscape(calendarDescription)}`,
    'X-WR-TIMEZONE:America/Chicago',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    `X-PUBLISHED-TTL:PT1H`,
  ]

  for (const event of events) {
    const summary = eventSummary(event)
    const uid = `${event.id}@sidelineopshq.com`

    const dtStart = event.display_time
      ? icsDateTime(event.event_date, event.display_time)
      : icsDate(event.event_date)

    const dtEnd = event.display_end
      ? icsDateTime(event.event_date, event.display_end)
      : event.display_time
        ? icsDateTime(event.event_date, event.display_time) // same as start if no end
        : icsDate(event.event_date)

    // Build description
    const descParts: string[] = []
    if (event.display_arrival && isTeamCalendar) {
      descParts.push(`Arrive: ${event.display_arrival.slice(0, 5)}`)
    }
    if (event.event_type !== 'practice' && event.is_home !== null) {
      descParts.push(event.is_home ? 'Home Game' : 'Away Game')
    }
    if (event.uniform_notes && isTeamCalendar) {
      descParts.push(`Uniforms: ${event.uniform_notes}`)
    }
    if (event.meal_required && isTeamCalendar) {
      const mealStr = [
        event.meal_time ? `Meal at ${event.meal_time.slice(0, 5)}` : 'Team Meal',
        event.meal_notes,
      ].filter(Boolean).join(' - ')
      descParts.push(mealStr)
    }
    if (event.notes && isTeamCalendar) {
      descParts.push(event.notes)
    }
    descParts.push('Powered by SidelineOps')

    const description = icsEscape(descParts.join('\n'))
    const location = icsEscape(
      [event.location_name, event.location_address].filter(Boolean).join(', ')
    )

    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${uid}`)
    lines.push(`DTSTAMP:${now}`)

    if (event.display_time) {
      lines.push(`DTSTART:${dtStart}`)
      lines.push(`DTEND:${dtEnd}`)
    } else {
      lines.push(`DTSTART;VALUE=DATE:${dtStart}`)
      lines.push(`DTEND;VALUE=DATE:${dtEnd}`)
    }

    lines.push(`SUMMARY:${icsEscape(summary)}`)
    if (description) lines.push(`DESCRIPTION:${description}`)
    if (location) lines.push(`LOCATION:${location}`)
    lines.push('STATUS:CONFIRMED')
    lines.push('END:VEVENT')
  }

  lines.push('END:VCALENDAR')

  const icsContent = lines.join('\r\n')

  return new NextResponse(icsContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${teamSlug}-schedule.ics"`,
      'Cache-Control': 'public, max-age=3600',
    },
  })
}