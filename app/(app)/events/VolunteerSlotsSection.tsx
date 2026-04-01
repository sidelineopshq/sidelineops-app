'use client'

import { useState } from 'react'

export type VolunteerRole = { id: string; name: string }
export type VolunteerSlot = {
  id?:               string  // set when loaded from DB (edit form)
  volunteer_role_id: string
  slot_count:        number
  start_time:        string
  end_time:          string
  notes:             string
}

const inputClass     = "w-full rounded-xl border border-white/10 bg-slate-800 px-4 py-2.5 text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none text-sm"
const labelClass     = "block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5"
const timeInputClass = "w-full rounded-xl border border-white/10 bg-slate-800 px-4 py-2.5 text-white focus:border-sky-500 focus:outline-none text-sm"

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

export function VolunteerSlotsSection({
  roles,
  slots,
  onChange,
}: {
  roles:    VolunteerRole[]
  slots:    VolunteerSlot[]
  onChange: (slots: VolunteerSlot[]) => void
}) {
  const [showForm,  setShowForm]  = useState(false)
  const [roleId,    setRoleId]    = useState(roles[0]?.id ?? '')
  const [count,     setCount]     = useState(1)
  const [startTime, setStartTime] = useState('')
  const [endTime,   setEndTime]   = useState('')
  const [slotNotes, setSlotNotes] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  function resetForm() {
    setRoleId(roles[0]?.id ?? '')
    setCount(1)
    setStartTime('')
    setEndTime('')
    setSlotNotes('')
    setFormError(null)
  }

  function handleAdd() {
    if (!roleId) { setFormError('Please select a role'); return }
    if (count < 1) { setFormError('At least 1 volunteer is required'); return }
    setFormError(null)
    onChange([...slots, {
      volunteer_role_id: roleId,
      slot_count:        count,
      start_time: startTime,
      end_time:   endTime,
      notes:      slotNotes,
    }])
    resetForm()
    setShowForm(false)
  }

  function removeSlot(index: number) {
    onChange(slots.filter((_, i) => i !== index))
  }

  if (roles.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-slate-900/50 px-4 py-4 text-sm text-slate-500">
        No volunteer roles configured.{' '}
        <a href="/settings/team?tab=volunteer-roles" className="text-sky-400 hover:text-sky-300 underline">
          Add roles in Team Settings → Volunteer Roles
        </a>.
      </div>
    )
  }

  return (
    <div className="space-y-3">

      {/* ── Existing slot list ──────────────────────────────────────────────── */}
      {slots.length > 0 && (
        <div className="divide-y divide-white/5 rounded-xl border border-white/10 overflow-hidden">
          {slots.map((slot, i) => {
            const roleName = roles.find(r => r.id === slot.volunteer_role_id)?.name ?? 'Unknown Role'
            const label    = slotLabel(roleName, slot.start_time || null, slot.end_time || null)
            return (
              <div key={i} className="flex items-start justify-between gap-4 px-4 py-3 bg-slate-900">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-white">{label}</span>
                    <span className="text-xs bg-sky-500/20 text-sky-300 px-2 py-0.5 rounded-full">
                      {slot.slot_count} {slot.slot_count === 1 ? 'volunteer' : 'volunteers'} needed
                    </span>
                  </div>
                  {slot.notes && (
                    <p className="text-xs text-slate-500 mt-0.5">{slot.notes}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => removeSlot(i)}
                  className="shrink-0 text-xs text-slate-500 hover:text-red-400 transition-colors mt-0.5"
                >
                  Remove
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Add slot form / Add button ──────────────────────────────────────── */}
      {showForm ? (
        <div className="rounded-xl border border-white/10 bg-slate-900 p-4 space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
            <div>
              <label className={labelClass}>Role</label>
              <select
                value={roleId}
                onChange={e => setRoleId(e.target.value)}
                className={inputClass}
                style={{ appearance: 'auto' }}
              >
                <option value="">Select a role…</option>
                {roles.map(r => (
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
                className="w-20 rounded-xl border border-white/10 bg-slate-800 px-4 py-2.5 text-white focus:border-sky-500 focus:outline-none text-sm text-center"
              />
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
            <div className="flex-1">
              <label className={labelClass}>
                Start Time <span className="normal-case font-normal text-slate-500">(optional)</span>
              </label>
              <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className={timeInputClass} />
            </div>
            <div className="flex-1">
              <label className={labelClass}>
                End Time <span className="normal-case font-normal text-slate-500">(optional)</span>
              </label>
              <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className={timeInputClass} />
            </div>
          </div>

          <div>
            <label className={labelClass}>
              Notes <span className="normal-case font-normal text-slate-500">(optional)</span>
            </label>
            <input
              type="text"
              value={slotNotes}
              onChange={e => setSlotNotes(e.target.value)}
              placeholder="Any notes for volunteers in this role"
              className={inputClass}
            />
          </div>

          {formError && <p className="text-sm text-red-400">{formError}</p>}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleAdd}
              className="rounded-xl bg-sky-600 hover:bg-sky-500 px-4 py-2 text-sm font-semibold transition-colors"
            >
              Add Slot
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); resetForm() }}
              className="rounded-xl border border-white/10 hover:bg-white/5 px-4 py-2 text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="w-full rounded-xl border border-dashed border-white/20 hover:border-white/40 px-4 py-2.5 text-sm text-slate-400 hover:text-white transition-colors"
        >
          + Add Volunteer Slot
        </button>
      )}
    </div>
  )
}
