'use client'

import { useState, useTransition } from 'react'
import { lookupContactByPhone, submitVolunteerSignup, type SignupSlotResult } from './actions'

// ── Types ─────────────────────────────────────────────────────────────────────

export type PublicSlot = {
  id:         string
  role_name:  string
  slot_count: number
  start_time: string | null
  end_time:   string | null
  notes:      string | null
  filled:     number
}

export type PublicEvent = {
  id:               string
  event_date:       string
  event_type:       string
  title:            string | null
  opponent:         string | null
  is_home:          boolean | null
  location_name:    string | null
  location_address: string | null
  start_time:       string | null
  team_labels:      string[]
  slots:            PublicSlot[]
  totalOpen:        number
  totalSlots:       number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(time: string | null): string {
  if (!time) return ''
  const [h, m] = time.split(':')
  const hour   = parseInt(h)
  return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  })
}

function slotLabel(roleName: string, startTime: string | null, endTime: string | null): string {
  if (!startTime && !endTime) return roleName
  const parts = [startTime && formatTime(startTime), endTime && formatTime(endTime)].filter(Boolean)
  return `${roleName} (${parts.join(' – ')})`
}

function eventLabel(event: PublicEvent): string {
  if (event.event_type === 'practice')    return 'Practice'
  if (event.event_type === 'meeting')     return 'Team Meeting'
  if (event.event_type === 'tournament')  return event.title ?? 'Tournament'
  if (event.opponent) return `${event.is_home ? 'vs' : '@'} ${event.opponent}`
  return event.title ?? 'Event'
}

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 10)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

function downloadIcs(content: string) {
  const blob = new Blob([content], { type: 'text/calendar' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = 'volunteer-schedule.ics'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function groupByDate(results: SignupSlotResult[]): Map<string, SignupSlotResult[]> {
  const map = new Map<string, SignupSlotResult[]>()
  for (const r of results) {
    if (!map.has(r.eventDate)) map.set(r.eventDate, [])
    map.get(r.eventDate)!.push(r)
  }
  return map
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function VolunteerSignupClient({
  events,
  programId,
  teamId,
  schoolName,
  sportName,
  brandPrimary,
  brandSecondary,
}: {
  events:         PublicEvent[]
  programId:      string
  teamId:         string
  schoolName:     string
  sportName:      string
  brandPrimary:   string
  brandSecondary: string
}) {
  const [expanded, setExpanded]             = useState<string | null>(events[0]?.id ?? null)
  const [selected, setSelected]             = useState<Set<string>>(new Set())
  const [modalOpen, setModalOpen]           = useState(false)
  const [step, setStep]                     = useState<'phone' | 'confirm-known' | 'new' | 'review'>('phone')
  const [phone, setPhone]                   = useState('')
  const [phoneError, setPhoneError]         = useState<string | null>(null)
  const [foundContact, setFoundContact]     = useState<{
    id: string; firstName: string; fullName: string; email: string
  } | null>(null)
  const [volunteerName, setVolunteerName]   = useState('')
  const [volunteerEmail, setVolunteerEmail] = useState('')
  const [contactId, setContactId]           = useState<string | undefined>()
  const [nameError, setNameError]           = useState<string | null>(null)
  const [emailError, setEmailError]         = useState<string | null>(null)
  const [submitError, setSubmitError]       = useState<string | null>(null)
  const [successData, setSuccessData]       = useState<{
    results: SignupSlotResult[]; icsContent: string
  } | null>(null)
  const [isPending, startTransition]        = useTransition()

  const selectedCount = selected.size

  const selectedByEvent = events
    .map(event => ({ event, slots: event.slots.filter(s => selected.has(s.id)) }))
    .filter(e => e.slots.length > 0)

  function toggleSlot(slotId: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(slotId)) next.delete(slotId)
      else next.add(slotId)
      return next
    })
  }

  function openModal() {
    setStep('phone')
    setPhone('')
    setPhoneError(null)
    setFoundContact(null)
    setVolunteerName('')
    setVolunteerEmail('')
    setContactId(undefined)
    setNameError(null)
    setEmailError(null)
    setSubmitError(null)
    setSuccessData(null)
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setSuccessData(null)
  }

  function handlePhoneContinue() {
    setPhoneError(null)
    // Strip non-digits, take last 10 (handles +1 country code)
    const normalized = phone.replace(/\D/g, '').slice(-10)
    if (normalized.length !== 10) {
      setPhoneError('Please enter a complete 10-digit phone number.')
      return
    }
    startTransition(async () => {
      const result = await lookupContactByPhone(programId, normalized)
      if (result.found) {
        setFoundContact({
          id:        result.contactId,
          firstName: result.firstName,
          fullName:  result.fullName,
          email:     result.email,
        })
        setStep('confirm-known')
      } else {
        setStep('new')
      }
    })
  }

  function handleConfirmYes() {
    if (!foundContact) return
    setVolunteerName(foundContact.fullName)
    setVolunteerEmail(foundContact.email)
    setContactId(foundContact.id)
    setStep('review')
  }

  function handleNewContinue() {
    setNameError(null)
    setEmailError(null)
    if (!volunteerName.trim()) { setNameError('Name is required.');  return }
    if (!volunteerEmail.trim()) { setEmailError('Email is required.'); return }
    setStep('review')
  }

  function handleConfirmSignup() {
    setSubmitError(null)
    startTransition(async () => {
      const result = await submitVolunteerSignup({
        programId,
        teamId,
        slotIds:        [...selected],
        volunteerName:  volunteerName.trim(),
        volunteerEmail: volunteerEmail.trim(),
        contactId,
        schoolName,
        sportName,
      })
      if (result.error && !result.results) {
        setSubmitError(result.error)
        return
      }
      if (result.results) {
        setSuccessData({ results: result.results, icsContent: result.icsContent ?? '' })
      }
    })
  }

  const savedResults  = successData?.results.filter(r => !r.filled) ?? []
  const filledResults = successData?.results.filter(r => r.filled) ?? []

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Event list */}
      {events.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
          <p className="text-slate-500 font-medium">No upcoming home games with open volunteer slots.</p>
          <p className="text-slate-400 text-sm mt-1">Check back later!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {events.map(event => {
            const isExpanded      = expanded === event.id
            const openSlots       = event.slots.filter(s => s.filled < s.slot_count)
            const selectedInEvent = event.slots.filter(s => selected.has(s.id)).length

            return (
              <div key={event.id} className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">

                {/* Event header — toggle expand */}
                <button
                  type="button"
                  onClick={() => setExpanded(isExpanded ? null : event.id)}
                  className="w-full text-left px-5 py-4 flex items-center justify-between gap-4 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                        {formatDate(event.event_date)}
                      </p>
                      {event.team_labels.length > 0 && (
                        <span className="rounded-full bg-slate-100 text-slate-600 px-2 py-0.5 text-xs font-semibold">
                          {event.team_labels.join(' · ')}
                        </span>
                      )}
                      {selectedInEvent > 0 && (
                        <span className="rounded-full bg-sky-100 text-sky-700 px-2 py-0.5 text-xs font-semibold">
                          {selectedInEvent} selected
                        </span>
                      )}
                    </div>
                    <p className="text-base font-bold text-slate-900">{eventLabel(event)}</p>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      {event.start_time && (
                        <span className="text-sm text-slate-500">{formatTime(event.start_time)}</span>
                      )}
                      {event.location_name && (
                        <span className="text-sm text-slate-500">{event.location_name}</span>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-2">
                    <span
                      className="hidden sm:inline-block rounded-full px-3 py-1 text-xs font-bold border"
                      style={{
                        borderColor:     `${brandSecondary}4d`,
                        color:           brandSecondary,
                        backgroundColor: `${brandSecondary}1a`,
                      }}
                    >
                      {event.totalOpen} of {event.totalSlots} open
                    </span>
                    <svg
                      className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {/* Mobile slot badge */}
                {!isExpanded && (
                  <div className="sm:hidden px-5 pb-3">
                    <span
                      className="rounded-full px-3 py-1 text-xs font-bold border"
                      style={{
                        borderColor:     `${brandSecondary}4d`,
                        color:           brandSecondary,
                        backgroundColor: `${brandSecondary}1a`,
                      }}
                    >
                      {event.totalOpen} of {event.totalSlots} slots open
                    </span>
                  </div>
                )}

                {/* Expanded: slot checkboxes */}
                {isExpanded && (
                  <div className="border-t border-slate-100 divide-y divide-slate-100">
                    {openSlots.map(slot => {
                      const remaining = slot.slot_count - slot.filled
                      const isChecked = selected.has(slot.id)
                      return (
                        <label
                          key={slot.id}
                          className="flex items-center gap-4 px-5 py-3.5 cursor-pointer hover:bg-slate-50 transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleSlot(slot.id)}
                            className="w-4 h-4 rounded cursor-pointer accent-sky-600 shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-800">
                              {slotLabel(slot.role_name, slot.start_time, slot.end_time)}
                            </p>
                            {slot.notes && (
                              <p className="text-xs text-slate-400 mt-0.5">{slot.notes}</p>
                            )}
                          </div>
                          <span className={`shrink-0 text-xs font-semibold ${
                            remaining <= 1 ? 'text-amber-600' : 'text-slate-500'
                          }`}>
                            {remaining} spot{remaining !== 1 ? 's' : ''} remaining
                          </span>
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Spacer so content isn't hidden under sticky bar */}
      <div className="h-24" />

      {/* Sticky bottom bar */}
      {events.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur border-t border-slate-200 px-4 py-3 flex justify-center">
          <button
            onClick={openModal}
            disabled={selectedCount === 0}
            className="w-full max-w-md rounded-2xl py-3.5 text-sm font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={selectedCount > 0
              ? { backgroundColor: brandPrimary, color: '#fff' }
              : { backgroundColor: '#e2e8f0', color: '#94a3b8' }
            }
          >
            {selectedCount === 0
              ? 'Select slots to sign up'
              : `Sign up for ${selectedCount} slot${selectedCount !== 1 ? 's' : ''}`
            }
          </button>
        </div>
      )}

      {/* ── Modal ──────────────────────────────────────────────────────────── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 px-4 pb-4 sm:pb-0">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">

            {/* Modal header */}
            {!successData && (
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                <h2 className="text-base font-bold text-slate-900">
                  {step === 'phone'         && "Let's confirm who you are"}
                  {step === 'confirm-known' && 'Is that you?'}
                  {step === 'new'           && "We don't have your info on file"}
                  {step === 'review'        && 'Review & Confirm'}
                </h2>
                <button
                  onClick={closeModal}
                  className="text-slate-400 hover:text-slate-600 text-2xl leading-none"
                >
                  ×
                </button>
              </div>
            )}

            <div className="px-6 py-5">

              {/* ── Success view ─────────────────────────────────────────── */}
              {successData && (
                <div>
                  <div className="text-center mb-5 pt-2">
                    <div className="text-4xl mb-2">🎉</div>
                    <h2 className="text-xl font-bold text-slate-900">You're signed up!</h2>
                  </div>

                  {filledResults.length > 0 && (
                    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 space-y-1">
                      {filledResults.map(r => (
                        <p key={r.slotId}>
                          Sorry, <strong>{r.roleName}</strong> on {formatDate(r.eventDate)} just filled up. Your other selections were saved.
                        </p>
                      ))}
                    </div>
                  )}

                  {savedResults.length > 0 && (
                    <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 mb-5">
                      {Array.from(groupByDate(savedResults).entries()).map(([date, slts]) => (
                        <div key={date} className="px-4 py-3">
                          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">
                            {formatDate(date)}
                          </p>
                          <p className="text-sm font-semibold text-slate-700 mb-1.5">
                            {slts[0]?.eventLabel}
                          </p>
                          {slts.map(s => (
                            <div key={s.slotId} className="flex items-center gap-2 text-sm text-slate-600">
                              <span className="text-green-500 font-bold">✓</span>
                              <span>{s.roleName}</span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-col gap-2">
                    {savedResults.length > 0 && successData.icsContent && (
                      <button
                        onClick={() => downloadIcs(successData.icsContent)}
                        className="w-full rounded-xl border border-slate-200 hover:bg-slate-50 py-2.5 text-sm font-semibold text-slate-700 transition-colors"
                      >
                        📅 Add to Calendar
                      </button>
                    )}
                    <button
                      onClick={closeModal}
                      className="w-full rounded-xl py-2.5 text-sm font-bold text-white transition-colors"
                      style={{ backgroundColor: brandPrimary }}
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}

              {/* ── Step 1: Phone lookup ──────────────────────────────────── */}
              {!successData && step === 'phone' && (
                <div>
                  <p className="text-sm text-slate-500 mb-4">
                    Enter your phone number and we'll look you up in our system.
                  </p>
                  <input
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(formatPhone(e.target.value))}
                    onKeyDown={e => { if (e.key === 'Enter') handlePhoneContinue() }}
                    placeholder="(555) 555-5555"
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-base text-slate-900 placeholder-slate-400 focus:border-sky-500 focus:outline-none"
                    autoFocus
                  />
                  {phoneError && <p className="mt-2 text-xs text-red-500">{phoneError}</p>}
                  <button
                    onClick={handlePhoneContinue}
                    disabled={isPending}
                    className="mt-4 w-full rounded-xl py-3 text-sm font-bold text-white transition-colors disabled:opacity-50"
                    style={{ backgroundColor: brandPrimary }}
                  >
                    {isPending ? 'Checking...' : 'Continue'}
                  </button>
                </div>
              )}

              {/* ── Step 2a: Confirm known contact ────────────────────────── */}
              {!successData && step === 'confirm-known' && foundContact && (
                <div>
                  <p className="text-lg font-semibold text-slate-900 mb-6">
                    Hi {foundContact.firstName}! Is that you?
                  </p>
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={handleConfirmYes}
                      className="w-full rounded-xl py-3 text-sm font-bold text-white transition-colors"
                      style={{ backgroundColor: brandPrimary }}
                    >
                      Yes, that's me
                    </button>
                    <button
                      onClick={() => { setFoundContact(null); setStep('new') }}
                      className="w-full rounded-xl border border-slate-200 hover:bg-slate-50 py-3 text-sm font-semibold text-slate-600 transition-colors"
                    >
                      No, that's not me
                    </button>
                  </div>
                </div>
              )}

              {/* ── Step 2b: New volunteer ─────────────────────────────────── */}
              {!successData && step === 'new' && (
                <div>
                  <p className="text-sm text-slate-500 mb-4">Please enter your information to sign up.</p>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">
                        Name <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={volunteerName}
                        onChange={e => setVolunteerName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleNewContinue() }}
                        placeholder="Jane Smith"
                        className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-900 placeholder-slate-400 focus:border-sky-500 focus:outline-none"
                        autoFocus
                      />
                      {nameError && <p className="mt-1 text-xs text-red-500">{nameError}</p>}
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">
                        Email <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="email"
                        value={volunteerEmail}
                        onChange={e => setVolunteerEmail(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleNewContinue() }}
                        placeholder="jane@example.com"
                        className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-900 placeholder-slate-400 focus:border-sky-500 focus:outline-none"
                      />
                      {emailError && <p className="mt-1 text-xs text-red-500">{emailError}</p>}
                    </div>
                  </div>
                  <button
                    onClick={handleNewContinue}
                    className="mt-4 w-full rounded-xl py-3 text-sm font-bold text-white transition-colors"
                    style={{ backgroundColor: brandPrimary }}
                  >
                    Continue
                  </button>
                </div>
              )}

              {/* ── Step 3: Review & Confirm ───────────────────────────────── */}
              {!successData && step === 'review' && (
                <div>
                  <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 mb-4">
                    {selectedByEvent.map(({ event, slots: slotsForEvent }) => (
                      <div key={event.id} className="px-4 py-3">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                            {formatDate(event.event_date)}
                          </p>
                          {event.team_labels.length > 0 && (
                            <span className="rounded-full bg-slate-100 text-slate-500 px-2 py-0.5 text-xs font-medium">
                              {event.team_labels.join(' · ')}
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-semibold text-slate-700 mb-1.5">
                          {eventLabel(event)}
                        </p>
                        {slotsForEvent.map(s => (
                          <div key={s.id} className="flex items-center gap-2 text-sm text-slate-600">
                            <span className="text-sky-500 font-bold">✓</span>
                            <span>{slotLabel(s.role_name, s.start_time, s.end_time)}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>

                  {submitError && (
                    <p className="mb-3 text-xs text-red-500">{submitError}</p>
                  )}

                  <div className="flex gap-3">
                    <button
                      onClick={handleConfirmSignup}
                      disabled={isPending}
                      className="flex-1 rounded-xl py-3 text-sm font-bold text-white transition-colors disabled:opacity-50"
                      style={{ backgroundColor: brandPrimary }}
                    >
                      {isPending ? 'Confirming...' : 'Confirm Sign-Up'}
                    </button>
                    <button
                      onClick={() => setStep(contactId ? 'confirm-known' : 'new')}
                      disabled={isPending}
                      className="rounded-xl border border-slate-200 hover:bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600 transition-colors disabled:opacity-50"
                    >
                      Back
                    </button>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      )}
    </>
  )
}
