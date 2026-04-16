'use client'

import { useState, useMemo } from 'react'
import { sendNotification }                from './actions'
import {
  buildEventNotificationEmail,
  defaultSubject,
  type NotificationType,
} from '@/lib/email/eventNotification'

// ─── Types ────────────────────────────────────────────────────────────────────

type Contact = {
  id:           string
  first_name:   string
  last_name:    string
  email:        string | null
  contact_type: string
  sms_consent:  boolean | null
  team_id:      string | null
  team_ids:     string[]       // all teams this contact belongs to (legacy + contact_teams)
}

type Team = {
  id:               string
  name:             string
  slug:             string | null
  is_primary:       boolean
  groupme_enabled:  boolean | null
  groupme_bot_id:   string | null
}

type TournamentGame = {
  id:                  string
  event_type:          string
  title:               string | null
  opponent:            string | null
  is_home:             boolean | null
  event_date:          string
  default_start_time:  string | null
  location_name:       string | null
  status:              string
}

type EventData = {
  id:                  string
  event_type:          string
  title:               string | null
  opponent:            string | null
  is_home:             boolean | null
  is_tournament:       boolean
  location_name:       string | null
  location_address:    string | null
  event_date:          string
  default_start_time:  string | null
  status:              string
}

type Props = {
  event:           EventData
  teams:           Team[]
  contacts:        Contact[]
  programName:     string
  primaryTeamId:   string | null
  appUrl:          string
  tournamentGames: TournamentGame[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(time: string | null): string | null {
  if (!time) return null
  const [h, m] = time.split(':')
  const hour = parseInt(h)
  return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  })
}

function eventTitle(event: EventData): string {
  if (event.event_type === 'tournament') return event.title ?? 'Tournament'
  if (event.opponent) return `${event.is_home ? 'vs' : '@'} ${event.opponent}`
  return event.title ?? 'Event'
}

function gameLabel(g: TournamentGame): string {
  if (g.opponent) return `${g.is_home ? 'vs' : '@'} ${g.opponent}`
  return g.title ?? 'Game'
}

function buildTournamentMessageText(games: TournamentGame[]): string {
  const lines = games.map(g => {
    const label = gameLabel(g)
    const date  = new Date(g.event_date + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
    })
    const time = g.default_start_time ? formatTime(g.default_start_time) : null
    return `• ${label} — ${date}${time ? ` at ${time}` : ''}${g.location_name ? ` · ${g.location_name}` : ''}`
  })
  return `Games:\n${lines.join('\n')}`
}

const NOTIFICATION_TYPES: NotificationType[] = [
  'General Update',
  'Game Reminder',
  'Cancellation',
  'Schedule Change',
  'Practice Reminder',
  'Meal Notice',
]

function defaultRecipientFilter(type: NotificationType) {
  return (c: Contact): boolean => {
    if (!c.email) return false
    switch (type) {
      case 'Practice Reminder': return c.contact_type === 'player'
      case 'Meal Notice':       return c.contact_type === 'parent'
      case 'Game Reminder':     return c.contact_type === 'parent' || c.contact_type === 'player'
      default:                  return true
    }
  }
}

function roleBadge(type: string) {
  const map: Record<string, string> = {
    parent: 'border-sky-500/30 bg-sky-500/10 text-sky-400',
    player: 'border-violet-500/30 bg-violet-500/10 text-violet-400',
  }
  return map[type] ?? 'border-white/10 bg-slate-700 text-slate-400'
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function NotifyClient({
  event,
  teams,
  contacts,
  programName,
  primaryTeamId,
  appUrl,
  tournamentGames,
}: Props) {
  const title    = eventTitle(event)
  const dateStr  = formatDate(event.event_date)
  const timeStr  = formatTime(event.default_start_time)

  const primaryTeam = teams.find(t => t.id === primaryTeamId) ?? teams[0]

  // Teams with GroupMe configured
  const groupmeTeams = teams.filter(t => t.groupme_enabled && t.groupme_bot_id)

  // ── State ──────────────────────────────────────────────────────────────────
  const [notifType, setNotifType]         = useState<NotificationType>('Game Reminder')
  const [teamFilter, setTeamFilter]       = useState<string>('all')
  const [selected, setSelected]           = useState<Set<string>>(
    () => new Set(contacts.filter(defaultRecipientFilter('Game Reminder')).map(c => c.id))
  )
  const [subject, setSubject]             = useState(defaultSubject('Game Reminder', title, dateStr))
  const [message, setMessage]             = useState(
    () => tournamentGames.length > 0 ? buildTournamentMessageText(tournamentGames) : ''
  )
  const [groupmeSelected, setGroupmeSelected] = useState<Set<string>>(
    () => new Set(groupmeTeams.map(t => t.id))
  )
  const [showPreview, setShowPreview]     = useState(false)
  const [sending, setSending]             = useState(false)
  const [result, setResult]               = useState<{ sent: number; skipped: number; groupmeSent?: number } | null>(null)
  const [error, setError]                 = useState<string | null>(null)

  // ── Derived ────────────────────────────────────────────────────────────────
  const filteredContacts = useMemo(() =>
    teamFilter === 'all'
      ? contacts
      : contacts.filter(c => c.team_ids.includes(teamFilter)),
    [contacts, teamFilter]
  )

  const selectedCount = [...selected].filter(id =>
    filteredContacts.some(c => c.id === id)
  ).length

  const canSend = selected.size > 0 && message.trim().length > 0 && subject.trim().length > 0

  const previewHtml = useMemo(() =>
    buildEventNotificationEmail({
      type: notifType,
      event: {
        title,
        date:        dateStr,
        time:        timeStr,
        location:    event.location_name,
        teamName:    primaryTeam?.name ?? '',
        programName,
        teamSlug:    primaryTeam?.slug ?? null,
      },
      customMessage: message || '(your message will appear here)',
      appUrl,
    }),
    [notifType, message, title, dateStr, timeStr, event.location_name, primaryTeam, programName, appUrl]
  )

  // ── Handlers ───────────────────────────────────────────────────────────────
  function handleTypeChange(type: NotificationType) {
    setNotifType(type)
    setSubject(defaultSubject(type, title, dateStr))
    // Re-apply default pre-selection for new type
    setSelected(new Set(contacts.filter(defaultRecipientFilter(type)).map(c => c.id)))
  }

  function toggleContact(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function selectAll() {
    setSelected(prev => {
      const next = new Set(prev)
      filteredContacts.filter(c => c.email).forEach(c => next.add(c.id))
      return next
    })
  }

  function deselectAll() {
    setSelected(prev => {
      const next = new Set(prev)
      filteredContacts.forEach(c => next.delete(c.id))
      return next
    })
  }

  async function handleSend() {
    if (!canSend) return
    setSending(true)
    setError(null)
    try {
      const res = await sendNotification({
        eventId:          event.id,
        contactIds:       [...selected],
        notificationType: notifType,
        subject,
        message,
        teamId:           primaryTeam?.id ?? '',
        groupmeTeamIds:   [...groupmeSelected],
      })
      if ('error' in res) {
        setError(res.error ?? 'An error occurred.')
      } else {
        setResult({ sent: res.sent, skipped: res.skipped, groupmeSent: res.groupmeSent })
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'An unexpected error occurred.')
    } finally {
      setSending(false)
    }
  }

  // ── Success state ──────────────────────────────────────────────────────────
  if (result) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <div className="mx-auto mb-6 w-16 h-16 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <path d="M7 16L13 22L25 10" stroke="#86efac" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Emails Sent</h1>
        <p className="text-slate-300 mb-1">
          <span className="font-semibold text-white">{result.sent}</span> email{result.sent !== 1 ? 's' : ''} delivered successfully.
        </p>
        {(result.groupmeSent ?? 0) > 0 && (
          <p className="text-slate-300 text-sm mb-1">
            GroupMe message sent to <span className="font-semibold text-white">{result.groupmeSent}</span> group{result.groupmeSent !== 1 ? 's' : ''}.
          </p>
        )}
        {result.skipped > 0 && (
          <p className="text-slate-500 text-sm">
            {result.skipped} contact{result.skipped !== 1 ? 's' : ''} skipped (no email address or delivery error).
          </p>
        )}
        <div className="flex flex-col sm:flex-row gap-3 justify-center mt-8">
          <a
            href={`/events/${event.id}/edit`}
            className="rounded-xl border border-white/10 bg-slate-800 hover:bg-slate-700 px-6 py-3 text-sm font-semibold transition-colors"
          >
            Back to Event
          </a>
          <a
            href="/schedule"
            className="rounded-xl bg-sky-600 hover:bg-sky-500 px-6 py-3 text-sm font-semibold transition-colors"
          >
            View Schedule
          </a>
        </div>
      </div>
    )
  }

  // ── Main UI ────────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-5xl px-6 py-8">

      {/* Page header */}
      <div className="mb-8">
        <a href={`/events/${event.id}/edit`} className="text-xs text-slate-500 hover:text-slate-400 transition-colors mb-4 inline-block">
          ← Back to Event
        </a>
        <h1 className="text-2xl font-bold">Send Notification</h1>
        <p className="text-slate-400 text-sm mt-1">
          {title} · {dateStr}{timeStr ? ` · ${timeStr}` : ''}
          {event.location_name ? ` · ${event.location_name}` : ''}
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr]">

        {/* ── Left column: type + contacts ── */}
        <div className="space-y-6">

          {/* Notification type */}
          <div className="rounded-2xl border border-white/10 bg-slate-900 p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-sky-400 mb-3">Notification Type</p>
            <div className="grid grid-cols-2 gap-2">
              {NOTIFICATION_TYPES.map(type => (
                <button
                  key={type}
                  onClick={() => handleTypeChange(type)}
                  className={`rounded-lg border px-3 py-2 text-xs font-semibold text-left transition-colors ${
                    notifType === type
                      ? 'border-sky-500/50 bg-sky-500/15 text-sky-300'
                      : 'border-white/10 bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* Contact list */}
          <div className="rounded-2xl border border-white/10 bg-slate-900 overflow-hidden">
            <div className="px-5 py-4 border-b border-white/10">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-sky-400">
                  Recipients
                  <span className="ml-2 text-slate-500 normal-case">
                    ({selected.size} selected)
                  </span>
                </p>
                <div className="flex gap-2">
                  <button onClick={selectAll}   className="text-xs text-sky-400 hover:text-sky-300 transition-colors">All</button>
                  <span className="text-slate-700">·</span>
                  <button onClick={deselectAll} className="text-xs text-slate-500 hover:text-slate-400 transition-colors">None</button>
                </div>
              </div>

              {/* Team filter tabs */}
              {teams.length > 1 && (
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setTeamFilter('all')}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                      teamFilter === 'all'
                        ? 'bg-slate-700 text-white'
                        : 'text-slate-500 hover:text-white'
                    }`}
                  >
                    All
                  </button>
                  {teams.map(team => (
                    <button
                      key={team.id}
                      onClick={() => setTeamFilter(team.id)}
                      className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                        teamFilter === team.id
                          ? 'bg-slate-700 text-white'
                          : 'text-slate-500 hover:text-white'
                      }`}
                    >
                      {team.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="divide-y divide-white/5 max-h-80 overflow-y-auto">
              {filteredContacts.length === 0 ? (
                <p className="px-5 py-6 text-center text-sm text-slate-500">No contacts found.</p>
              ) : (
                filteredContacts.map(contact => {
                  const hasEmail = !!contact.email
                  const isChecked = selected.has(contact.id)
                  return (
                    <label
                      key={contact.id}
                      className={`flex items-center gap-3 px-5 py-3 transition-colors ${
                        hasEmail
                          ? 'cursor-pointer hover:bg-slate-800/60'
                          : 'opacity-40 cursor-not-allowed'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        disabled={!hasEmail}
                        onChange={() => hasEmail && toggleContact(contact.id)}
                        className="rounded border-slate-600 bg-slate-800 text-sky-500 focus:ring-sky-500 focus:ring-offset-slate-900"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-white">
                            {contact.first_name} {contact.last_name}
                          </span>
                          <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${roleBadge(contact.contact_type)}`}>
                            {contact.contact_type}
                          </span>
                          {contact.sms_consent && (
                            <span className="rounded-full border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-xs text-green-400">
                              SMS ✓
                            </span>
                          )}
                        </div>
                        {contact.email ? (
                          <p className="text-xs text-slate-500 mt-0.5">{contact.email}</p>
                        ) : (
                          <p className="text-xs text-slate-600 mt-0.5 italic">No email on file</p>
                        )}
                      </div>
                    </label>
                  )
                })
              )}
            </div>
          </div>

        </div>

        {/* ── Right column: compose + preview ── */}
        <div className="space-y-5">

          {/* Tournament games panel */}
          {tournamentGames.length > 0 && (
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-400 mb-3">
                Tournament Games ({tournamentGames.length})
              </p>
              <div className="space-y-2">
                {tournamentGames.map(g => {
                  const gDate = new Date(g.event_date + 'T00:00:00').toLocaleDateString('en-US', {
                    weekday: 'short', month: 'short', day: 'numeric',
                  })
                  const gTime = formatTime(g.default_start_time)
                  return (
                    <div key={g.id} className="flex items-start gap-2 text-sm">
                      <span className="text-amber-400/60 mt-0.5">•</span>
                      <div>
                        <span className="text-white font-medium">{gameLabel(g)}</span>
                        <span className="text-slate-400 ml-2">{gDate}{gTime ? ` · ${gTime}` : ''}</span>
                        {g.location_name && (
                          <span className="text-slate-500 ml-2 text-xs">{g.location_name}</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* GroupMe channels */}
          {groupmeTeams.length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-slate-900 p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-sky-400 mb-3">Also Send to GroupMe</p>
              <div className="space-y-2">
                {groupmeTeams.map(t => (
                  <label key={t.id} className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={groupmeSelected.has(t.id)}
                      onChange={() => {
                        setGroupmeSelected(prev => {
                          const next = new Set(prev)
                          next.has(t.id) ? next.delete(t.id) : next.add(t.id)
                          return next
                        })
                      }}
                      className="rounded border-slate-600 bg-slate-800 text-sky-500 focus:ring-sky-500 focus:ring-offset-slate-900"
                    />
                    <span className="text-sm text-slate-200">{t.name}</span>
                    <span className="text-xs text-slate-500">GroupMe</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Subject */}
          <div className="rounded-2xl border border-white/10 bg-slate-900 p-5">
            <label className="block text-xs font-semibold uppercase tracking-wide text-sky-400 mb-2">
              Subject
            </label>
            <input
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-slate-800 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-sky-500/50 focus:outline-none focus:ring-1 focus:ring-sky-500/30"
            />
          </div>

          {/* Message */}
          <div className="rounded-2xl border border-white/10 bg-slate-900 p-5">
            <label className="block text-xs font-semibold uppercase tracking-wide text-sky-400 mb-2">
              Message
            </label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={6}
              placeholder="Write your message to parents and players..."
              className="w-full rounded-lg border border-white/10 bg-slate-800 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-sky-500/50 focus:outline-none focus:ring-1 focus:ring-sky-500/30 resize-none"
            />
          </div>

          {/* Preview toggle */}
          <div>
            <button
              onClick={() => setShowPreview(v => !v)}
              className="text-sm text-sky-400 hover:text-sky-300 transition-colors font-medium"
            >
              {showPreview ? '▲ Hide Preview' : '▼ Show Email Preview'}
            </button>
          </div>

          {showPreview && (
            <div className="rounded-2xl border border-white/10 overflow-hidden">
              <div className="bg-slate-800 px-4 py-2 border-b border-white/10">
                <p className="text-xs text-slate-400 font-mono">Preview · {subject || '(no subject)'}</p>
              </div>
              <iframe
                title="Email preview"
                srcDoc={previewHtml}
                className="w-full block"
                style={{ height: '500px', border: 'none', background: '#f1f5f9' }}
                sandbox="allow-same-origin"
              />
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={!canSend || sending}
            className={`w-full rounded-xl px-6 py-3.5 text-sm font-bold transition-colors ${
              canSend && !sending
                ? 'bg-sky-600 hover:bg-sky-500 text-white'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
            }`}
          >
            {sending
              ? 'Sending…'
              : `Send to ${selected.size} Contact${selected.size !== 1 ? 's' : ''}`
            }
          </button>

          {!canSend && !sending && (
            <p className="text-xs text-slate-600 text-center">
              {selected.size === 0
                ? 'Select at least one contact to continue.'
                : 'Add a message and subject to continue.'}
            </p>
          )}

        </div>
      </div>
    </div>
  )
}
