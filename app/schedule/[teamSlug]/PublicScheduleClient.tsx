'use client'

import { useState } from 'react'

export type TeamTime = { teamId: string; teamName: string; startTime: string | null }

export type PublicEvent = {
  id: string
  event_type: string
  title: string | null
  opponent: string | null
  is_home: boolean | null
  is_tournament: boolean
  location_name: string | null
  location_address: string | null
  event_date: string
  default_start_time: string | null
  is_past: boolean
  teamTimes: TeamTime[]
}

export type PublicChildGame = {
  id: string
  parent_event_id: string
  opponent: string | null
  location_name: string | null
  event_date: string
  default_start_time: string | null
}

export type PublicTeam = {
  id: string
  name: string
  slug: string | null
  is_primary: boolean
}

type Props = {
  events: PublicEvent[]
  teams: PublicTeam[]
  childGames: PublicChildGame[]
  primaryTeamId: string | null
  brandPrimary:   string
  brandSecondary: string
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

/** Returns the main displayed start time for an event given the active filter. */
function resolveDisplayTime(
  event: PublicEvent,
  filter: string,
  primaryTeamId: string | null,
): string | null {
  const sourceId = filter === 'all' ? primaryTeamId : filter
  if (sourceId) {
    const tt = event.teamTimes.find(t => t.teamId === sourceId)
    if (tt?.startTime) return tt.startTime
  }
  return event.default_start_time
}

/** Returns the secondary team badges to show alongside the main time. */
function resolveSupplementalBadges(
  event: PublicEvent,
  filter: string,
  primaryTeamId: string | null,
): TeamTime[] {
  if (filter !== 'all') return []
  return event.teamTimes.filter(t => t.teamId !== primaryTeamId)
}

export default function PublicScheduleClient({
  events,
  teams,
  childGames,
  primaryTeamId,
  brandPrimary,
  brandSecondary,
}: Props) {
  const [activeFilter, setActiveFilter] = useState<string>('all')

  const showFilterTabs = teams.length > 1

  const filteredEvents = activeFilter === 'all'
    ? events
    : events.filter(e => e.teamTimes.some(t => t.teamId === activeFilter))

  const upcomingCount = filteredEvents.filter(e => !e.is_past).length
  const nextGame      = filteredEvents.find(e => !e.is_past) ?? null

  return (
    <div>
      {/* Team filter tabs */}
      {showFilterTabs && (
        <div className="flex flex-wrap gap-2 mb-8">
          <button
            onClick={() => setActiveFilter('all')}
            className="rounded-full px-4 py-1.5 text-sm font-semibold transition-colors border"
            style={
              activeFilter === 'all'
                ? { backgroundColor: brandPrimary, color: '#fff', borderColor: brandPrimary }
                : { backgroundColor: '#fff', color: '#475569', borderColor: '#e2e8f0' }
            }
          >
            All
          </button>
          {teams.map(team => (
            <button
              key={team.id}
              onClick={() => setActiveFilter(team.id)}
              className="rounded-full px-4 py-1.5 text-sm font-semibold transition-colors border"
              style={
                activeFilter === team.id
                  ? { backgroundColor: brandPrimary, color: '#fff', borderColor: brandPrimary }
                  : { backgroundColor: '#fff', color: '#475569', borderColor: '#e2e8f0' }
              }
            >
              {team.name}
            </button>
          ))}
        </div>
      )}

      {/* Next Game card — solid brand color background */}
      {nextGame && (
        <div className="mb-8 rounded-2xl px-6 py-5 shadow-lg" style={{ backgroundColor: brandPrimary }}>
          <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: 'rgba(255,255,255,0.65)' }}>
            Next Game
          </p>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-white">
                {nextGame.event_type === 'tournament'
                  ? nextGame.title ?? 'Tournament'
                  : nextGame.opponent
                    ? `${nextGame.is_home ? 'vs' : '@'} ${nextGame.opponent}`
                    : 'TBD'
                }
              </h2>
              <div className="flex flex-wrap items-center mt-2 text-sm" style={{ color: 'rgba(255,255,255,0.75)' }}>
                <span className="flex items-center gap-1.5 mr-4">
                  <span>📅</span>
                  <span>{formatDate(nextGame.event_date)}</span>
                </span>
                {resolveDisplayTime(nextGame, activeFilter, primaryTeamId) && (
                  <span className="flex items-center gap-1.5 mr-4">
                    <span>🕐</span>
                    <span>{formatTime(resolveDisplayTime(nextGame, activeFilter, primaryTeamId))}</span>
                  </span>
                )}
                {nextGame.location_name && (
                  <span className="flex items-center gap-1.5 mr-4">
                    <span>📍</span>
                    <span>{nextGame.location_name}</span>
                  </span>
                )}
              </div>
              {resolveSupplementalBadges(nextGame, activeFilter, primaryTeamId).length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {resolveSupplementalBadges(nextGame, activeFilter, primaryTeamId).map(tt => (
                    <span key={tt.teamId} className="text-xs" style={{ color: 'rgba(255,255,255,0.7)' }}>
                      {tt.teamName}{tt.startTime ? ` · ${formatTime(tt.startTime)}` : ''}
                    </span>
                  ))}
                </div>
              )}
              {nextGame.location_address && (
                <a
                  href={`https://maps.google.com/?q=${encodeURIComponent(nextGame.location_address)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1.5 text-xs underline block transition-opacity hover:opacity-100"
                  style={{ color: 'rgba(255,255,255,0.7)' }}
                >
                  {nextGame.location_address} →
                </a>
              )}
            </div>
            {nextGame.event_type !== 'tournament' && nextGame.is_home !== null && (
              <span className="shrink-0 rounded-xl border px-4 py-2 text-sm font-bold text-white" style={{ borderColor: 'rgba(255,255,255,0.3)', backgroundColor: 'rgba(255,255,255,0.15)' }}>
                {nextGame.is_home ? '🏠 Home' : '🚌 Away'}
              </span>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-white">Game Schedule</h2>
        <span className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
          {upcomingCount} game{upcomingCount !== 1 ? 's' : ''} remaining
        </span>
      </div>

      {filteredEvents.length === 0 ? (
        <div className="rounded-2xl border border-white/20 bg-white/10 p-10 text-center">
          <p className="text-white font-semibold">No games scheduled yet</p>
          <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.55)' }}>Check back soon.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredEvents.map(event => {
            const games           = childGames.filter(g => g.parent_event_id === event.id)
            const displayTime     = resolveDisplayTime(event, activeFilter, primaryTeamId)
            const suppBadges      = resolveSupplementalBadges(event, activeFilter, primaryTeamId)
            const title = event.event_type === 'tournament'
              ? event.title ?? 'Tournament'
              : event.opponent
                ? `${event.is_home ? 'vs' : '@'} ${event.opponent}`
                : 'TBD'

            return (
              <div
                key={event.id}
                className={`rounded-2xl border px-5 py-4 bg-white shadow-sm transition-shadow ${
                  event.is_past ? 'opacity-55' : 'hover:shadow-md'
                }`}
                style={{ borderColor: event.is_past ? '#e2e8f0' : '#e2e8f0' }}
              >
                {/* Date + badges row */}
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <p className="text-xs font-semibold" style={{ color: brandPrimary }}>
                    {formatDate(event.event_date)}
                  </p>
                  {event.is_past && (
                    <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs text-slate-400">
                      Final
                    </span>
                  )}
                  {event.is_tournament && (
                    <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs text-amber-600">
                      Tournament
                    </span>
                  )}
                  {suppBadges.map(tt => (
                    <span
                      key={tt.teamId}
                      className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-600"
                    >
                      {tt.teamName}{tt.startTime ? ` · ${formatTime(tt.startTime)}` : ''}
                    </span>
                  ))}
                </div>

                {/* Title + Home/Away badge */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className={`text-base font-bold ${event.is_past ? 'text-slate-400' : 'text-slate-900'}`}>
                      {title}
                    </h3>
                    <div className="flex flex-wrap items-center mt-1.5 text-sm text-slate-500">
                      {displayTime && (
                        <span className="flex items-center gap-1.5 mr-4">
                          <span>🕐</span>
                          <span>{formatTime(displayTime)}</span>
                        </span>
                      )}
                      {event.location_name && (
                        <span className="flex items-center gap-1.5 mr-4">
                          <span>📍</span>
                          <span>{event.location_name}</span>
                        </span>
                      )}
                    </div>
                    {event.location_address && !event.is_past && (
                      <a
                        href={`https://maps.google.com/?q=${encodeURIComponent(event.location_address)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 text-xs hover:underline transition-colors block"
                        style={{ color: brandPrimary }}
                      >
                        {event.location_address} →
                      </a>
                    )}
                  </div>
                  {event.event_type !== 'tournament' && event.is_home !== null && (
                    <span className={`shrink-0 rounded-xl border px-3 py-1 text-xs font-semibold ${
                      event.is_past
                        ? 'border-slate-200 bg-slate-100 text-slate-400'
                        : event.is_home
                          ? 'border-green-200 bg-green-50 text-green-700'
                          : 'border-amber-200 bg-amber-50 text-amber-700'
                    }`}>
                      {event.is_home ? 'Home' : 'Away'}
                    </span>
                  )}
                </div>

                {/* Tournament child games */}
                {event.is_tournament && games.length > 0 && (
                  <div className="mt-3 ml-2 space-y-1.5 border-l-2 border-amber-200 pl-4">
                    {games.map(game => (
                      <div key={game.id} className="flex flex-wrap items-center gap-x-3 text-sm text-slate-600">
                        <span className="font-medium">
                          {game.opponent ? `vs ${game.opponent}` : 'TBD'}
                        </span>
                        {game.default_start_time && (
                          <span className="text-slate-400">{formatTime(game.default_start_time)}</span>
                        )}
                        {game.location_name && (
                          <span className="text-slate-400">· {game.location_name}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
