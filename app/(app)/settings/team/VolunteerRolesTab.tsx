'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  addVolunteerRole,
  updateVolunteerRole,
  deactivateVolunteerRole,
  reactivateVolunteerRole,
} from './actions'

export interface VolunteerRole {
  id:          string
  name:        string
  description: string | null
  is_active:   boolean
}

const inputClass = "w-full rounded-xl border border-white/10 bg-slate-800 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none"
const labelClass = "block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5"

export function VolunteerRolesTab({
  programId,
  roles,
  canManage,
}: {
  programId: string
  roles:     VolunteerRole[]
  canManage: boolean
}) {
  const router = useRouter()

  // ── Add form ──────────────────────────────────────────────────────────────
  const [newName,    setNewName]    = useState('')
  const [newDesc,    setNewDesc]    = useState('')
  const [addError,   setAddError]   = useState<string | null>(null)
  const [addPending, startAdd]      = useTransition()

  // ── Edit state ────────────────────────────────────────────────────────────
  const [editingId,   setEditingId]   = useState<string | null>(null)
  const [editName,    setEditName]    = useState('')
  const [editDesc,    setEditDesc]    = useState('')
  const [editError,   setEditError]   = useState<string | null>(null)
  const [editPending, startEdit]      = useTransition()

  // ── Toggle (deactivate / reactivate) ──────────────────────────────────────
  const [togglePending, startToggle] = useTransition()

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

  return (
    <div className="space-y-4">

      {/* ── Role list ──────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-white/10 bg-slate-900 overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-sky-400">Volunteer Roles</h2>
          <p className="text-slate-400 text-xs mt-1">Roles available for volunteer sign-ups across your program.</p>
        </div>

        {roles.length === 0 ? (
          <p className="px-6 py-6 text-sm text-slate-500">No roles defined yet. Add one below.</p>
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
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-sm font-medium ${role.is_active ? 'text-white' : 'text-slate-500'}`}>
                          {role.name}
                        </span>
                        {!role.is_active && (
                          <span className="text-xs bg-slate-700/70 text-slate-400 px-2 py-0.5 rounded-full">
                            Inactive
                          </span>
                        )}
                      </div>
                      {role.description && (
                        <p className={`text-xs mt-0.5 ${role.is_active ? 'text-slate-400' : 'text-slate-600'}`}>
                          {role.description}
                        </p>
                      )}
                    </div>

                    {canManage && (
                      <div className="flex shrink-0 gap-1">
                        <button
                          onClick={() => openEdit(role)}
                          disabled={togglePending || !!editingId}
                          className="text-xs text-slate-400 hover:text-white transition-colors px-2.5 py-1.5 rounded-lg hover:bg-white/5 disabled:opacity-40"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleToggle(role)}
                          disabled={togglePending || !!editingId}
                          className={`text-xs transition-colors px-2.5 py-1.5 rounded-lg disabled:opacity-40 ${
                            role.is_active
                              ? 'text-amber-400 hover:text-amber-300 hover:bg-amber-400/10'
                              : 'text-sky-400 hover:text-sky-300 hover:bg-sky-400/10'
                          }`}
                        >
                          {role.is_active ? 'Deactivate' : 'Reactivate'}
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

    </div>
  )
}
