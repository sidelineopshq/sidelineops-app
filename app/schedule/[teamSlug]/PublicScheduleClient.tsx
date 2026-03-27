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
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
              activeFilter === 'all'
                ? 'bg-sky-600 text-white'
                : 'border border-white/10 bg-slate-900 text-slate-400 hover:text-white'
            }`}
          >
            All
          </button>
          {teams.map(team => (
            <button
              key={team.id}
              onClick={() => setActiveFilter(team.id)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
                activeFilter === team.id
                  ? 'bg-sky-600 text-white'
                  : 'border border-white/10 bg-slate-900 text-slate-400 hover:text-white'
              }`}
            >
              {team.name}
            </button>
          ))}
        </div>
      )}

      {/* Next Game card */}
      {nextGame && (
        <div className="mb-8 rounded-2xl border border-sky-500/30 bg-sky-500/10 px-6 py-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-400 mb-3">
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
              <div className="flex flex-wrap items-center mt-2 text-sm text-slate-300">
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
                    <span key={tt.teamId} className="text-xs text-violet-400">
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
                  className="mt-1.5 text-xs text-sky-400 hover:text-sky-300 transition-colors block"
                >
                  {nextGame.location_address} →
                </a>
              )}
            </div>
            {nextGame.event_type !== 'tournament' && nextGame.is_home !== null && (
              <span className={`shrink-0 rounded-xl border px-4 py-2 text-sm font-bold ${
                nextGame.is_home
                  ? 'border-green-500/40 bg-green-500/15 text-green-300'
                  : 'border-amber-500/40 bg-amber-500/15 text-amber-300'
              }`}>
                {nextGame.is_home ? '🏠 Home' : '🚌 Away'}
              </span>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold">Game Schedule</h2>
        <span className="text-sm text-slate-500">
          {upcomingCount} game{upcomingCount !== 1 ? 's' : ''} remaining
        </span>
      </div>

      {filteredEvents.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-slate-900 p-10 text-center">
          <p className="text-slate-400 font-semibold">No games scheduled yet</p>
          <p className="text-slate-500 text-sm mt-1">Check back soon.</p>
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
                className={`rounded-2xl border px-5 py-4 transition-colors ${
                  event.is_past
                    ? 'border-white/5 bg-slate-900/50 opacity-50'
                    : 'border-white/10 bg-slate-900 hover:border-white/20'
                }`}
              >
                {/* Date + badges row */}
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <p className="text-xs font-semibold text-slate-400">
                    {formatDate(event.event_date)}
                  </p>
                  {event.is_past && (
                    <span className="rounded-full border border-white/10 bg-slate-800 px-2 py-0.5 text-xs text-slate-500">
                      Final
                    </span>
                  )}
                  {event.is_tournament && (
                    <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-400">
                      Tournament
                    </span>
                  )}
                  {/* Supplemental (secondary) team badges */}
                  {suppBadges.map(tt => (
                    <span
                      key={tt.teamId}
                      className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-xs font-medium text-violet-400"
                    >
                      {tt.teamName}{tt.startTime ? ` · ${formatTime(tt.startTime)}` : ''}
                    </span>
                  ))}
                </div>

                {/* Title + Home/Away badge */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className={`text-base font-bold ${event.is_past ? 'text-slate-400' : 'text-white'}`}>
                      {title}
                    </h3>
                    <div className="flex flex-wrap items-center mt-1.5 text-sm text-slate-400">
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
                        className="mt-1 text-xs text-sky-400 hover:text-sky-300 transition-colors block"
                      >
                        {event.location_address} →
                      </a>
                    )}
                  </div>
                  {event.event_type !== 'tournament' && event.is_home !== null && (
                    <span className={`shrink-0 rounded-xl border px-3 py-1 text-xs font-semibold ${
                      event.is_past
                        ? 'border-white/10 bg-slate-800 text-slate-500'
                        : event.is_home
                          ? 'border-green-500/30 bg-green-500/10 text-green-300'
                          : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                    }`}>
                      {event.is_home ? 'Home' : 'Away'}
                    </span>
                  )}
                </div>

                {/* Tournament child games */}
                {event.is_tournament && games.length > 0 && (
                  <div className="mt-3 ml-2 space-y-1.5 border-l-2 border-amber-500/30 pl-4">
                    {games.map(game => (
                      <div key={game.id} className="flex flex-wrap items-center gap-x-3 text-sm text-slate-300">
                        <span className="font-medium">
                          {game.opponent ? `vs ${game.opponent}` : 'TBD'}
                        </span>
                        {game.default_start_time && (
                          <span className="text-slate-400">{formatTime(game.default_start_time)}</span>
                        )}
                        {game.location_name && (
                          <span className="text-slate-500">· {game.location_name}</span>
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
