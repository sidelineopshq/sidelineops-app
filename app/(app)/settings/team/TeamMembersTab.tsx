'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { sendCoachInvite, resendCoachInvite, revokeCoachInvite, removeCoachAccess } from '@/app/actions/invites'
import { createExternalSubscriber, resendExternalInvite, removeExternalSubscriber } from './actions'

export type PendingInvite = {
  id:         string
  email:      string
  role:       'admin' | 'coach' | 'volunteer_admin' | 'meal_coordinator'
  team_names: string[]
  created_at: string
  expires_at: string
}

export type ActiveMember = {
  user_id:    string
  name:       string
  email:      string
  role:       string
  team_names: string[]
  team_ids:   string[]
}

export type ExternalSubscriber = {
  id:              string
  name:            string
  email:           string
  type:            string
  team_id:         string | null
  token:           string
  opted_in_at:     string | null
  unsubscribed_at: string | null
}

export function TeamMembersTab({
  teams,
  pendingInvites,
  activeMembers,
  canManage,
  currentUserId,
  canManageTeamSettings,
  programId,
  externalSubscribers: initialExternalSubscribers,
}: {
  teams:                { id: string; name: string }[]
  pendingInvites:       PendingInvite[]
  activeMembers:        ActiveMember[]
  canManage:            boolean
  currentUserId:        string
  canManageTeamSettings: boolean
  programId:            string
  externalSubscribers:  ExternalSubscriber[]
}) {
  const router = useRouter()

  // ── Invite form state ──────────────────────────────────────────────────────
  const [email,           setEmail]           = useState('')
  const [role,            setRole]            = useState<'admin' | 'coach' | 'volunteer_admin' | 'meal_coordinator'>('coach')
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>(
    teams.length === 1 ? [teams[0].id] : [],
  )
  const [inviteError,     setInviteError]     = useState<string | null>(null)
  const [inviteSuccess,   setInviteSuccess]   = useState(false)
  const [isSending,       startSend]          = useTransition()

  // ── Resend / Revoke state ──────────────────────────────────────────────────
  const [resendingId,   setResendingId]   = useState<string | null>(null)
  const [revokingId,    setRevokingId]    = useState<string | null>(null)
  const [actionError,   setActionError]   = useState<string | null>(null)
  const [resendSuccess, setResendSuccess] = useState<string | null>(null)

  // ── Remove Access state ────────────────────────────────────────────────────
  const [removeTarget,  setRemoveTarget]  = useState<ActiveMember | null>(null)
  const [removingId,    setRemovingId]    = useState<string | null>(null)
  const [memberList,    setMemberList]    = useState<ActiveMember[]>(activeMembers)

  // ── External Subscribers state ────────────────────────────────────────────
  const [extSubs,          setExtSubs]          = useState<ExternalSubscriber[]>(initialExternalSubscribers)
  const [showInviteModal,  setShowInviteModal]  = useState(false)
  const [extName,          setExtName]          = useState('')
  const [extEmail,         setExtEmail]         = useState('')
  const [extType,          setExtType]          = useState('other')
  const [extTeamId,        setExtTeamId]        = useState<string>('')
  const [extError,         setExtError]         = useState<string | null>(null)
  const [extSuccess,       setExtSuccess]       = useState(false)
  const [isCreatingExt,    startCreateExt]      = useTransition()
  const [resendingExtId,   setResendingExtId]   = useState<string | null>(null)
  const [removingExtId,    setRemovingExtId]    = useState<string | null>(null)
  const [extActionError,   setExtActionError]   = useState<string | null>(null)
  const [extResendSuccess, setExtResendSuccess] = useState<string | null>(null)

  function handleCreateExt() {
    setExtError(null)
    setExtSuccess(false)
    startCreateExt(async () => {
      const result = await createExternalSubscriber(programId, extTeamId || null, extName, extEmail, extType)
      if (result?.error) {
        setExtError(result.error)
      } else {
        setExtSuccess(true)
        setExtName('')
        setExtEmail('')
        setExtType('other')
        setExtTeamId('')
        router.refresh()
        setTimeout(() => { setExtSuccess(false); setShowInviteModal(false) }, 3000)
      }
    })
  }

  async function handleResendExt(id: string) {
    setExtActionError(null)
    setExtResendSuccess(null)
    setResendingExtId(id)
    const result = await resendExternalInvite(id)
    setResendingExtId(null)
    if (result?.error) {
      setExtActionError(result.error)
    } else {
      setExtResendSuccess(id)
      setTimeout(() => setExtResendSuccess(null), 3000)
    }
  }

  async function handleRemoveExt(id: string) {
    setExtActionError(null)
    setRemovingExtId(id)
    const result = await removeExternalSubscriber(id)
    setRemovingExtId(null)
    if (result?.error) {
      setExtActionError(result.error)
    } else {
      setExtSubs(prev => prev.filter(s => s.id !== id))
    }
  }

  function extStatus(sub: ExternalSubscriber) {
    if (sub.unsubscribed_at) return { label: 'Unsubscribed', color: 'text-red-400' }
    if (sub.opted_in_at)     return { label: 'Confirmed',    color: 'text-green-400' }
    return                          { label: 'Pending',      color: 'text-amber-400' }
  }

  const EXT_TYPES = [
    { value: 'other',          label: 'Other'           },
    { value: 'official',       label: 'Game Official'   },
    { value: 'field_manager',  label: 'Field Manager'   },
    { value: 'school_staff',   label: 'School Staff'    },
    { value: 'booster',        label: 'Booster / Admin' },
  ]

  const inputClass  = "w-full rounded-xl border border-white/10 bg-slate-800 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none"
  const labelClass  = "block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5"

  function toggleTeam(id: string) {
    setSelectedTeamIds(prev =>
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id],
    )
  }

  function handleSend() {
    setInviteError(null)
    setInviteSuccess(false)
    startSend(async () => {
      const result = await sendCoachInvite(email.trim(), role, selectedTeamIds)
      if (result?.error) {
        setInviteError(result.error)
      } else {
        setInviteSuccess(true)
        setEmail('')
        setSelectedTeamIds(teams.length === 1 ? [teams[0].id] : [])
        router.refresh()
        setTimeout(() => setInviteSuccess(false), 4000)
      }
    })
  }

  async function handleResend(inviteId: string) {
    setActionError(null)
    setResendSuccess(null)
    setResendingId(inviteId)
    const result = await resendCoachInvite(inviteId)
    setResendingId(null)
    if (result?.error) {
      setActionError(result.error)
    } else {
      setResendSuccess(inviteId)
      router.refresh()
      setTimeout(() => setResendSuccess(null), 3000)
    }
  }

  async function handleRevoke(inviteId: string) {
    setActionError(null)
    setRevokingId(inviteId)
    const result = await revokeCoachInvite(inviteId)
    setRevokingId(null)
    if (result?.error) {
      setActionError(result.error)
    } else {
      router.refresh()
    }
  }

  async function handleRemove() {
    if (!removeTarget) return
    setRemovingId(removeTarget.user_id)
    const result = await removeCoachAccess(removeTarget.user_id, removeTarget.team_ids)
    setRemovingId(null)
    if (result?.error) {
      setActionError(result.error)
    } else {
      setMemberList(prev => prev.filter(m => m.user_id !== removeTarget.user_id))
    }
    setRemoveTarget(null)
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day:   'numeric',
      year:  'numeric',
    })
  }

  function roleLabel(r: string) {
    const labels: Record<string, string> = {
      admin:            'Admin',
      coach:            'Coach',
      volunteer_admin:  'Volunteer Admin',
      meal_coordinator: 'Meal Coordinator',
    }
    return labels[r] ?? r
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* ── 1. Invite Coach ───────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-white/10 bg-slate-900 overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-sky-400">Invite Coach</h2>
          <p className="text-slate-400 text-xs mt-1">Send an invitation email to a coach or admin.</p>
        </div>

        {!canManage ? (
          <div className="px-6 py-8 text-center text-slate-500 text-sm">
            You don&apos;t have permission to invite coaches.
          </div>
        ) : (
          <div className="px-6 py-5 space-y-4">

            {/* Email */}
            <div>
              <label className={labelClass}>Email Address</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="coach@example.com"
                className={inputClass}
              />
            </div>

            {/* Role */}
            <div>
              <label className={labelClass}>Role</label>
              <select
                value={role}
                onChange={e => setRole(e.target.value as 'admin' | 'coach' | 'volunteer_admin' | 'meal_coordinator')}
                className={inputClass}
                style={{ appearance: 'auto' }}
              >
                <option value="coach">Coach — can view and manage events</option>
                <option value="admin">Admin — full team management access</option>
                <option value="volunteer_admin">Volunteer Admin — can manage volunteers only</option>
                <option value="meal_coordinator">Meal Coordinator — receives meal notifications and can edit meal details</option>
              </select>
            </div>

            {/* Teams */}
            {teams.length > 1 && (
              <div>
                <label className={labelClass}>Assign to Teams</label>
                <div className="space-y-2">
                  {teams.map(t => (
                    <label key={t.id} className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedTeamIds.includes(t.id)}
                        onChange={() => toggleTeam(t.id)}
                        className="h-4 w-4 rounded border-white/20 accent-sky-500"
                      />
                      <span className="text-sm text-slate-300">{t.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Error / Success */}
            {inviteError && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {inviteError}
              </div>
            )}
            {inviteSuccess && (
              <div className="rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-400">
                Invitation sent successfully.
              </div>
            )}

            <button
              onClick={handleSend}
              disabled={isSending}
              className="rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 px-5 py-2.5 text-sm font-semibold transition-colors"
            >
              {isSending ? 'Sending...' : 'Send Invitation'}
            </button>
          </div>
        )}
      </div>

      {/* ── 2. Pending Invitations ────────────────────────────────────────── */}
      <div className="rounded-2xl border border-white/10 bg-slate-900 overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-sky-400">Pending Invitations</h2>
          <p className="text-slate-400 text-xs mt-1">Invitations that have been sent but not yet accepted.</p>
        </div>

        {actionError && (
          <div className="mx-6 mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {actionError}
          </div>
        )}

        {pendingInvites.length === 0 ? (
          <div className="px-6 py-8 text-center text-slate-500 text-sm">No pending invitations.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 text-left">
                  <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Email</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Role</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Teams</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Sent</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Expires</th>
                  {canManage && (
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 text-right">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {pendingInvites.map(inv => (
                  <tr key={inv.id}>
                    <td className="px-6 py-3 text-white font-medium">{inv.email}</td>
                    <td className="px-4 py-3 text-slate-400">{roleLabel(inv.role)}</td>
                    <td className="px-4 py-3 text-slate-400">{inv.team_names.join(', ')}</td>
                    <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{formatDate(inv.created_at)}</td>
                    <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{formatDate(inv.expires_at)}</td>
                    {canManage && (
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          {resendSuccess === inv.id ? (
                            <span className="text-xs text-green-400">Resent!</span>
                          ) : (
                            <button
                              onClick={() => handleResend(inv.id)}
                              disabled={resendingId === inv.id || !!revokingId}
                              className="rounded-lg border border-white/10 bg-slate-800 hover:bg-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white transition-colors disabled:opacity-40"
                            >
                              {resendingId === inv.id ? 'Sending…' : 'Resend'}
                            </button>
                          )}
                          <button
                            onClick={() => handleRevoke(inv.id)}
                            disabled={revokingId === inv.id || !!resendingId}
                            className="rounded-lg border border-red-500/20 bg-red-500/10 hover:bg-red-500/20 px-3 py-1.5 text-xs font-semibold text-red-400 hover:text-red-300 transition-colors disabled:opacity-40"
                          >
                            {revokingId === inv.id ? 'Revoking…' : 'Revoke'}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── 3. Active Members ─────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-white/10 bg-slate-900 overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-sky-400">Active Members</h2>
          <p className="text-slate-400 text-xs mt-1">Coaches and staff with access to this program.</p>
        </div>

        {memberList.length === 0 ? (
          <div className="px-6 py-8 text-center text-slate-500 text-sm">No team members yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 text-left">
                  <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Name</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Email</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Role</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Teams</th>
                  {canManageTeamSettings && (
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 text-right">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {memberList.map(m => (
                  <tr key={m.user_id}>
                    <td className="px-6 py-3 text-white font-medium">{m.name || '—'}</td>
                    <td className="px-4 py-3 text-slate-400">{m.email}</td>
                    <td className="px-4 py-3 text-slate-400">{roleLabel(m.role)}</td>
                    <td className="px-4 py-3 text-slate-400">{m.team_names.join(', ')}</td>
                    {canManageTeamSettings && (
                      <td className="px-4 py-3 text-right">
                        {m.user_id !== currentUserId && (
                          <button
                            onClick={() => setRemoveTarget(m)}
                            disabled={removingId === m.user_id}
                            className="rounded-lg border border-red-500/20 bg-red-500/10 hover:bg-red-500/20 px-3 py-1.5 text-xs font-semibold text-red-400 hover:text-red-300 transition-colors disabled:opacity-40"
                          >
                            {removingId === m.user_id ? 'Removing…' : 'Remove Access'}
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── 4. External Subscribers ──────────────────────────────────────── */}
      <div className="rounded-2xl border border-white/10 bg-slate-900 overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-sky-400">External Subscribers</h2>
            <p className="text-slate-400 text-xs mt-1">Non-affiliated persons (officials, field staff) who receive schedule change alerts.</p>
          </div>
          {canManage && (
            <button
              onClick={() => { setShowInviteModal(true); setExtError(null); setExtSuccess(false) }}
              className="shrink-0 rounded-xl bg-sky-600 hover:bg-sky-500 px-4 py-2 text-xs font-semibold transition-colors"
            >
              Invite Subscriber
            </button>
          )}
        </div>

        {extActionError && (
          <div className="mx-6 mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {extActionError}
          </div>
        )}

        {extSubs.length === 0 ? (
          <div className="px-6 py-8 text-center text-slate-500 text-sm">No external subscribers yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 text-left">
                  <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Name</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Email</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Type</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Status</th>
                  {canManage && (
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 text-right">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {extSubs.map(sub => {
                  const st = extStatus(sub)
                  const typeLabel = EXT_TYPES.find(t => t.value === sub.type)?.label ?? sub.type
                  return (
                    <tr key={sub.id}>
                      <td className="px-6 py-3 text-white font-medium">{sub.name}</td>
                      <td className="px-4 py-3 text-slate-400">{sub.email}</td>
                      <td className="px-4 py-3 text-slate-400">{typeLabel}</td>
                      <td className={`px-4 py-3 font-medium ${st.color}`}>{st.label}</td>
                      {canManage && (
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-2">
                            {!sub.opted_in_at && !sub.unsubscribed_at && (
                              extResendSuccess === sub.id ? (
                                <span className="text-xs text-green-400">Resent!</span>
                              ) : (
                                <button
                                  onClick={() => handleResendExt(sub.id)}
                                  disabled={resendingExtId === sub.id}
                                  className="rounded-lg border border-white/10 bg-slate-800 hover:bg-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white transition-colors disabled:opacity-40"
                                >
                                  {resendingExtId === sub.id ? 'Sending…' : 'Resend Invite'}
                                </button>
                              )
                            )}
                            <button
                              onClick={() => handleRemoveExt(sub.id)}
                              disabled={removingExtId === sub.id}
                              className="rounded-lg border border-red-500/20 bg-red-500/10 hover:bg-red-500/20 px-3 py-1.5 text-xs font-semibold text-red-400 hover:text-red-300 transition-colors disabled:opacity-40"
                            >
                              {removingExtId === sub.id ? 'Removing…' : 'Remove'}
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Invite Subscriber modal ───────────────────────────────────────── */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 space-y-4">
            <h3 className="text-base font-semibold text-white">Invite External Subscriber</h3>
            <p className="text-sm text-slate-400">They&apos;ll receive an email to confirm their subscription before getting any alerts.</p>

            <div>
              <label className={labelClass}>Name</label>
              <input
                type="text"
                value={extName}
                onChange={e => setExtName(e.target.value)}
                placeholder="Jane Smith"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Email</label>
              <input
                type="email"
                value={extEmail}
                onChange={e => setExtEmail(e.target.value)}
                placeholder="jane@example.com"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Type</label>
              <select
                value={extType}
                onChange={e => setExtType(e.target.value)}
                className={inputClass}
                style={{ appearance: 'auto' }}
              >
                {EXT_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            {teams.length > 1 && (
              <div>
                <label className={labelClass}>Team (optional)</label>
                <select
                  value={extTeamId}
                  onChange={e => setExtTeamId(e.target.value)}
                  className={inputClass}
                  style={{ appearance: 'auto' }}
                >
                  <option value="">All Teams</option>
                  {teams.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
            )}

            {extError && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{extError}</div>
            )}
            {extSuccess && (
              <div className="rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-400">Invite sent!</div>
            )}

            <div className="flex gap-3 justify-end pt-1">
              <button
                onClick={() => { setShowInviteModal(false); setExtName(''); setExtEmail(''); setExtError(null); setExtSuccess(false) }}
                disabled={isCreatingExt}
                className="rounded-xl border border-white/10 bg-slate-800 hover:bg-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 hover:text-white transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateExt}
                disabled={isCreatingExt}
                className="rounded-xl bg-sky-600 hover:bg-sky-500 px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-50"
              >
                {isCreatingExt ? 'Sending…' : 'Send Invite'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirmation dialog ───────────────────────────────────────────── */}
      {removeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 space-y-4">
            <h3 className="text-base font-semibold text-white">Remove Access</h3>
            <p className="text-sm text-slate-400">
              Remove <span className="text-white font-medium">{removeTarget.name || removeTarget.email}</span> from{' '}
              <span className="text-white font-medium">{removeTarget.team_names.join(', ')}</span>?
              They will immediately lose access to all assigned teams.
            </p>
            {actionError && (
              <p className="text-sm text-red-400">{actionError}</p>
            )}
            <div className="flex gap-3 justify-end pt-1">
              <button
                onClick={() => { setRemoveTarget(null); setActionError(null) }}
                disabled={!!removingId}
                className="rounded-xl border border-white/10 bg-slate-800 hover:bg-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 hover:text-white transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={handleRemove}
                disabled={!!removingId}
                className="rounded-xl bg-red-600 hover:bg-red-500 px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-50"
              >
                {removingId ? 'Removing…' : 'Remove Access'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
