'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { assignVolunteer, unassignVolunteer, deleteVolunteerSlot, deleteSlotWithAssignments } from './volunteer-actions'

// ── Types ─────────────────────────────────────────────────────────────────────

export type Assignment = {
  id:              string
  volunteer_name:  string
  volunteer_email: string | null
  signup_source:   'coach' | 'self' | 'standing'
  status:          string
  contact_id:      string | null
}

export type VolunteerSlot = {
  id:          string
  role_id:     string
  role_name:   string
  slot_count:  number
  start_time:  string | null
  end_time:    string | null
  notes:       string | null
  assignments: Assignment[]
}

export type Contact = {
  id:           string
  first_name:   string
  last_name:    string | null
  email:        string | null
  contact_type: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(time: string | null): string {
  if (!time) return ''
  const [hourStr, minuteStr] = time.split(':')
  const hour = parseInt(hourStr)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const hour12 = hour % 12 || 12
  return `${hour12}:${minuteStr} ${ampm}`
}

function slotLabel(roleName: string, startTime: string | null, endTime: string | null): string {
  if (!startTime && !endTime) return roleName
  const parts = [startTime && formatTime(startTime), endTime && formatTime(endTime)].filter(Boolean)
  return `${roleName} (${parts.join(' – ')})`
}

// ── Unassign Confirm Dialog ───────────────────────────────────────────────────

function UnassignDialog({ name, onConfirm, onCancel, loading }: {
  name:      string
  onConfirm: () => void
  onCancel:  () => void
  loading:   boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
        <p className="text-sm text-slate-300">
          Remove <span className="font-semibold text-white">{name}</span> from this volunteer slot?
        </p>
        <div className="mt-5 flex gap-3">
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 px-4 py-2.5 text-sm font-semibold transition-colors"
          >
            {loading ? 'Removing...' : 'Remove'}
          </button>
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 rounded-xl border border-white/10 hover:bg-slate-800 disabled:opacity-50 px-4 py-2.5 text-sm font-semibold transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Assign Volunteer Modal ────────────────────────────────────────────────────

function AssignModal({ slot, eventId, eventLabel, eventDate, programName, contacts, onClose, onAssigned }: {
  slot:        VolunteerSlot
  eventId:     string
  eventLabel:  string
  eventDate:   string
  programName: string
  contacts:    Contact[]
  onClose:     () => void
  onAssigned:  (assignment: Assignment) => void
}) {
  const [mode, setMode]                       = useState<'search' | 'manual'>('search')
  const [query, setQuery]                     = useState('')
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
  const [volunteerName, setVolunteerName]     = useState('')
  const [volunteerEmail, setVolunteerEmail]   = useState('')
  const [error, setError]                     = useState<string | null>(null)
  const [isPending, startTransition]          = useTransition()

  const filtered = query.trim().length > 0
    ? contacts.filter(c => {
        const full = `${c.first_name} ${c.last_name ?? ''}`.toLowerCase()
        return full.includes(query.toLowerCase()) ||
          (c.email ?? '').toLowerCase().includes(query.toLowerCase())
      }).slice(0, 8)
    : []

  function handleSelectContact(c: Contact) {
    setSelectedContact(c)
    setQuery(`${c.first_name} ${c.last_name ?? ''}`.trim())
    setVolunteerName(`${c.first_name} ${c.last_name ?? ''}`.trim())
    setVolunteerEmail(c.email ?? '')
  }

  function handleSubmit() {
    setError(null)
    if (!volunteerName.trim()) {
      setError('Name is required.')
      return
    }

    startTransition(async () => {
      const result = await assignVolunteer(
        slot.id,
        eventId,
        programName,
        mode === 'search' && selectedContact
          ? { contact_id: selectedContact.id, volunteer_name: volunteerName, volunteer_email: volunteerEmail || undefined }
          : { volunteer_name: volunteerName.trim(), volunteer_email: volunteerEmail.trim() || undefined },
        { role_name: slot.role_name, event_label: eventLabel, event_date: eventDate },
      )
      if (result?.error) {
        setError(result.error)
      } else if (result?.assignment) {
        onAssigned(result.assignment as Assignment)
        onClose()
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-bold">Assign Volunteer</h3>
            <p className="text-xs text-slate-400 mt-0.5">{slotLabel(slot.role_name, slot.start_time, slot.end_time)}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl leading-none">×</button>
        </div>

        {/* Mode tabs */}
        <div className="flex gap-1 mb-4 p-1 bg-slate-800 rounded-xl">
          <button
            onClick={() => { setMode('search'); setError(null) }}
            className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition-colors ${
              mode === 'search' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Search Contacts
          </button>
          <button
            onClick={() => { setMode('manual'); setSelectedContact(null); setQuery(''); setError(null) }}
            className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition-colors ${
              mode === 'manual' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Enter Manually
          </button>
        </div>

        {mode === 'search' ? (
          <div className="space-y-3">
            <div className="relative">
              <input
                type="text"
                value={query}
                onChange={e => { setQuery(e.target.value); setSelectedContact(null) }}
                placeholder="Search by name or email..."
                className="w-full rounded-xl border border-white/10 bg-slate-800 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none"
                autoFocus
              />
              {filtered.length > 0 && !selectedContact && (
                <ul className="absolute z-10 mt-1 w-full rounded-xl border border-white/10 bg-slate-800 shadow-xl overflow-hidden">
                  {filtered.map(c => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => handleSelectContact(c)}
                        className="w-full text-left px-4 py-2.5 hover:bg-slate-700 transition-colors"
                      >
                        <span className="text-sm font-medium text-white">
                          {c.first_name} {c.last_name ?? ''}
                        </span>
                        {c.email && (
                          <span className="ml-2 text-xs text-slate-400">{c.email}</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {selectedContact && (
              <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-3">
                <p className="text-sm font-semibold text-white">
                  {selectedContact.first_name} {selectedContact.last_name ?? ''}
                </p>
                {selectedContact.email && (
                  <p className="text-xs text-slate-400 mt-0.5">{selectedContact.email}</p>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">
                Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={volunteerName}
                onChange={e => setVolunteerName(e.target.value)}
                placeholder="Jane Smith"
                className="w-full rounded-xl border border-white/10 bg-slate-800 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">
                Email <span className="text-slate-500 font-normal">(optional — for confirmation)</span>
              </label>
              <input
                type="email"
                value={volunteerEmail}
                onChange={e => setVolunteerEmail(e.target.value)}
                placeholder="jane@example.com"
                className="w-full rounded-xl border border-white/10 bg-slate-800 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none"
              />
            </div>
          </div>
        )}

        {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

        <div className="flex gap-3 mt-5">
          <button
            onClick={handleSubmit}
            disabled={isPending || (mode === 'search' && !selectedContact)}
            className="flex-1 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 px-4 py-2.5 text-sm font-semibold transition-colors"
          >
            {isPending ? 'Assigning...' : 'Assign'}
          </button>
          <button
            onClick={onClose}
            disabled={isPending}
            className="rounded-xl border border-white/10 hover:bg-slate-800 disabled:opacity-50 px-4 py-2.5 text-sm font-semibold transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Delete Slot Dialog ────────────────────────────────────────────────────────

function DeleteSlotDialog({ hasAssignments, assignmentCount, onConfirm, onCancel, loading }: {
  hasAssignments:  boolean
  assignmentCount: number
  onConfirm:       () => void
  onCancel:        () => void
  loading:         boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
        <h3 className="text-base font-bold text-white mb-2">
          {hasAssignments ? 'Remove All & Delete Slot?' : 'Delete Slot?'}
        </h3>
        <p className="text-sm text-slate-300">
          {hasAssignments
            ? `This will remove ${assignmentCount} volunteer${assignmentCount !== 1 ? 's' : ''} and delete the slot. Removed volunteers will receive a cancellation email.`
            : 'Delete this volunteer slot? This cannot be undone.'}
        </p>
        <div className="mt-5 flex gap-3">
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 px-4 py-2.5 text-sm font-semibold transition-colors"
          >
            {loading ? 'Deleting...' : hasAssignments ? 'Remove All & Delete' : 'Delete'}
          </button>
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 rounded-xl border border-white/10 hover:bg-slate-800 disabled:opacity-50 px-4 py-2.5 text-sm font-semibold transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Slot Card ─────────────────────────────────────────────────────────────────

function SlotCard({ slot, eventId, eventLabel, eventDate, programName, contacts, onSlotChange, onSlotDeleted }: {
  slot:           VolunteerSlot
  eventId:        string
  eventLabel:     string
  eventDate:      string
  programName:    string
  contacts:       Contact[]
  onSlotChange:   (slotId: string, assignments: Assignment[]) => void
  onSlotDeleted:  (slotId: string) => void
}) {
  const [assignments, setAssignments]           = useState<Assignment[]>(slot.assignments)
  const [showAssign, setShowAssign]             = useState(false)
  const [unassignTarget, setUnassignTarget]     = useState<Assignment | null>(null)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [isPending, startTransition]            = useTransition()

  const filled = assignments.filter(a => a.status !== 'cancelled').length
  const total  = slot.slot_count
  const isFull = filled >= total

  function handleAssigned(a: Assignment) {
    const next = [...assignments, a]
    setAssignments(next)
    onSlotChange(slot.id, next)
  }

  function handleUnassign(assignment: Assignment) {
    startTransition(async () => {
      const result = await unassignVolunteer(assignment.id, eventId)
      if (!result?.error) {
        const next = assignments.filter(a => a.id !== assignment.id)
        setAssignments(next)
        onSlotChange(slot.id, next)
      }
      setUnassignTarget(null)
    })
  }

  function handleDeleteSlot() {
    startTransition(async () => {
      const activeAssignments = assignments.filter(a => a.status !== 'cancelled')
      let result
      if (activeAssignments.length === 0) {
        result = await deleteVolunteerSlot(slot.id, eventId)
      } else {
        result = await deleteSlotWithAssignments(slot.id, eventId, programName)
      }
      if (!result?.error) {
        onSlotDeleted(slot.id)
      }
      setShowDeleteDialog(false)
    })
  }

  return (
    <>
      {showAssign && (
        <AssignModal
          slot={slot}
          eventId={eventId}
          eventLabel={eventLabel}
          eventDate={eventDate}
          programName={programName}
          contacts={contacts}
          onClose={() => setShowAssign(false)}
          onAssigned={handleAssigned}
        />
      )}
      {unassignTarget && (
        <UnassignDialog
          name={unassignTarget.volunteer_name}
          loading={isPending}
          onConfirm={() => handleUnassign(unassignTarget)}
          onCancel={() => setUnassignTarget(null)}
        />
      )}
      {showDeleteDialog && (
        <DeleteSlotDialog
          hasAssignments={assignments.filter(a => a.status !== 'cancelled').length > 0}
          assignmentCount={assignments.filter(a => a.status !== 'cancelled').length}
          onConfirm={handleDeleteSlot}
          onCancel={() => setShowDeleteDialog(false)}
          loading={isPending}
        />
      )}

      <div className="rounded-2xl border border-white/10 bg-slate-900 p-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-white leading-snug">
              {slotLabel(slot.role_name, slot.start_time, slot.end_time)}
            </h3>
            {slot.notes && (
              <p className="text-xs text-slate-400 mt-1">{slot.notes}</p>
            )}
          </div>
          <div className="shrink-0 flex items-center gap-2">
            <span className={`rounded-full border px-3 py-1 text-xs font-bold ${
              isFull
                ? 'border-green-500/30 bg-green-500/10 text-green-400'
                : 'border-amber-500/30 bg-amber-500/10 text-amber-400'
            }`}>
              {filled} / {total}
            </span>
            <button
              onClick={() => setShowDeleteDialog(true)}
              disabled={isPending}
              className="rounded-lg border border-red-500/20 bg-red-500/10 hover:bg-red-500/20 px-2 py-1 text-xs font-semibold text-red-400 transition-colors disabled:opacity-50"
              title="Delete slot"
            >
              {assignments.filter(a => a.status !== 'cancelled').length > 0 ? 'Remove All & Delete' : 'Delete Slot'}
            </button>
          </div>
        </div>

        {/* Assignment list */}
        {assignments.length > 0 && (
          <ul className="mb-4 space-y-1.5">
            {assignments.map(a => (
              <li key={a.id} className="flex items-center justify-between gap-2 rounded-xl border border-white/5 bg-slate-800/50 px-4 py-2.5">
                <div className="min-w-0">
                  <span className="text-sm font-medium text-white">{a.volunteer_name}</span>
                  {a.volunteer_email && (
                    <span className="ml-2 text-xs text-slate-400">{a.volunteer_email}</span>
                  )}
                  {a.signup_source === 'self' && (
                    <span className="ml-2 rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold text-sky-400">
                      Self-signed
                    </span>
                  )}
                  {a.signup_source === 'standing' && (
                    <span className="ml-2 rounded-full border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 text-[10px] font-semibold text-purple-400">
                      Standing
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setUnassignTarget(a)}
                  className="shrink-0 rounded-lg border border-red-500/20 bg-red-500/10 hover:bg-red-500/20 px-2 py-1 text-xs font-semibold text-red-400 transition-colors"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        {assignments.length === 0 && (
          <p className="text-xs text-slate-500 mb-4">No volunteers assigned yet.</p>
        )}

        {!isFull && (
          <button
            onClick={() => setShowAssign(true)}
            className="rounded-xl bg-sky-600 hover:bg-sky-500 px-4 py-2 text-xs font-semibold transition-colors"
          >
            + Assign Volunteer
          </button>
        )}
      </div>
    </>
  )
}

// ── Main Client Component ─────────────────────────────────────────────────────

export default function EventVolunteersClient({
  eventId,
  eventLabel,
  eventDate,
  programName,
  slots: initialSlots,
  contacts,
  teamSlug,
}: {
  eventId:     string
  eventLabel:  string
  eventDate:   string
  programName: string
  slots:       VolunteerSlot[]
  contacts:    Contact[]
  teamSlug:    string | null
}) {
  const router = useRouter()
  const [slots, setSlots]   = useState<VolunteerSlot[]>(initialSlots)
  const [copied, setCopied] = useState(false)

  const formattedDate = new Date(eventDate + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })

  const totalFilled = slots.reduce((sum, s) => sum + s.assignments.filter(a => a.status !== 'cancelled').length, 0)
  const totalSlots  = slots.reduce((sum, s) => sum + s.slot_count, 0)

  function handleSlotChange(slotId: string, assignments: Assignment[]) {
    setSlots(prev => prev.map(s => s.id === slotId ? { ...s, assignments } : s))
  }

  function handleSlotDeleted(slotId: string) {
    setSlots(prev => prev.filter(s => s.id !== slotId))
  }

  function handleCopySignupPage() {
    if (!teamSlug) return
    const url = `${window.location.origin}/volunteer/${teamSlug}`
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-2xl px-4 py-8">

        {/* Back nav */}
        <button
          onClick={() => router.push('/schedule')}
          className="mb-6 flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
        >
          ← Back to Schedule
        </button>

        {/* Page header */}
        <div className="mb-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold leading-tight">{eventLabel}</h1>
              <p className="text-sm text-slate-400 mt-1">{formattedDate}</p>
            </div>
            {totalSlots > 0 && (
              <span className={`shrink-0 rounded-full border px-3 py-1 text-sm font-bold mt-1 ${
                totalFilled >= totalSlots
                  ? 'border-green-500/30 bg-green-500/10 text-green-400'
                  : 'border-amber-500/30 bg-amber-500/10 text-amber-400'
              }`}>
                {totalFilled} / {totalSlots} filled
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-3 flex-wrap">
            <button
              onClick={() => router.push(`/events/${eventId}/edit`)}
              className="rounded-xl border border-white/10 bg-slate-800 hover:bg-slate-700 px-4 py-2 text-xs font-semibold transition-colors"
            >
              Edit Event
            </button>
            {teamSlug && (
              <button
                onClick={handleCopySignupPage}
                className={`rounded-xl border px-4 py-2 text-xs font-semibold transition-colors ${
                  copied
                    ? 'border-green-500/30 bg-green-500/10 text-green-400'
                    : 'border-white/10 bg-slate-800 hover:bg-slate-700 text-slate-300'
                }`}
              >
                {copied ? 'Signup link copied!' : 'Share Volunteer Signup Page'}
              </button>
            )}
          </div>
        </div>

        {/* Volunteer slots */}
        {slots.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-slate-900 p-8 text-center">
            <p className="text-slate-400 text-sm mb-2">No volunteer slots configured for this event.</p>
            <p className="text-slate-500 text-xs">
              Add volunteer slots when editing the event.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {slots.map(slot => (
              <SlotCard
                key={slot.id}
                slot={slot}
                eventId={eventId}
                eventLabel={eventLabel}
                eventDate={eventDate}
                programName={programName}
                contacts={contacts}
                onSlotChange={handleSlotChange}
                onSlotDeleted={handleSlotDeleted}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
