'use client'

import { useState, useTransition, useEffect, useCallback } from 'react'
import {
  applyTemplateToRemainingGames,
  regenerateSignupToken,
  sendHelpNeededNotification,
} from '@/app/actions/volunteers'
import {
  assignVolunteer,
  unassignVolunteer,
  deleteVolunteerSlot,
  deleteSlotWithAssignments,
} from '@/app/(app)/events/[id]/volunteer-actions'

// ── Types ─────────────────────────────────────────────────────────────────────

export type Assignment = {
  id: string
  volunteer_name: string
  volunteer_email: string | null
  contact_id: string | null
  status: string
}

export type Slot = {
  id: string
  role_id: string
  role_name: string
  slot_count: number
  start_time: string | null
  end_time: string | null
  notes: string | null
  assignments: Assignment[]
}

export type HomeGame = {
  id: string
  event_date: string
  opponent: string | null
  title: string | null
  location_name: string | null
  start_time: string | null
  slots: Slot[]
}

export type SeasonEvent = {
  id: string
  event_date: string
  label: string
  is_home: boolean
  status: string
  start_time: string | null
}

export type DashboardContact = {
  id: string
  first_name: string
  last_name: string | null
  email: string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt12(t: string | null) {
  if (!t) return null
  const [h, m] = t.split(':')
  const hr = parseInt(h)
  return `${hr % 12 || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`
}

function fmtDate(d: string, opts?: Intl.DateTimeFormatOptions) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', opts ?? {
    weekday: 'short', month: 'short', day: 'numeric',
  })
}

function fmtDateLong(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  })
}

function gameLabel(g: HomeGame | SeasonEvent) {
  const label = 'opponent' in g ? (g.opponent ?? g.title ?? 'Game') : g.label
  return `vs ${label}`
}

function slotFilled(slot: Slot) {
  return slot.assignments.filter(a => a.status !== 'cancelled').length
}

function totalFilled(slots: Slot[]) {
  return slots.reduce((n, s) => n + slotFilled(s), 0)
}

function totalCount(slots: Slot[]) {
  return slots.reduce((n, s) => n + s.slot_count, 0)
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function Toast({
  message,
  variant = 'success',
  onDismiss,
}: {
  message: string
  variant?: 'success' | 'error'
  onDismiss: () => void
}) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 5000)
    return () => clearTimeout(t)
  }, [onDismiss])
  return (
    <div
      className={[
        'fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3',
        'rounded-2xl px-5 py-3 shadow-2xl text-sm font-semibold',
        variant === 'success'
          ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300'
          : 'bg-red-500/20 border border-red-500/40 text-red-300',
      ].join(' ')}
    >
      <span>{variant === 'success' ? '✓' : '✕'}</span>
      <span>{message}</span>
      <button onClick={onDismiss} className="ml-2 opacity-60 hover:opacity-100">✕</button>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function VolunteerDashboardClient({
  programId,
  primaryTeamId,
  teamSlug,
  signupToken: initialToken,
  programName,
  canManage,
  homeGames: initialGames,
  seasonEvents,
  contacts,
}: {
  programId: string
  primaryTeamId: string
  teamSlug: string | null
  signupToken: string | null
  programName: string
  canManage: boolean
  homeGames: HomeGame[]
  seasonEvents: SeasonEvent[]
  contacts: DashboardContact[]
}) {
  const appUrl    = process.env.NEXT_PUBLIC_APP_URL ?? 'https://sidelineopshq.com'
  const baseUrl   = typeof window !== 'undefined' ? window.location.origin : appUrl

  // ── State ──────────────────────────────────────────────────────────────────
  const [games, setGames]         = useState(initialGames)
  const [token, setToken]         = useState(initialToken)
  const signupUrl = teamSlug
    ? `${baseUrl}/volunteer/${teamSlug}${token ? `?t=${token}` : ''}`
    : null

  // QR modal
  const [qrOpen, setQrOpen]           = useState(false)
  const [qrDataUrl, setQrDataUrl]     = useState<string | null>(null)
  const [qrCopied, setQrCopied]       = useState(false)
  const [regenPending, startRegen]    = useTransition()

  // Apply template
  const [applyOpen, setApplyOpen]       = useState(false)
  const [applyPending, startApply]      = useTransition()
  const [applyToast, setApplyToast]     = useState<{ message: string; variant: 'success' | 'error' } | null>(null)

  // Inline management
  const [expandedId, setExpandedId]   = useState<string | null>(null)

  // Assign dialog
  const [assignCtx, setAssignCtx]     = useState<{
    slotId: string; roleName: string; eventId: string
  } | null>(null)
  const [assignName, setAssignName]   = useState('')
  const [assignEmail, setAssignEmail] = useState('')
  const [assignContactId, setAssignContactId] = useState('')
  const [contactSearch, setContactSearch]     = useState('')
  const [assignPending, startAssign]          = useTransition()
  const [assignError, setAssignError]         = useState<string | null>(null)

  // Remove assignment confirm
  const [removeCtx, setRemoveCtx]     = useState<{
    assignmentId: string; volunteerName: string; eventId: string
  } | null>(null)
  const [removePending, startRemove]  = useTransition()

  // Delete slot confirm
  const [deleteSlotCtx, setDeleteSlotCtx] = useState<{
    slotId: string; roleName: string; eventId: string; hasAssignments: boolean
  } | null>(null)
  const [deletePending, startDelete]      = useTransition()

  // Help needed
  const [helpPending, setHelpPending] = useState<Record<string, boolean>>({})
  const [helpToast, setHelpToast]     = useState<{ message: string; variant: 'success' | 'error' } | null>(null)

  // Season table
  const [seasonOpen, setSeasonOpen]   = useState(false)
  const [globalToast, setGlobalToast] = useState<{ message: string; variant: 'success' | 'error' } | null>(null)

  // ── QR generation ─────────────────────────────────────────────────────────
  const openQrModal = useCallback(async () => {
    setQrOpen(true)
    if (signupUrl && !qrDataUrl) {
      try {
        const QRCode = (await import('qrcode')).default
        const url = await QRCode.toDataURL(signupUrl, { margin: 2, width: 280 })
        setQrDataUrl(url)
      } catch {
        // qrcode unavailable
      }
    }
  }, [signupUrl, qrDataUrl])

  const handleRegen = () => {
    startRegen(async () => {
      const res = await regenerateSignupToken(primaryTeamId)
      if ('error' in res) {
        setGlobalToast({ message: res.error, variant: 'error' })
        return
      }
      setToken(res.token)
      setQrDataUrl(null) // regenerate QR on next open
      const newUrl = teamSlug
        ? `${baseUrl}/volunteer/${teamSlug}?t=${res.token}`
        : null
      if (newUrl) {
        try {
          const QRCode = (await import('qrcode')).default
          const url = await QRCode.toDataURL(newUrl, { margin: 2, width: 280 })
          setQrDataUrl(url)
        } catch {}
      }
      setGlobalToast({ message: 'Signup link regenerated', variant: 'success' })
    })
  }

  const handleCopyLink = () => {
    if (!signupUrl) return
    navigator.clipboard.writeText(signupUrl).then(() => {
      setQrCopied(true)
      setTimeout(() => setQrCopied(false), 2000)
    })
  }

  // ── Apply template ─────────────────────────────────────────────────────────
  const handleApply = () => {
    setApplyOpen(false)
    startApply(async () => {
      const res = await applyTemplateToRemainingGames(programId)
      if ('error' in res) {
        setApplyToast({ message: res.error, variant: 'error' })
      } else {
        const { eventsProcessed, slotsAdded } = res
        setApplyToast({
          message: `Done — ${slotsAdded} slot${slotsAdded !== 1 ? 's' : ''} added across ${eventsProcessed} game${eventsProcessed !== 1 ? 's' : ''}`,
          variant: 'success',
        })
      }
    })
  }

  // ── Assign volunteer ───────────────────────────────────────────────────────
  const openAssign = (slotId: string, roleName: string, eventId: string) => {
    setAssignCtx({ slotId, roleName, eventId })
    setAssignName('')
    setAssignEmail('')
    setAssignContactId('')
    setContactSearch('')
    setAssignError(null)
  }

  const handleContactSelect = (c: DashboardContact) => {
    setAssignContactId(c.id)
    setAssignName(`${c.first_name} ${c.last_name ?? ''}`.trim())
    setAssignEmail(c.email ?? '')
    setContactSearch('')
  }

  const handleAssignSubmit = () => {
    if (!assignCtx) return
    const trimmed = assignName.trim()
    if (!trimmed) { setAssignError('Name is required'); return }
    setAssignError(null)
    startAssign(async () => {
      const res = await assignVolunteer(
        assignCtx.slotId,
        assignCtx.eventId,
        programName,
        {
          contact_id:      assignContactId || undefined,
          volunteer_name:  trimmed,
          volunteer_email: assignEmail.trim() || undefined,
        },
        {
          role_name:   assignCtx.roleName,
          event_label: gameLabel(games.find(g => g.id === assignCtx.eventId)!),
          event_date:  games.find(g => g.id === assignCtx.eventId)?.event_date ?? '',
        },
      )
      if ('error' in res) {
        setAssignError(res.error as string)
        return
      }
      // Optimistically update local state
      setGames(prev => prev.map(g => {
        if (g.id !== assignCtx.eventId) return g
        return {
          ...g,
          slots: g.slots.map(s => {
            if (s.id !== assignCtx.slotId) return s
            return {
              ...s,
              assignments: [...s.assignments, {
                id:              res.assignment.id,
                volunteer_name:  res.assignment.volunteer_name,
                volunteer_email: res.assignment.volunteer_email ?? null,
                contact_id:      res.assignment.contact_id      ?? null,
                status:          res.assignment.status,
              }],
            }
          }),
        }
      }))
      setAssignCtx(null)
    })
  }

  // ── Remove volunteer ───────────────────────────────────────────────────────
  const handleRemoveConfirm = () => {
    if (!removeCtx) return
    startRemove(async () => {
      const res = await unassignVolunteer(removeCtx.assignmentId, removeCtx.eventId)
      if ('error' in res) {
        setGlobalToast({ message: res.error as string, variant: 'error' })
        setRemoveCtx(null)
        return
      }
      setGames(prev => prev.map(g => ({
        ...g,
        slots: g.slots.map(s => ({
          ...s,
          assignments: s.assignments.filter(a => a.id !== removeCtx.assignmentId),
        })),
      })))
      setRemoveCtx(null)
    })
  }

  // ── Delete slot ────────────────────────────────────────────────────────────
  const handleDeleteSlotConfirm = () => {
    if (!deleteSlotCtx) return
    startDelete(async () => {
      const res = deleteSlotCtx.hasAssignments
        ? await deleteSlotWithAssignments(deleteSlotCtx.slotId, deleteSlotCtx.eventId, programName)
        : await deleteVolunteerSlot(deleteSlotCtx.slotId, deleteSlotCtx.eventId)
      if ('error' in res) {
        setGlobalToast({ message: res.error as string, variant: 'error' })
        setDeleteSlotCtx(null)
        return
      }
      setGames(prev => prev.map(g => ({
        ...g,
        slots: g.slots.filter(s => s.id !== deleteSlotCtx.slotId),
      })))
      setDeleteSlotCtx(null)
    })
  }

  // ── Help needed ────────────────────────────────────────────────────────────
  const handleHelpNeeded = async (eventId: string) => {
    setHelpPending(p => ({ ...p, [eventId]: true }))
    const res = await sendHelpNeededNotification(eventId, primaryTeamId)
    setHelpPending(p => ({ ...p, [eventId]: false }))
    if ('error' in res) {
      setHelpToast({ message: res.error, variant: 'error' })
    } else if ('message' in res) {
      setHelpToast({ message: res.message, variant: 'error' })
    } else {
      setHelpToast({
        message: `Sent to ${res.sent} contact${res.sent !== 1 ? 's' : ''}`,
        variant: 'success',
      })
    }
  }

  const filteredContacts = contacts.filter(c => {
    if (!contactSearch.trim()) return true
    const q = contactSearch.toLowerCase()
    return (
      c.first_name.toLowerCase().includes(q) ||
      (c.last_name ?? '').toLowerCase().includes(q) ||
      (c.email ?? '').toLowerCase().includes(q)
    )
  }).slice(0, 8)

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <section className="mx-auto max-w-4xl px-4 py-8 sm:px-6">

      {/* Toasts */}
      {applyToast && (
        <Toast message={applyToast.message} variant={applyToast.variant} onDismiss={() => setApplyToast(null)} />
      )}
      {helpToast && (
        <Toast message={helpToast.message} variant={helpToast.variant} onDismiss={() => setHelpToast(null)} />
      )}
      {globalToast && (
        <Toast message={globalToast.message} variant={globalToast.variant} onDismiss={() => setGlobalToast(null)} />
      )}

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Volunteer Management</h1>
          <p className="text-slate-400 text-sm mt-1">{programName}</p>
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            {teamSlug && (
              <button
                onClick={openQrModal}
                className="flex items-center gap-2 rounded-xl border border-white/15 bg-slate-800 hover:bg-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 transition-colors"
              >
                <span>🔗</span> Share Signup Link
              </button>
            )}
            <button
              onClick={() => setApplyOpen(true)}
              disabled={applyPending}
              className="flex items-center gap-2 rounded-xl border border-white/15 bg-slate-800 hover:bg-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 transition-colors disabled:opacity-50"
            >
              <span>✓</span> {applyPending ? 'Applying…' : 'Apply Template'}
            </button>
            <a
              href="/volunteers/settings"
              className="flex items-center gap-2 rounded-xl border border-white/15 bg-slate-800 hover:bg-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 transition-colors"
            >
              <span>⚙️</span> Settings
            </a>
          </div>
        )}
      </div>

      {/* ── Section 1: Upcoming Home Games ─────────────────────────────────── */}
      <div className="mb-10">
        <h2 className="text-base font-semibold text-slate-300 mb-4">Upcoming Home Games</h2>

        {games.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-slate-900 px-6 py-10 text-center">
            <p className="text-slate-400 text-sm">No upcoming home games scheduled.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {games.map(game => {
              const filled    = totalFilled(game.slots)
              const total     = totalCount(game.slots)
              const pct       = total > 0 ? Math.round((filled / total) * 100) : 0
              const expanded  = expandedId === game.id
              const allFilled = total > 0 && filled >= total

              return (
                <div
                  key={game.id}
                  className="rounded-2xl border border-white/10 bg-slate-900 overflow-hidden"
                >
                  {/* Card header */}
                  <div className="px-5 py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xs text-slate-500 font-medium">
                          {fmtDate(game.event_date)}
                          {game.start_time && ` · ${fmt12(game.start_time)}`}
                          {game.location_name && ` · ${game.location_name}`}
                        </p>
                        <p className="text-base font-semibold text-white mt-0.5">
                          {gameLabel(game)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {total > 0 && (
                          <span className={[
                            'text-xs font-semibold px-2.5 py-1 rounded-full',
                            allFilled
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : filled > 0
                                ? 'bg-sky-500/20 text-sky-400'
                                : 'bg-slate-700 text-slate-400',
                          ].join(' ')}>
                            {filled}/{total}
                          </span>
                        )}
                        {canManage && (
                          <button
                            onClick={() => setExpandedId(expanded ? null : game.id)}
                            className="text-xs font-semibold text-sky-400 hover:text-sky-300 transition-colors px-2 py-1"
                          >
                            {expanded ? 'Close' : 'Manage'}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Progress bar */}
                    {total > 0 && (
                      <div className="mt-3">
                        <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                          <div
                            className={[
                              'h-full rounded-full transition-all',
                              allFilled ? 'bg-emerald-500' : 'bg-sky-500',
                            ].join(' ')}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                          {game.slots.map(slot => {
                            const f = slotFilled(slot)
                            return (
                              <span key={slot.id} className="text-xs text-slate-500">
                                {slot.role_name}: {f}/{slot.slot_count}
                              </span>
                            )
                          })}
                          {game.slots.length === 0 && (
                            <span className="text-xs text-slate-600">No volunteer slots configured</span>
                          )}
                        </div>
                      </div>
                    )}
                    {total === 0 && (
                      <p className="mt-2 text-xs text-slate-600">No volunteer slots configured for this game.</p>
                    )}
                  </div>

                  {/* Inline manage panel */}
                  {expanded && canManage && (
                    <div className="border-t border-white/10 bg-slate-950/50">
                      {/* Help needed button */}
                      {total > filled && total > 0 && (
                        <div className="px-5 pt-4 pb-2 flex items-center justify-between gap-3">
                          <p className="text-xs text-slate-500">
                            {total - filled} open spot{total - filled !== 1 ? 's' : ''} — send a help-needed email to all contacts?
                          </p>
                          <button
                            onClick={() => handleHelpNeeded(game.id)}
                            disabled={helpPending[game.id]}
                            className="shrink-0 rounded-xl bg-amber-500/15 border border-amber-500/30 hover:bg-amber-500/25 px-4 py-1.5 text-xs font-semibold text-amber-400 transition-colors disabled:opacity-50"
                          >
                            {helpPending[game.id] ? 'Sending…' : '📣 Send Help Needed'}
                          </button>
                        </div>
                      )}

                      {/* Slot list */}
                      {game.slots.length === 0 ? (
                        <div className="px-5 py-4 text-xs text-slate-500">
                          No slots yet. Apply your template or add slots from the event page.
                        </div>
                      ) : (
                        <div className="divide-y divide-white/5">
                          {game.slots.map(slot => {
                            const filled = slotFilled(slot)
                            const open   = slot.slot_count - filled
                            return (
                              <div key={slot.id} className="px-5 py-3">
                                <div className="flex items-center justify-between gap-2 mb-2">
                                  <div>
                                    <span className="text-sm font-semibold text-white">{slot.role_name}</span>
                                    {(slot.start_time || slot.end_time) && (
                                      <span className="text-xs text-slate-500 ml-2">
                                        {[fmt12(slot.start_time), fmt12(slot.end_time)].filter(Boolean).join('–')}
                                      </span>
                                    )}
                                    <span className="text-xs text-slate-500 ml-2">{filled}/{slot.slot_count} filled</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {open > 0 && (
                                      <button
                                        onClick={() => openAssign(slot.id, slot.role_name, game.id)}
                                        className="text-xs font-semibold text-sky-400 hover:text-sky-300 transition-colors"
                                      >
                                        + Add
                                      </button>
                                    )}
                                    <button
                                      onClick={() => setDeleteSlotCtx({
                                        slotId: slot.id,
                                        roleName: slot.role_name,
                                        eventId: game.id,
                                        hasAssignments: slot.assignments.length > 0,
                                      })}
                                      className="text-xs text-slate-600 hover:text-red-400 transition-colors"
                                    >
                                      Remove slot
                                    </button>
                                  </div>
                                </div>

                                {/* Assignments */}
                                {slot.assignments.length > 0 && (
                                  <div className="flex flex-col gap-1">
                                    {slot.assignments.map(a => (
                                      <div
                                        key={a.id}
                                        className="flex items-center justify-between rounded-lg bg-slate-800/60 px-3 py-1.5"
                                      >
                                        <div>
                                          <span className="text-sm text-white">{a.volunteer_name}</span>
                                          {a.volunteer_email && (
                                            <span className="text-xs text-slate-500 ml-2">{a.volunteer_email}</span>
                                          )}
                                        </div>
                                        <button
                                          onClick={() => setRemoveCtx({
                                            assignmentId: a.id,
                                            volunteerName: a.volunteer_name,
                                            eventId: game.id,
                                          })}
                                          className="text-xs text-slate-600 hover:text-red-400 transition-colors ml-2"
                                        >
                                          Remove
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {slot.assignments.length === 0 && (
                                  <p className="text-xs text-slate-600 pl-0.5">No volunteers assigned yet.</p>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Section 2: Full Season Schedule ────────────────────────────────── */}
      <div>
        <button
          onClick={() => setSeasonOpen(v => !v)}
          className="flex items-center gap-2 text-base font-semibold text-slate-300 hover:text-white transition-colors mb-4"
        >
          <span
            className="inline-block transition-transform"
            style={{ transform: seasonOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
          >
            ▶
          </span>
          Full Season Schedule
          <span className="text-xs text-slate-500 font-normal">({seasonEvents.length} events)</span>
        </button>

        {seasonOpen && (
          <div className="rounded-2xl border border-white/10 bg-slate-900 overflow-hidden">
            {seasonEvents.length === 0 ? (
              <div className="px-6 py-8 text-center text-sm text-slate-500">No events scheduled.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide hidden sm:table-cell">Time</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Opponent</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Location</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {seasonEvents.map(e => (
                    <tr key={e.id} className="hover:bg-white/[0.02]">
                      <td className="px-4 py-3 text-slate-300 whitespace-nowrap">
                        {fmtDate(e.event_date)}
                      </td>
                      <td className="px-4 py-3 text-slate-500 hidden sm:table-cell">
                        {fmt12(e.start_time) ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-white">
                        <span className="text-slate-400 mr-1">{e.is_home ? 'vs' : '@'}</span>
                        {e.label}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className={[
                          'text-xs font-medium px-2 py-0.5 rounded-full',
                          e.is_home
                            ? 'bg-sky-500/15 text-sky-400'
                            : 'bg-slate-700 text-slate-400',
                        ].join(' ')}>
                          {e.is_home ? 'Home' : 'Away'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={[
                          'text-xs font-medium capitalize',
                          e.status === 'scheduled' ? 'text-slate-400'
                            : e.status === 'cancelled' ? 'text-red-400'
                            : 'text-slate-500',
                        ].join(' ')}>
                          {e.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* ── Modal: QR / Share Signup Link ──────────────────────────────────── */}
      {qrOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
          onClick={e => { if (e.target === e.currentTarget) setQrOpen(false) }}
        >
          <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold">Volunteer Signup Link</h2>
              <button onClick={() => setQrOpen(false)} className="text-slate-500 hover:text-white text-lg">✕</button>
            </div>

            {qrDataUrl ? (
              <div className="flex justify-center mb-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrDataUrl} alt="QR code" className="rounded-xl border border-white/10" width={200} height={200} />
              </div>
            ) : (
              <div className="flex justify-center items-center h-[200px] mb-4 text-slate-600 text-sm">
                {signupUrl ? 'Generating QR…' : 'No signup URL configured'}
              </div>
            )}

            {signupUrl && (
              <>
                <div className="mb-4 rounded-xl bg-slate-800 border border-white/10 px-3 py-2">
                  <p className="text-xs text-slate-400 break-all">{signupUrl}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleCopyLink}
                    className="flex-1 rounded-xl bg-sky-600 hover:bg-sky-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors"
                  >
                    {qrCopied ? '✓ Copied!' : 'Copy Link'}
                  </button>
                  <button
                    onClick={handleRegen}
                    disabled={regenPending}
                    className="rounded-xl border border-white/15 hover:bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-300 transition-colors disabled:opacity-50"
                    title="Regenerate link (invalidates old link)"
                  >
                    {regenPending ? '…' : '↻ New Link'}
                  </button>
                </div>
                <p className="mt-3 text-xs text-slate-600 text-center">
                  Regenerating creates a new link and invalidates the old one.
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Modal: Apply Template Confirm ──────────────────────────────────── */}
      {applyOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
          onClick={e => { if (e.target === e.currentTarget) setApplyOpen(false) }}
        >
          <div className="w-full max-w-md rounded-2xl border border-white/15 bg-slate-900 p-6 shadow-2xl">
            <h2 className="text-lg font-bold mb-2">Apply Template to Remaining Home Games?</h2>
            <p className="text-sm text-slate-400 mb-6">
              This will add your volunteer template slots to all upcoming home games. Standing volunteers will be automatically assigned to matching roles. Template slots will be added alongside any existing slots.
            </p>
            <div className="flex flex-row-reverse gap-3">
              <button
                onClick={handleApply}
                className="rounded-xl bg-sky-600 hover:bg-sky-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors"
              >
                Apply Now
              </button>
              <button
                onClick={() => setApplyOpen(false)}
                className="rounded-xl border border-white/15 hover:bg-slate-800 px-5 py-2.5 text-sm font-semibold text-slate-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Assign Volunteer ─────────────────────────────────────────── */}
      {assignCtx && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
          onClick={e => { if (e.target === e.currentTarget) setAssignCtx(null) }}
        >
          <div className="w-full max-w-md rounded-2xl border border-white/15 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold">Add Volunteer — {assignCtx.roleName}</h2>
              <button onClick={() => setAssignCtx(null)} className="text-slate-500 hover:text-white">✕</button>
            </div>

            {/* Contact search */}
            {contacts.length > 0 && (
              <div className="mb-4">
                <label className="block text-xs font-semibold text-slate-400 mb-1">Search contacts</label>
                <input
                  type="text"
                  value={contactSearch}
                  onChange={e => setContactSearch(e.target.value)}
                  placeholder="Type to search…"
                  className="w-full rounded-xl bg-slate-800 border border-white/10 px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-sky-500"
                />
                {contactSearch.trim() && filteredContacts.length > 0 && (
                  <div className="mt-1 rounded-xl border border-white/10 bg-slate-800 overflow-hidden">
                    {filteredContacts.map(c => (
                      <button
                        key={c.id}
                        onClick={() => handleContactSelect(c)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-slate-700 transition-colors border-b border-white/5 last:border-0"
                      >
                        <span className="text-white">{c.first_name} {c.last_name}</span>
                        {c.email && <span className="text-slate-500 ml-2">{c.email}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="mb-3">
              <label className="block text-xs font-semibold text-slate-400 mb-1">Name <span className="text-red-400">*</span></label>
              <input
                type="text"
                value={assignName}
                onChange={e => setAssignName(e.target.value)}
                placeholder="Volunteer name"
                className="w-full rounded-xl bg-slate-800 border border-white/10 px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-sky-500"
              />
            </div>
            <div className="mb-5">
              <label className="block text-xs font-semibold text-slate-400 mb-1">Email (optional)</label>
              <input
                type="email"
                value={assignEmail}
                onChange={e => setAssignEmail(e.target.value)}
                placeholder="volunteer@example.com"
                className="w-full rounded-xl bg-slate-800 border border-white/10 px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-sky-500"
              />
            </div>

            {assignError && (
              <p className="text-xs text-red-400 mb-3">{assignError}</p>
            )}

            <div className="flex flex-row-reverse gap-3">
              <button
                onClick={handleAssignSubmit}
                disabled={assignPending}
                className="rounded-xl bg-sky-600 hover:bg-sky-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-50"
              >
                {assignPending ? 'Saving…' : 'Add Volunteer'}
              </button>
              <button
                onClick={() => setAssignCtx(null)}
                className="rounded-xl border border-white/15 hover:bg-slate-800 px-5 py-2.5 text-sm font-semibold text-slate-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Remove Volunteer Confirm ────────────────────────────────── */}
      {removeCtx && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
          onClick={e => { if (e.target === e.currentTarget) setRemoveCtx(null) }}
        >
          <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-slate-900 p-6 shadow-2xl">
            <h2 className="text-lg font-bold mb-2">Remove Volunteer?</h2>
            <p className="text-sm text-slate-400 mb-6">
              Remove <strong className="text-white">{removeCtx.volunteerName}</strong> from this slot? They will receive a cancellation email if they have one on file.
            </p>
            <div className="flex flex-row-reverse gap-3">
              <button
                onClick={handleRemoveConfirm}
                disabled={removePending}
                className="rounded-xl bg-red-600 hover:bg-red-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-50"
              >
                {removePending ? 'Removing…' : 'Remove'}
              </button>
              <button
                onClick={() => setRemoveCtx(null)}
                className="rounded-xl border border-white/15 hover:bg-slate-800 px-5 py-2.5 text-sm font-semibold text-slate-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Delete Slot Confirm ──────────────────────────────────────── */}
      {deleteSlotCtx && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
          onClick={e => { if (e.target === e.currentTarget) setDeleteSlotCtx(null) }}
        >
          <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-slate-900 p-6 shadow-2xl">
            <h2 className="text-lg font-bold mb-2">Remove Slot?</h2>
            <p className="text-sm text-slate-400 mb-1">
              Remove the <strong className="text-white">{deleteSlotCtx.roleName}</strong> slot?
            </p>
            {deleteSlotCtx.hasAssignments && (
              <p className="text-xs text-amber-400 mb-4">
                This slot has assigned volunteers. They will be unassigned and notified.
              </p>
            )}
            <div className={deleteSlotCtx.hasAssignments ? '' : 'mt-5'} />
            <div className="flex flex-row-reverse gap-3">
              <button
                onClick={handleDeleteSlotConfirm}
                disabled={deletePending}
                className="rounded-xl bg-red-600 hover:bg-red-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-50"
              >
                {deletePending ? 'Removing…' : 'Remove Slot'}
              </button>
              <button
                onClick={() => setDeleteSlotCtx(null)}
                className="rounded-xl border border-white/15 hover:bg-slate-800 px-5 py-2.5 text-sm font-semibold text-slate-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

    </section>
  )
}
