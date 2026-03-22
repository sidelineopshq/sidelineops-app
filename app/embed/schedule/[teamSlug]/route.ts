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
    .select('id, name, slug, program_id')
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

  const today = new Date().toISOString().split('T')[0]

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
    .eq('event_team_details.team_id', team.id)
    .in('event_type', ['game', 'tournament'])
    .eq('status', 'scheduled')
    .eq('is_public', true)
    .gte('event_date', today)
    .order('event_date', { ascending: true })

  const events = (eventRows ?? []).map((row: any) => ({
    ...row,
    display_time: row.event_team_details?.[0]?.start_time || row.default_start_time,
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

  const publicPageUrl = `https://sidelineopshq.com/schedule/${teamSlug}`

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

        const badgeHtml = event.is_tournament
          ? `<span class="badge badge-tournament">Tournament</span>`
          : event.is_home !== null
            ? `<span class="badge ${event.is_home ? 'badge-home' : 'badge-away'}">${event.is_home ? 'Home' : 'Away'}</span>`
            : ''

        const detailsHtml = [
          event.display_time
            ? `<span class="detail"><span>🕐</span><span>${formatTime(event.display_time)}</span></span>`
            : '',
          event.location_name
            ? `<span class="detail"><span>📍</span><span>${event.location_name}</span></span>`
            : '',
        ].filter(Boolean).join('')

        const childGamesHtml = event.is_tournament && games.length > 0
          ? `<div class="tournament-games">
              ${games.map(g => `
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
              ${badgeHtml}
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
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: var(--bg);
      color: var(--text);
      font-size: 14px;
      line-height: 1.5;
      padding: 14px;
    }

    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
    }
    .header h2 { font-size: 15px; font-weight: 700; }
    .header p  { font-size: 11px; color: var(--muted); margin-top: 2px; }
    .logo { height: 26px; width: auto; opacity: 0.6; }

    .list { display: flex; flex-direction: column; gap: 8px; }

    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 11px 13px;
    }

    .card-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 5px;
    }

    .date { font-size: 11px; font-weight: 600; color: var(--muted); }

    .badge {
      font-size: 10px; font-weight: 600;
      padding: 2px 8px; border-radius: 999px; border: 1px solid;
    }
    .badge-home      { background: var(--home-bg);  color: var(--home-text);  border-color: var(--home-border); }
    .badge-away      { background: var(--away-bg);  color: var(--away-text);  border-color: var(--away-border); }
    .badge-tournament { background: var(--tourn-bg); color: var(--tourn-text); border-color: var(--tourn-border); }

    .title   { font-size: 14px; font-weight: 700; margin-bottom: 4px; }
    .details { display: flex; flex-wrap: wrap; gap: 10px; font-size: 12px; color: var(--muted); }
    .detail  { display: flex; align-items: center; gap: 4px; }

    .tournament-games {
      margin-top: 9px; padding-top: 7px;
      border-top: 1px solid var(--border);
      border-left: 2px solid var(--tourn-border);
      margin-left: 2px; padding-left: 10px;
      display: flex; flex-direction: column; gap: 4px;
    }
    .tournament-game { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 12px; }
    .tg-name   { color: var(--text); font-weight: 600; }
    .tg-detail { color: var(--muted); }

    .empty { text-align: center; padding: 28px; color: var(--muted); font-size: 13px; }

    .footer { margin-top: 12px; text-align: center; }
    .footer a {
      font-size: 11px; color: var(--faint);
      text-decoration: none;
      display: inline-flex; align-items: center; gap: 4px;
    }
    .footer a:hover { color: var(--muted); }
    .footer img { height: 13px; width: auto; opacity: 0.5; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h2>${program?.name ?? team.name}</h2>
      <p>${program?.season_year ?? ''} Season &middot; ${events.length} game${events.length !== 1 ? 's' : ''} remaining</p>
    </div>
    <img src="/sidelineops-logo-cropped.png" alt="SidelineOps" class="logo" />
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