'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  addVolunteerRole,
  updateVolunteerRole,
  deactivateVolunteerRole,
  reactivateVolunteerRole,
  setSuppressReminders,
  createStandingAssignment,
  removeStandingAssignment,
  addDefaultVolunteerRoles,
} from './actions'
import {
  createTemplateSlot,
  updateTemplateSlot,
  removeTemplateSlot,
  applyTemplateToRemainingGames,
  deleteVolunteerRole,
} from '@/app/actions/volunteers'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface VolunteerRole {
  id:                 string
  name:               string
  description:        string | null
  is_active:          boolean
  suppress_reminders: boolean
}

export interface StandingAssignment {
  id:               string
  volunteer_role_id: string
  role_name:        string
  contact_id:       string | null
  display_name:     string
  display_email:    string | null
}

export interface TabContact {
  id:         string
  first_name: string
  last_name:  string | null
  email:      string | null
}

export interface TemplateSlot {
  id:                string
  volunteer_role_id: string
  role_name:         string
  slot_count:        number
  start_time:        string | null
  end_time:          string | null
  notes:             string | null
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function Toast({ message, variant = 'success', onDismiss }: {
  message:  string
  variant?: 'success' | 'error'
  onDismiss: () => void
}) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 5000)
    return () => clearTimeout(t)
  }, [onDismiss])

  const isError = variant === 'error'
  return (
    <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-2xl border bg-slate-900 px-5 py-3 shadow-2xl shadow-black/40 ${
      isError
        ? 'border-red-500/30 ring-1 ring-red-500/20'
        : 'border-green-500/30 ring-1 ring-green-500/20'
    }`}>
      <span className={`text-base ${isError ? 'text-red-400' : 'text-green-400'}`}>
        {isError ? '!' : '✓'}
      </span>
      <p className="text-sm font-medium text-slate-100 whitespace-nowrap">{message}</p>
      <button onClick={onDismiss} className="ml-1 text-slate-500 hover:text-slate-300 text-lg leading-none">×</button>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const inputClass     = "w-full rounded-xl border border-white/10 bg-slate-800 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none"
const labelClass     = "block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5"
const timeInputClass = "w-full rounded-xl border border-white/10 bg-slate-800 px-4 py-2.5 text-sm text-white focus:border-sky-500 focus:outline-none"

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(time: string | null): string {
  if (!time) return ''
  const [h, m] = time.split(':')
  const hour = parseInt(h)
  return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`
}

function slotLabel(roleName: string, startTime: string | null, endTime: string | null): string {
  if (!startTime && !endTime) return roleName
  const parts = [startTime && formatTime(startTime), endTime && formatTime(endTime)].filter(Boolean)
  return `${roleName} (${parts.join(' – ')})`
}

// ── Template Slot Modal ───────────────────────────────────────────────────────

function TemplateSlotModal({
  programId,
  activeRoles,
  initial,
  onClose,
  onSaved,
}: {
  programId:   string
  activeRoles: VolunteerRole[]
  initial?:    TemplateSlot
  onClose:     () => void
  onSaved:     () => void
}) {
  const [roleId,    setRoleId]    = useState(initial?.volunteer_role_id ?? activeRoles[0]?.id ?? '')
  const [count,     setCount]     = useState(initial?.slot_count ?? 1)
  const [startTime, setStartTime] = useState(initial?.start_time ?? '')
  const [endTime,   setEndTime]   = useState(initial?.end_time   ?? '')
  const [notes,     setNotes]     = useState(initial?.notes      ?? '')
  const [error,     setError]     = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSave() {
    if (!roleId) { setError('Please select a role.'); return }
    if (count < 1) { setError('At least 1 volunteer is required.'); return }
    setError(null)
    startTransition(async () => {
      const data = {
        volunteer_role_id: roleId,
        slot_count:        count,
        start_time: startTime || undefined,
        end_time:   endTime   || undefined,
        notes:      notes.trim() || undefined,
      }
      const result = initial
        ? await updateTemplateSlot(initial.id, data)
        : await createTemplateSlot(programId, data)
      if (result?.error) {
        setError(result.error)
      } else {
        onSaved()
        onClose()
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-bold">{initial ? 'Edit Template Slot' : 'Add Template Slot'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl leading-none">×</button>
        </div>

        <div className="space-y-4">
          <div>
            <label className={labelClass}>Role</label>
            <select
              value={roleId}
              onChange={e => setRoleId(e.target.value)}
              className={inputClass}
              style={{ appearance: 'auto' }}
            >
              <option value="">Select a role…</option>
              {activeRoles.map(r => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>Volunteers Needed</label>
            <input
              type="number"
              min={1}
              max={99}
              value={count}
              onChange={e => setCount(Math.max(1, Number(e.target.value)))}
              onFocus={e => e.target.select()}
              className="w-24 rounded-xl border border-white/10 bg-slate-800 px-4 py-2.5 text-sm text-white focus:border-sky-500 focus:outline-none text-center"
            />
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <label className={labelClass}>
                Start Time <span className="normal-case font-normal text-slate-500">(optional)</span>
              </label>
              <input
                type="time"
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
                className={timeInputClass}
              />
            </div>
            <div className="flex-1">
              <label className={labelClass}>
                End Time <span className="normal-case font-normal text-slate-500">(optional)</span>
              </label>
              <input
                type="time"
                value={endTime}
                onChange={e => setEndTime(e.target.value)}
                className={timeInputClass}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>
              Notes <span className="normal-case font-normal text-slate-500">(optional)</span>
            </label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Any notes for volunteers in this role"
              className={inputClass}
            />
          </div>
        </div>

        {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

        <div className="flex gap-3 mt-5">
          <button
            onClick={handleSave}
            disabled={isPending}
            className="flex-1 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 px-4 py-2.5 text-sm font-semibold transition-colors"
          >
            {isPending ? 'Saving…' : initial ? 'Save Changes' : 'Add to Template'}
          </button>
          <button
            onClick={onClose}
            disabled={isPending}
            className="rounded-xl border border-white/10 hover:bg-white/5 disabled:opacity-50 px-4 py-2.5 text-sm font-semibold transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Add Standing Volunteer Modal ──────────────────────────────────────────────

function AddStandingModal({
  programId,
  activeRoles,
  contacts,
  onClose,
  onSaved,
}: {
  programId:   string
  activeRoles: VolunteerRole[]
  contacts:    TabContact[]
  onClose:     () => void
  onSaved:     () => void
}) {
  const [roleId, setRoleId]       = useState(activeRoles[0]?.id ?? '')
  const [source, setSource]       = useState<'contact' | 'external'>('contact')
  const [query, setQuery]         = useState('')
  const [selectedContact, setSelectedContact] = useState<TabContact | null>(null)
  const [extName, setExtName]     = useState('')
  const [extEmail, setExtEmail]   = useState('')
  const [error, setError]         = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const filtered = query.trim().length > 0 && !selectedContact
    ? contacts.filter(c => {
        const full = `${c.first_name} ${c.last_name ?? ''}`.toLowerCase()
        return full.includes(query.toLowerCase()) ||
          (c.email ?? '').toLowerCase().includes(query.toLowerCase())
      }).slice(0, 8)
    : []

  function handleSelectContact(c: TabContact) {
    setSelectedContact(c)
    setQuery(`${c.first_name} ${c.last_name ?? ''}`.trim())
  }

  function handleSave() {
    setError(null)
    if (!roleId) { setError('Please select a role.'); return }

    if (source === 'contact' && !selectedContact) {
      setError('Please select a contact.'); return
    }
    if (source === 'external' && !extName.trim()) {
      setError('Name is required.'); return
    }

    startTransition(async () => {
      const result = await createStandingAssignment(
        programId,
        roleId,
        source === 'contact' && selectedContact
          ? { contact_id: selectedContact.id }
          : { volunteer_name: extName.trim(), volunteer_email: extEmail.trim() || undefined },
      )
      if (result?.error) {
        setError(result.error)
      } else {
        onSaved()
        onClose()
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-bold">Add Standing Volunteer</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl leading-none">×</button>
        </div>

        <div className="space-y-4">
          {/* Role */}
          <div>
            <label className={labelClass}>Role</label>
            <select
              value={roleId}
              onChange={e => setRoleId(e.target.value)}
              className={inputClass}
              style={{ appearance: 'auto' }}
            >
              {activeRoles.map(r => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>

          {/* Source toggle */}
          <div>
            <label className={labelClass}>Assign From</label>
            <div className="flex gap-1 p-1 bg-slate-800 rounded-xl">
              <button
                onClick={() => { setSource('contact'); setError(null) }}
                className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition-colors ${
                  source === 'contact' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Existing Contact
              </button>
              <button
                onClick={() => { setSource('external'); setSelectedContact(null); setQuery(''); setError(null) }}
                className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition-colors ${
                  source === 'external' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                External Person
              </button>
            </div>
          </div>

          {/* Contact search */}
          {source === 'contact' && (
            <div className="relative">
              <label className={labelClass}>Search Contact</label>
              <input
                type="text"
                value={query}
                onChange={e => { setQuery(e.target.value); setSelectedContact(null) }}
                placeholder="Search by name or email…"
                className={inputClass}
                autoFocus
              />
              {filtered.length > 0 && (
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
              {selectedContact && (
                <div className="mt-2 rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-3">
                  <p className="text-sm font-semibold text-white">
                    {selectedContact.first_name} {selectedContact.last_name ?? ''}
                  </p>
                  {selectedContact.email && (
                    <p className="text-xs text-slate-400 mt-0.5">{selectedContact.email}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* External person */}
          {source === 'external' && (
            <div className="space-y-3">
              <div>
                <label className={labelClass}>Name <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  value={extName}
                  onChange={e => setExtName(e.target.value)}
                  placeholder="Jane Smith"
                  className={inputClass}
                  autoFocus
                />
              </div>
              <div>
                <label className={labelClass}>
                  Email <span className="normal-case font-normal text-slate-500">(optional)</span>
                </label>
                <input
                  type="email"
                  value={extEmail}
                  onChange={e => setExtEmail(e.target.value)}
                  placeholder="jane@example.com"
                  className={inputClass}
                />
              </div>
            </div>
          )}
        </div>

        {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

        <div className="flex gap-3 mt-5">
          <button
            onClick={handleSave}
            disabled={isPending}
            className="flex-1 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 px-4 py-2.5 text-sm font-semibold transition-colors"
          >
            {isPending ? 'Saving…' : 'Save'}
          </button>
          <button
            onClick={onClose}
            disabled={isPending}
            className="rounded-xl border border-white/10 hover:bg-white/5 disabled:opacity-50 px-4 py-2.5 text-sm font-semibold transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Tab Component ────────────────────────────────────────────────────────

export function VolunteerRolesTab({
  programId,
  roles,
  standingAssignments,
  contacts,
  canManage,
  templateSlots: initialTemplateSlots,
}: {
  programId:           string
  roles:               VolunteerRole[]
  standingAssignments: StandingAssignment[]
  contacts:            TabContact[]
  canManage:           boolean
  templateSlots:       TemplateSlot[]
}) {
  const router = useRouter()

  // ── Roles: add form ───────────────────────────────────────────────────────
  const [newName,    setNewName]    = useState('')
  const [newDesc,    setNewDesc]    = useState('')
  const [addError,   setAddError]   = useState<string | null>(null)
  const [addPending, startAdd]      = useTransition()

  // ── Roles: edit state ─────────────────────────────────────────────────────
  const [editingId,   setEditingId]   = useState<string | null>(null)
  const [editName,    setEditName]    = useState('')
  const [editDesc,    setEditDesc]    = useState('')
  const [editError,   setEditError]   = useState<string | null>(null)
  const [editPending, startEdit]      = useTransition()

  // ── Roles: toggle (deactivate / reactivate) ───────────────────────────────
  const [togglePending,   startToggle]   = useTransition()
  const [suppressPending, startSuppress] = useTransition()

  // ── Roles: delete ─────────────────────────────────────────────────────────
  const [deletingRole,  setDeletingRole]  = useState<VolunteerRole | null>(null)
  const [deleteError,   setDeleteError]   = useState<string | null>(null)
  const [deletePending, startDelete]      = useTransition()

  // ── Default roles ─────────────────────────────────────────────────────────
  const [defaultsPending, startDefaults] = useTransition()
  const [defaultsError,   setDefaultsError] = useState<string | null>(null)

  // ── General toast ─────────────────────────────────────────────────────────
  const [roleToast, setRoleToast] = useState<string | null>(null)

  // ── Standing: remove + modal ─────────────────────────────────────────────
  const [removePending, startRemove]     = useTransition()
  const [showAddModal,  setShowAddModal] = useState(false)

  // ── Template slots ────────────────────────────────────────────────────────
  const [templateSlots,    setTemplateSlots]    = useState<TemplateSlot[]>(initialTemplateSlots)
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [editingTemplate,  setEditingTemplate]  = useState<TemplateSlot | undefined>(undefined)
  const [removingTplId,    setRemovingTplId]    = useState<string | null>(null)

  // ── Apply template ────────────────────────────────────────────────────────
  const [showApplyConfirm,  setShowApplyConfirm]  = useState(false)
  const [applyPending,      startApply]           = useTransition()
  const [applyResult,       setApplyResult]       = useState<{ eventsProcessed: number; slotsAdded: number; slotsSkipped: number } | null>(null)
  const [applyErrorToast,   setApplyErrorToast]   = useState<string | null>(null)

  async function handleRemoveTemplate(id: string) {
    setRemovingTplId(id)
    await removeTemplateSlot(id)
    setRemovingTplId(null)
    setTemplateSlots(prev => prev.filter(s => s.id !== id))
    router.refresh()
  }

  function openEdit(role: VolunteerRole) {
    setEditingId(role.id)
    setEditName(role.name)
    setEditDesc(role.description ?? '')
    setEditError(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditError(null)
  }

  function handleAdd() {
    if (!newName.trim()) { setAddError('Role name is required'); return }
    setAddError(null)
    startAdd(async () => {
      const result = await addVolunteerRole(programId, newName, newDesc)
      if (result?.error) {
        setAddError(result.error)
      } else {
        setNewName('')
        setNewDesc('')
        router.refresh()
      }
    })
  }

  function handleSaveEdit() {
    if (!editName.trim()) { setEditError('Role name is required'); return }
    setEditError(null)
    startEdit(async () => {
      const result = await updateVolunteerRole(editingId!, editName, editDesc)
      if (result?.error) {
        setEditError(result.error)
      } else {
        setEditingId(null)
        router.refresh()
      }
    })
  }

  function handleToggle(role: VolunteerRole) {
    startToggle(async () => {
      if (role.is_active) {
        await deactivateVolunteerRole(role.id)
      } else {
        await reactivateVolunteerRole(role.id)
      }
      router.refresh()
    })
  }

  function handleSuppressToggle(role: VolunteerRole) {
    startSuppress(async () => {
      await setSuppressReminders(role.id, !role.suppress_reminders)
      router.refresh()
    })
  }

  function handleRemoveStanding(id: string) {
    startRemove(async () => {
      await removeStandingAssignment(id)
      router.refresh()
    })
  }

  function openDeleteConfirm(role: VolunteerRole) {
    setDeletingRole(role)
    setDeleteError(null)
  }

  function handleConfirmDelete() {
    if (!deletingRole) return
    startDelete(async () => {
      const result = await deleteVolunteerRole(deletingRole.id)
      if ('error' in result) {
        if (result.error === 'has_assignments') {
          setDeleteError(
            `This role has ${result.count ?? 'existing'} volunteer assignment${(result.count ?? 0) !== 1 ? 's' : ''} and cannot be deleted. Deactivate it to hide it from future events.`
          )
        } else {
          setDeleteError(result.error)
        }
      } else {
        const name = deletingRole.name
        setDeletingRole(null)
        setDeleteError(null)
        setRoleToast(`${name} deleted`)
        router.refresh()
      }
    })
  }

  function handleAddDefaults() {
    setDefaultsError(null)
    startDefaults(async () => {
      const result = await addDefaultVolunteerRoles(programId)
      if (result?.error) {
        setDefaultsError(result.error)
      } else {
        router.refresh()
      }
    })
  }

  const activeRoles = roles.filter(r => r.is_active)

  return (
    <div className="space-y-4">

      {/* ── Toasts ───────────────────────────────────────────────────────── */}
      {applyResult && (
        <Toast
          message={`Done — ${applyResult.slotsAdded} slot${applyResult.slotsAdded !== 1 ? 's' : ''} added across ${applyResult.eventsProcessed} game${applyResult.eventsProcessed !== 1 ? 's' : ''}`}
          onDismiss={() => setApplyResult(null)}
        />
      )}
      {applyErrorToast && (
        <Toast
          message={applyErrorToast}
          variant="error"
          onDismiss={() => setApplyErrorToast(null)}
        />
      )}
      {roleToast && (
        <Toast
          message={roleToast}
          onDismiss={() => setRoleToast(null)}
        />
      )}

      {/* ── Apply template confirmation dialog ───────────────────────────── */}
      {showApplyConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white mb-3">Apply Template to Remaining Home Games?</h3>
            <p className="text-sm text-slate-300 mb-5">
              This will add your volunteer template slots to all upcoming home games. Standing volunteers will be automatically assigned to matching roles. Template slots will be added alongside any existing slots.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row-reverse">
              <button
                onClick={() => {
                  startApply(async () => {
                    const result = await applyTemplateToRemainingGames(programId)
                    setShowApplyConfirm(false)
                    if ('error' in result) {
                      setApplyErrorToast('Something went wrong. Please try again.')
                    } else {
                      setApplyResult(result)
                    }
                  })
                }}
                disabled={applyPending}
                className="flex-1 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 px-4 py-2.5 text-sm font-semibold transition-colors"
              >
                {applyPending ? 'Applying…' : 'Apply Now'}
              </button>
              <button
                onClick={() => setShowApplyConfirm(false)}
                disabled={applyPending}
                className="flex-1 rounded-xl border border-white/10 hover:bg-white/5 disabled:opacity-50 px-4 py-2.5 text-sm font-semibold transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete role confirmation dialog ──────────────────────────────── */}
      {deletingRole && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
            {deleteError ? (
              <>
                <h3 className="text-base font-bold text-white mb-3">Cannot Delete Role</h3>
                <p className="text-sm text-slate-300 mb-5">{deleteError}</p>
                <button
                  onClick={() => { setDeletingRole(null); setDeleteError(null) }}
                  className="w-full rounded-xl border border-white/10 hover:bg-white/5 px-4 py-2.5 text-sm font-semibold transition-colors"
                >
                  Close
                </button>
              </>
            ) : (
              <>
                <h3 className="text-base font-bold text-white mb-3">
                  Delete {deletingRole.name}?
                </h3>
                <p className="text-sm text-slate-300 mb-5">
                  {templateSlots.some(s => s.volunteer_role_id === deletingRole.id)
                    ? 'This will also remove it from your home game template. This cannot be undone.'
                    : 'This cannot be undone.'}
                </p>
                <div className="flex flex-col gap-2 sm:flex-row-reverse">
                  <button
                    onClick={handleConfirmDelete}
                    disabled={deletePending}
                    className="flex-1 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 px-4 py-2.5 text-sm font-semibold transition-colors"
                  >
                    {deletePending ? 'Deleting…' : 'Delete'}
                  </button>
                  <button
                    onClick={() => { setDeletingRole(null); setDeleteError(null) }}
                    disabled={deletePending}
                    className="flex-1 rounded-xl border border-white/10 hover:bg-white/5 disabled:opacity-50 px-4 py-2.5 text-sm font-semibold transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Template Slot Modal ───────────────────────────────────────────── */}
      {showTemplateModal && (
        <TemplateSlotModal
          programId={programId}
          activeRoles={activeRoles}
          initial={editingTemplate}
          onClose={() => { setShowTemplateModal(false); setEditingTemplate(undefined) }}
          onSaved={() => { router.refresh() }}
        />
      )}

      {/* ── Add Standing Volunteer Modal ──────────────────────────────────── */}
      {showAddModal && (
        <AddStandingModal
          programId={programId}
          activeRoles={activeRoles}
          contacts={contacts}
          onClose={() => setShowAddModal(false)}
          onSaved={() => router.refresh()}
        />
      )}

      {/* ── Role list ──────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-white/10 bg-slate-900 overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-sky-400">Volunteer Roles</h2>
          <p className="text-slate-400 text-xs mt-1">Roles available for volunteer sign-ups across your program.</p>
        </div>

        {roles.length === 0 ? (
          <div className="px-6 py-6 space-y-4">
            <p className="text-sm text-slate-400">
              No volunteer roles yet. Add your first role below, or click{' '}
              <strong className="text-white">Add Default Roles</strong> to get started with common roles.
            </p>
            {canManage && (
              <div>
                <button
                  onClick={handleAddDefaults}
                  disabled={defaultsPending}
                  className="rounded-xl border border-sky-500/40 bg-sky-500/10 hover:bg-sky-500/20 disabled:opacity-50 px-4 py-2 text-sm font-semibold text-sky-400 transition-colors"
                >
                  {defaultsPending ? 'Adding…' : 'Add Default Roles'}
                </button>
                {defaultsError && <p className="mt-2 text-xs text-red-400">{defaultsError}</p>}
              </div>
            )}
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {roles.map(role => (
              <div key={role.id} className="px-6 py-4">

                {editingId === role.id ? (
                  /* ── Inline edit form ── */
                  <div className="space-y-3">
                    <div>
                      <label className={labelClass}>Role Name</label>
                      <input
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        className={inputClass}
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className={labelClass}>
                        Description <span className="normal-case font-normal text-slate-500">(optional)</span>
                      </label>
                      <input
                        value={editDesc}
                        onChange={e => setEditDesc(e.target.value)}
                        placeholder="Brief description of the role"
                        className={inputClass}
                      />
                    </div>
                    {editError && <p className="text-sm text-red-400">{editError}</p>}
                    <div className="flex gap-2">
                      <button
                        onClick={handleSaveEdit}
                        disabled={editPending}
                        className="rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 px-4 py-2 text-sm font-semibold transition-colors"
                      >
                        {editPending ? 'Saving…' : 'Save'}
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="rounded-xl border border-white/10 hover:bg-white/5 px-4 py-2 text-sm transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  /* ── Read-only row ── */
                  <div className="space-y-2">
                    {/* Role name + inactive badge */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-base font-semibold ${role.is_active ? 'text-white' : 'text-slate-500'}`}>
                        {role.name}
                      </span>
                      {!role.is_active && (
                        <span className="text-xs bg-slate-700/70 text-slate-400 px-2 py-0.5 rounded-full">
                          Inactive
                        </span>
                      )}
                    </div>
                    {role.description && (
                      <p className={`text-xs ${role.is_active ? 'text-slate-400' : 'text-slate-600'}`}>
                        {role.description}
                      </p>
                    )}

                    {/* Action buttons — full-width row below name */}
                    {canManage && (
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => openEdit(role)}
                          disabled={togglePending || suppressPending || !!editingId}
                          className="text-sm text-slate-400 hover:text-white transition-colors disabled:opacity-40"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleToggle(role)}
                          disabled={togglePending || suppressPending || !!editingId}
                          className={`text-sm transition-colors disabled:opacity-40 ${
                            role.is_active
                              ? 'text-amber-400 hover:text-amber-300'
                              : 'text-sky-400 hover:text-sky-300'
                          }`}
                        >
                          {role.is_active ? 'Deactivate' : 'Reactivate'}
                        </button>
                        <button
                          onClick={() => openDeleteConfirm(role)}
                          disabled={togglePending || suppressPending || !!editingId || deletePending}
                          className="text-sm text-red-500 hover:text-red-400 transition-colors disabled:opacity-40"
                        >
                          Delete
                        </button>
                      </div>
                    )}

                    {/* Suppress reminders toggle */}
                    {canManage && (
                      <div className="flex items-start justify-between gap-4 rounded-xl border border-white/5 bg-slate-800/40 px-3 py-2">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-300">Suppress reminder emails</p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            For recurring roles like Announcer where reminders aren't needed.
                          </p>
                        </div>
                        <button
                          role="switch"
                          aria-checked={role.suppress_reminders}
                          onClick={() => handleSuppressToggle(role)}
                          disabled={suppressPending || togglePending || !!editingId}
                          className={`shrink-0 mt-0.5 relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-40 focus:outline-none ${
                            role.suppress_reminders ? 'bg-sky-600' : 'bg-slate-600'
                          }`}
                        >
                          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                            role.suppress_reminders ? 'translate-x-4' : 'translate-x-1'
                          }`} />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Add Role form ──────────────────────────────────────────────────── */}
      {canManage && (
        <div className="rounded-2xl border border-white/10 bg-slate-900 overflow-hidden">
          <div className="px-6 py-4 border-b border-white/10">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-sky-400">Add Role</h2>
          </div>
          <div className="px-6 py-5 space-y-4">
            <div>
              <label className={labelClass}>Role Name</label>
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="e.g. Chain Gang"
                className={inputClass}
                onKeyDown={e => e.key === 'Enter' && handleAdd()}
              />
            </div>
            <div>
              <label className={labelClass}>
                Description <span className="normal-case font-normal text-slate-500">(optional)</span>
              </label>
              <input
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
                placeholder="Brief description of the role"
                className={inputClass}
                onKeyDown={e => e.key === 'Enter' && handleAdd()}
              />
            </div>
            {addError && <p className="text-sm text-red-400">{addError}</p>}
            <button
              onClick={handleAdd}
              disabled={addPending}
              className="rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 px-5 py-2.5 text-sm font-semibold transition-colors"
            >
              {addPending ? 'Adding…' : 'Add Role'}
            </button>
          </div>
        </div>
      )}

      {/* ── Home Game Volunteer Template ────────────────────────────────────── */}
      <div className="rounded-2xl border border-white/10 bg-slate-900 overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-sky-400">Home Game Volunteer Template</h2>
              <p className="text-slate-400 text-xs mt-1">
                These slots auto-populate every time a home game is created.
              </p>
            </div>
            {/* Desktop: button inline in header */}
            {canManage && activeRoles.length > 0 && (
              <button
                onClick={() => { setEditingTemplate(undefined); setShowTemplateModal(true) }}
                className="hidden sm:block shrink-0 rounded-xl bg-sky-600 hover:bg-sky-500 px-4 py-2 text-xs font-semibold transition-colors"
              >
                + Add Template Slot
              </button>
            )}
          </div>
          {/* Mobile: full-width button below description */}
          {canManage && activeRoles.length > 0 && (
            <button
              onClick={() => { setEditingTemplate(undefined); setShowTemplateModal(true) }}
              className="sm:hidden mt-3 w-full rounded-xl bg-sky-600 hover:bg-sky-500 px-4 py-2 text-sm font-semibold transition-colors text-center"
            >
              + Add Template Slot
            </button>
          )}
        </div>

        {templateSlots.length === 0 ? (
          <p className="px-6 py-6 text-sm text-slate-500">
            No template slots yet.{activeRoles.length === 0 ? ' Add volunteer roles first.' : ''}
          </p>
        ) : (
          <>
            {/* Mobile: card layout */}
            <div className="block sm:hidden divide-y divide-white/5">
              {templateSlots.map(ts => {
                const timeStr = [ts.start_time && formatTime(ts.start_time), ts.end_time && formatTime(ts.end_time)].filter(Boolean).join(' \u2013 ')
                return (
                  <div key={ts.id} className="px-4 py-3">
                    {/* Row 1: role name + edit/delete */}
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium text-white">{ts.role_name}</span>
                      {canManage && (
                        <div className="flex shrink-0 items-center gap-3">
                          <button
                            onClick={() => { setEditingTemplate(ts); setShowTemplateModal(true) }}
                            className="text-sm text-slate-400 hover:text-white transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleRemoveTemplate(ts.id)}
                            disabled={removingTplId === ts.id}
                            className="text-sm text-red-400 hover:text-red-300 transition-colors disabled:opacity-40"
                          >
                            {removingTplId === ts.id ? '…' : '×'}
                          </button>
                        </div>
                      )}
                    </div>
                    {/* Row 2: count · time range */}
                    <p className="text-sm text-slate-400 mt-0.5">
                      {ts.slot_count} volunteer{ts.slot_count !== 1 ? 's' : ''}
                      {timeStr && ` \u00b7 ${timeStr}`}
                    </p>
                    {/* Row 3: notes */}
                    {ts.notes && (
                      <p className="text-xs text-slate-500 italic mt-0.5">{ts.notes}</p>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Desktop: table layout */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Role</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide"># Volunteers</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Start Time</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">End Time</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Notes</th>
                    {canManage && <th className="px-4 py-3" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {templateSlots.map(ts => (
                    <tr key={ts.id}>
                      <td className="px-6 py-3 font-medium text-white whitespace-nowrap">{ts.role_name}</td>
                      <td className="px-4 py-3 text-slate-300">{ts.slot_count}</td>
                      <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                        {ts.start_time ? formatTime(ts.start_time) : <span className="text-slate-600">—</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                        {ts.end_time ? formatTime(ts.end_time) : <span className="text-slate-600">—</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-400 max-w-[160px] truncate">
                        {ts.notes ?? <span className="text-slate-600">—</span>}
                      </td>
                      {canManage && (
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => { setEditingTemplate(ts); setShowTemplateModal(true) }}
                              className="text-xs text-slate-400 hover:text-white transition-colors px-2.5 py-1.5 rounded-lg hover:bg-white/5"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleRemoveTemplate(ts.id)}
                              disabled={removingTplId === ts.id}
                              className="text-xs text-red-400 hover:text-red-300 transition-colors px-2.5 py-1.5 rounded-lg hover:bg-red-500/10 disabled:opacity-40"
                            >
                              {removingTplId === ts.id ? 'Removing…' : 'Remove'}
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ── Apply to remaining home games ──────────────────────────────── */}
        {canManage && templateSlots.length > 0 && (
          <div className="border-t border-white/10 px-6 py-4">
            <button
              onClick={() => setShowApplyConfirm(true)}
              disabled={applyPending}
              className="w-full flex items-center justify-center gap-2 rounded-xl border border-white/20 hover:border-sky-500/40 hover:bg-sky-500/5 px-4 py-2.5 text-sm font-semibold text-slate-300 hover:text-white transition-colors disabled:opacity-50"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 shrink-0">
                <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
              </svg>
              {applyPending ? 'Applying…' : 'Apply to Remaining Home Games'}
            </button>
            <p className="mt-2 text-xs text-slate-500 text-center">
              Adds all template slots to upcoming home games. Standing volunteers will be auto-assigned to matching roles.
            </p>
          </div>
        )}
      </div>

      {/* ── Standing Volunteers ────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-white/10 bg-slate-900 overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-sky-400">Standing Volunteers</h2>
              <p className="text-slate-400 text-xs mt-1">
                Auto-assigned to every home game for their role.
              </p>
            </div>
            {/* Desktop: button inline in header */}
            {canManage && activeRoles.length > 0 && (
              <button
                onClick={() => setShowAddModal(true)}
                className="hidden sm:block shrink-0 rounded-xl bg-sky-600 hover:bg-sky-500 px-4 py-2 text-xs font-semibold transition-colors"
              >
                + Add Standing Volunteer
              </button>
            )}
          </div>
          {/* Mobile: full-width button below description, above cards */}
          {canManage && activeRoles.length > 0 && (
            <button
              onClick={() => setShowAddModal(true)}
              className="sm:hidden mt-3 w-full rounded-xl bg-sky-600 hover:bg-sky-500 px-4 py-2 text-sm font-semibold transition-colors text-center"
            >
              + Add Standing Volunteer
            </button>
          )}
        </div>

        {standingAssignments.length === 0 ? (
          <p className="px-6 py-6 text-sm text-slate-500">
            No standing volunteers yet.
            {activeRoles.length === 0 ? ' Add volunteer roles first.' : ''}
          </p>
        ) : (
          <>
            {/* Mobile: card layout */}
            <div className="block sm:hidden divide-y divide-white/5">
              {standingAssignments.map(sa => (
                <div key={sa.id} className="px-4 py-3">
                  {/* Row 1: name + remove */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-white">{sa.display_name}</span>
                    {canManage && (
                      <button
                        onClick={() => handleRemoveStanding(sa.id)}
                        disabled={removePending}
                        className="shrink-0 text-sm text-red-400 hover:text-red-300 transition-colors disabled:opacity-40"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  {/* Row 2: email */}
                  {sa.display_email && (
                    <p className="text-sm text-slate-400 mt-0.5 break-all">{sa.display_email}</p>
                  )}
                  {/* Row 3: role badge */}
                  <div className="mt-1">
                    <span className="rounded-full border border-white/15 px-2.5 py-0.5 text-xs font-semibold text-slate-300">
                      {sa.role_name}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop: table layout */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Email</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Role</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Source</th>
                    {canManage && <th className="px-4 py-3" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {standingAssignments.map(sa => (
                    <tr key={sa.id}>
                      <td className="px-6 py-3 font-medium text-white whitespace-nowrap">{sa.display_name}</td>
                      <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                        {sa.display_email ?? <span className="text-slate-600">—</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-300 whitespace-nowrap">{sa.role_name}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                          sa.contact_id
                            ? 'border-sky-500/30 bg-sky-500/10 text-sky-400'
                            : 'border-white/10 bg-slate-800 text-slate-400'
                        }`}>
                          {sa.contact_id ? 'Contact' : 'External'}
                        </span>
                      </td>
                      {canManage && (
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => handleRemoveStanding(sa.id)}
                            disabled={removePending}
                            className="text-xs text-red-400 hover:text-red-300 transition-colors disabled:opacity-40"
                          >
                            Remove
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

    </div>
  )
}
