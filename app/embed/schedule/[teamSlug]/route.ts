import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

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
    .select('name, sport, season_year')
    .eq('id', team.program_id)
    .single()

  // All teams in the same program — primary first, then alphabetical
  const { data: allTeamsData } = await supabase
    .from('teams')
    .select('id, name, slug, is_primary')
    .eq('program_id', team.program_id)
    .not('slug', 'is', null)
    .order('is_primary', { ascending: false })
    .order('name', { ascending: true })

  const allTeams = (allTeamsData ?? []) as { id: string; name: string; slug: string | null; is_primary: boolean }[]
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

  const baseUrl       = process.env.BASE_URL ?? 'https://sidelineopshq.com'
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

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${program?.name ?? team.name} Schedule</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --brand-primary:   ${brandPrimary};
      --brand-secondary: ${brandSecondary};
      --bg:            #0f172a;
      --card:          #1e293b;
      --border:        rgba(255,255,255,0.08);
      --text:          #f1f5f9;
      --muted:         #94a3b8;
      --faint:         #475569;
      --home-bg:       rgba(34,197,94,0.15);
      --home-text:     #86efac;
      --home-border:   rgba(34,197,94,0.3);
      --away-bg:       rgba(251,191,36,0.15);
      --away-text:     #fcd34d;
      --away-border:   rgba(251,191,36,0.3);
      --tourn-bg:      rgba(251,191,36,0.1);
      --tourn-text:    #fcd34d;
      --tourn-border:  rgba(251,191,36,0.3);
      --team-bg:       rgba(139,92,246,0.1);
      --team-text:     #c4b5fd;
      --team-border:   rgba(139,92,246,0.3);
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: var(--brand-primary);
      color: #0f172a;
      font-size: 14px;
      line-height: 1.5;
      padding: 14px;
    }

    .header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 12px;
      background: #fff;
      border-radius: 10px;
      padding: 10px 13px;
    }
    .header-logos {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }
    .so-logo  { height: 16px; width: auto; opacity: 0.5; }
    .logo-divider { width: 1px; height: 24px; background: #e2e8f0; flex-shrink: 0; }
    .team-logo { height: 36px; max-height: 36px; width: auto; object-fit: contain; }
    .header-text { flex: 1; min-width: 0; }
    .header h2 { font-size: 14px; font-weight: 700; color: #0f172a; }
    .header p  { font-size: 11px; color: #64748b; margin-top: 1px; }

    .list { display: flex; flex-direction: column; gap: 8px; }

    .card {
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 11px 13px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.06);
    }

    .card-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      margin-bottom: 5px;
      flex-wrap: wrap;
    }

    .date { font-size: 11px; font-weight: 600; color: var(--brand-primary); }

    .badges { display: flex; flex-wrap: wrap; gap: 4px; }

    .badge {
      font-size: 10px; font-weight: 600;
      padding: 2px 8px; border-radius: 999px; border: 1px solid;
    }
    .badge-home       { background: #f0fdf4; color: #15803d; border-color: #bbf7d0; }
    .badge-away       { background: #fffbeb; color: #b45309; border-color: #fde68a; }
    .badge-tournament { background: #fffbeb; color: #b45309; border-color: #fde68a; }
    .badge-team       { background: #f5f3ff; color: #6d28d9; border-color: #ddd6fe; }

    .title   { font-size: 14px; font-weight: 700; color: #0f172a; margin-bottom: 4px; }
    .details { display: flex; flex-wrap: wrap; gap: 10px; font-size: 12px; color: #64748b; }
    .detail  { display: flex; align-items: center; gap: 4px; }

    .tournament-games {
      margin-top: 9px; padding-top: 7px;
      border-top: 1px solid #f1f5f9;
      border-left: 2px solid #fde68a;
      margin-left: 2px; padding-left: 10px;
      display: flex; flex-direction: column; gap: 4px;
    }
    .tournament-game { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 12px; }
    .tg-name   { color: #1e293b; font-weight: 600; }
    .tg-detail { color: #94a3b8; }

    .empty { text-align: center; padding: 28px; color: rgba(255,255,255,0.6); font-size: 13px; }

    .footer { margin-top: 12px; text-align: center; }
    .footer a {
      font-size: 11px; color: rgba(255,255,255,0.35);
      text-decoration: none;
      display: inline-flex; align-items: center; gap: 4px;
    }
    .footer a:hover { color: rgba(255,255,255,0.6); }
    .footer img { height: 13px; width: auto; opacity: 0.5; }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-logos">
      <img src="/sidelineops-logo-cropped.png" alt="SidelineOps" class="so-logo" />
      ${teamLogoUrl ? `<div class="logo-divider"></div><img src="${teamLogoUrl}" alt="${team.name}" class="team-logo" />` : ''}
    </div>
    <div class="header-text">
      <h2>${program?.name ?? team.name}</h2>
      <p>${program?.season_year ?? ''} Season &middot; ${events.length} game${events.length !== 1 ? 's' : ''} remaining</p>
    </div>
  </div>

  <div class="list">${eventsHtml}</div>

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
