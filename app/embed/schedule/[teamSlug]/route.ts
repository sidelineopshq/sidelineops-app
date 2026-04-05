import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { formatTeamShortLabel, formatProgramLabel } from '@/lib/utils/team-label'
import { getBaseUrl } from '@/lib/utils/base-url'

export const dynamic = 'force-dynamic'

// Service role client for public page reads — no user data exposed,
// only public schedule fields are selected and returned.
function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function formatTime(time: string | null): string {
  if (!time) return ''
  const [hourStr, minuteStr] = time.split(':')
  const hour = parseInt(hourStr)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const hour12 = hour % 12 || 12
  return `${hour12}:${minuteStr} ${ampm}`
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month:   'short',
    day:     'numeric',
  })
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ teamSlug: string }> }
) {
  const { teamSlug } = await params
  const supabase = createServiceClient()

  const { data: team } = await supabase
    .from('teams')
    .select('id, name, slug, program_id, logo_url, primary_color, secondary_color')
    .eq('slug', teamSlug)
    .single()

  if (!team) {
    return new NextResponse('Schedule not found', { status: 404 })
  }

  const { data: program } = await supabase
    .from('programs')
    .select('name, sport, season_year, school_id')
    .eq('id', team.program_id)
    .single()

  const { data: school } = program?.school_id
    ? await supabase.from('schools').select('name').eq('id', program.school_id).single()
    : { data: null }

  // All teams in the same program — primary first, then alphabetical
  const { data: allTeamsData } = await supabase
    .from('teams')
    .select('id, name, level, slug, is_primary')
    .eq('program_id', team.program_id)
    .not('slug', 'is', null)
    .order('is_primary', { ascending: false })
    .order('name', { ascending: true })

  const allTeams = (allTeamsData ?? []).map(t => ({
    id:         t.id,
    name:       formatTeamShortLabel((t as any).level ?? ''),
    slug:       t.slug,
    is_primary: t.is_primary,
  }))
  const allTeamIds    = allTeams.map(t => t.id)
  const primaryTeamId = allTeams.find(t => t.is_primary)?.id ?? allTeams[0]?.id ?? null

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })

  const { data: eventRows } = await supabase
    .from('events')
    .select(`
      id,
      title,
      event_type,
      opponent,
      is_home,
      is_tournament,
      location_name,
      event_date,
      default_start_time,
      status,
      event_team_details!inner(
        team_id,
        start_time
      )
    `)
    .in('event_team_details.team_id', allTeamIds.length > 0 ? allTeamIds : ['00000000-0000-0000-0000-000000000000'])
    .in('event_type', ['game', 'tournament'])
    .is('parent_event_id', null)
    .eq('status', 'scheduled')
    .eq('is_public', true)
    .gte('event_date', today)
    .order('event_date', { ascending: true })

  const eventIds = (eventRows ?? []).map((row: any) => row.id as string)

  // Fetch all team details for these events to build teamTimes
  type TeamTimeRow = { event_id: string; team_id: string; start_time: string | null }
  let teamTimeRows: TeamTimeRow[] = []
  if (eventIds.length > 0 && allTeamIds.length > 0) {
    const { data: rows } = await supabase
      .from('event_team_details')
      .select('event_id, team_id, start_time')
      .in('event_id', eventIds)
      .in('team_id', allTeamIds)
    teamTimeRows = (rows ?? []) as TeamTimeRow[]
  }

  type TeamTime = { teamId: string; teamName: string; startTime: string | null }
  const teamTimesById: Record<string, TeamTime[]> = {}
  teamTimeRows.forEach(row => {
    const t = allTeams.find(t => t.id === row.team_id)
    if (!t) return
    if (!teamTimesById[row.event_id]) teamTimesById[row.event_id] = []
    teamTimesById[row.event_id].push({
      teamId:    row.team_id,
      teamName:  t.name,
      startTime: row.start_time,
    })
  })

  const events = (eventRows ?? []).map((row: any) => ({
    ...row,
    teamTimes:          teamTimesById[row.id] ?? [],
    event_team_details: undefined,
  }))

  // Fetch child games for tournaments
  const tournamentIds = events.filter(e => e.is_tournament).map(e => e.id)
  let childGames: any[] = []
  if (tournamentIds.length > 0) {
    const { data: childRows } = await supabase
      .from('events')
      .select('id, parent_event_id, opponent, location_name, event_date, default_start_time')
      .in('parent_event_id', tournamentIds)
      .eq('status', 'scheduled')
      .order('event_date', { ascending: true })
      .order('default_start_time', { ascending: true, nullsFirst: false })
    childGames = childRows ?? []
  }

  const brandPrimary   = (team as any).primary_color   ?? '#0ea5e9'
  const brandSecondary = (team as any).secondary_color ?? '#1e293b'
  const teamLogoUrl    = (team as any).logo_url as string | null

  const baseUrl       = getBaseUrl()
  const publicPageUrl = `${baseUrl}/schedule/${teamSlug}`

  // Build event cards HTML
  const eventsHtml = events.length === 0
    ? `<div class="empty"><p>No upcoming games scheduled.</p></div>`
    : events.map(event => {
        const games = childGames.filter(g => g.parent_event_id === event.id)
        const title = event.event_type === 'tournament'
          ? (event.title ?? 'Tournament')
          : event.opponent
            ? `${event.is_home ? 'vs' : '@'} ${event.opponent}`
            : 'TBD'

        const homeBadge = event.is_tournament
          ? `<span class="badge badge-tournament">Tournament</span>`
          : event.is_home !== null
            ? `<span class="badge ${event.is_home ? 'badge-home' : 'badge-away'}">${event.is_home ? 'Home' : 'Away'}</span>`
            : ''

        // Primary team's time is the main displayed time; secondary teams are badges
        const primaryTT  = (event.teamTimes as TeamTime[]).find(t => t.teamId === primaryTeamId)
        const displayTime = primaryTT?.startTime ?? event.default_start_time
        const secondaryBadges = (event.teamTimes as TeamTime[])
          .filter(t => t.teamId !== primaryTeamId)
          .map(tt =>
            `<span class="badge badge-team">${tt.teamName}${
              tt.startTime ? ` &middot; ${formatTime(tt.startTime)}` : ''
            }</span>`
          ).join('')

        const badgeHtml = [homeBadge, secondaryBadges].filter(Boolean).join('')

        const detailsHtml = [
          displayTime
            ? `<span class="detail"><span>🕐</span><span>${formatTime(displayTime)}</span></span>`
            : '',
          event.location_name
            ? `<span class="detail"><span>📍</span><span>${event.location_name}</span></span>`
            : '',
        ].filter(Boolean).join('')

        const childGamesHtml = event.is_tournament && games.length > 0
          ? `<div class="tournament-games">
              ${games.map((g: any) => `
                <div class="tournament-game">
                  <span class="tg-name">${g.opponent ? `vs ${g.opponent}` : 'TBD'}</span>
                  ${g.default_start_time
                    ? `<span class="tg-detail">${formatTime(g.default_start_time)}</span>`
                    : ''}
                  ${g.location_name
                    ? `<span class="tg-detail">· ${g.location_name}</span>`
                    : ''}
                </div>
              `).join('')}
            </div>`
          : ''

        return `
          <div class="card">
            <div class="card-top">
              <span class="date">${formatDate(event.event_date)}</span>
              <div class="badges">${badgeHtml}</div>
            </div>
            <div class="title">${title}</div>
            ${detailsHtml ? `<div class="details">${detailsHtml}</div>` : ''}
            ${childGamesHtml}
          </div>
        `
      }).join('')

  const primarySubtle = brandPrimary + '15'

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${formatProgramLabel(school?.name ?? '', program?.sport ?? '')} Schedule</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --brand-primary:   ${brandPrimary};
      --brand-secondary: ${brandSecondary};
      --brand-subtle:    ${primarySubtle};
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #f1f5f9;
      color: #0f172a;
      font-size: 14px;
      line-height: 1.5;
      padding: 12px;
    }

    /* Header — neutral bg with brand bottom border */
    .header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 10px;
      background: #f8fafc;
      border-radius: 10px;
      padding: 10px 13px;
      border-bottom: 2px solid ${brandPrimary}4d;
    }
    .header-logos {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }
    .so-logo      { height: 15px; width: auto; opacity: 0.45; }
    .logo-divider { width: 1px; height: 22px; background: #cbd5e1; flex-shrink: 0; }
    .team-logo    { height: 32px; max-height: 32px; width: auto; object-fit: contain; }
    .header-text  { flex: 1; min-width: 0; }
    .header h2    { font-size: 13px; font-weight: 700; color: #0f172a; }
    .header p     { font-size: 11px; color: #64748b; margin-top: 1px; }

    /* Schedule list — subtle brand tint */
    .schedule-section {
      background: var(--brand-subtle);
      border-radius: 10px;
      padding: 10px;
    }
    .list { display: flex; flex-direction: column; gap: 7px; }

    /* Event cards — always white */
    .card {
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 10px 12px;
      box-shadow: 0 1px 2px rgba(0,0,0,0.04);
    }

    .card-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      margin-bottom: 5px;
      flex-wrap: wrap;
    }

    /* Date pill — primary color bg, white text */
    .date {
      font-size: 10px; font-weight: 700;
      padding: 2px 8px; border-radius: 999px;
      background: var(--brand-primary); color: #fff;
      display: inline-block;
    }

    .badges { display: flex; flex-wrap: wrap; gap: 4px; }

    .badge {
      font-size: 10px; font-weight: 600;
      padding: 2px 8px; border-radius: 999px; border: 1px solid;
    }
    /* Home/Away — secondary color */
    .badge-home, .badge-away {
      background: ${brandSecondary}20;
      color: ${brandSecondary};
      border-color: ${brandSecondary}60;
    }
    /* Tournament/team — secondary outline */
    .badge-tournament, .badge-team {
      background: ${brandSecondary}15;
      color: ${brandSecondary};
      border-color: ${brandSecondary}60;
    }

    .title   { font-size: 13px; font-weight: 700; color: #0f172a; margin-bottom: 3px; }
    .details { display: flex; flex-wrap: wrap; gap: 8px; font-size: 11px; color: #64748b; }
    .detail  { display: flex; align-items: center; gap: 3px; }

    .tournament-games {
      margin-top: 7px; padding-top: 6px;
      border-top: 1px solid #f1f5f9;
      border-left: 2px solid ${brandSecondary}60;
      margin-left: 2px; padding-left: 9px;
      display: flex; flex-direction: column; gap: 4px;
    }
    .tournament-game { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; font-size: 11px; }
    .tg-name   { color: #1e293b; font-weight: 600; }
    .tg-detail { color: #94a3b8; }

    .empty { text-align: center; padding: 24px; color: #94a3b8; font-size: 12px; }

    .footer { margin-top: 10px; text-align: center; }
    .footer a {
      font-size: 11px; color: #94a3b8;
      text-decoration: none;
      display: inline-flex; align-items: center; gap: 4px;
    }
    .footer a:hover { color: #475569; }
    .footer img { height: 12px; width: auto; opacity: 0.45; }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-logos">
      <img src="/sidelineops-logo-cropped.png" alt="SidelineOps" class="so-logo" />
      ${teamLogoUrl ? `<div class="logo-divider"></div><img src="${teamLogoUrl}" alt="${team.name}" class="team-logo" />` : ''}
    </div>
    <div class="header-text">
      <h2>${formatProgramLabel(school?.name ?? '', program?.sport ?? '')}</h2>
      <p>${program?.season_year ?? ''} Season &middot; ${events.length} game${events.length !== 1 ? 's' : ''} remaining</p>
    </div>
  </div>

  <div class="schedule-section">
    <div class="list">${eventsHtml}</div>
  </div>

  <div class="footer">
    <a href="${publicPageUrl}" target="_blank" rel="noopener noreferrer">
      <img src="/sidelineops-logo-cropped.png" alt="SidelineOps" />
      <span>Powered by SidelineOps</span>
    </a>
  </div>
</body>
</html>`

  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type':           'text/html; charset=utf-8',
      'X-Frame-Options':        'ALLOWALL',
      'Content-Security-Policy': 'frame-ancestors *',
      'Cache-Control':          'public, max-age=300',
    },
  })
}
