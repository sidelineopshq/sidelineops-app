'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { sendCoachInvite, resendCoachInvite, revokeCoachInvite } from '@/app/actions/invites'

export type PendingInvite = {
  id:         string
  email:      string
  role:       'admin' | 'coach'
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
}

export function TeamMembersTab({
  teams,
  pendingInvites,
  activeMembers,
  canManage,
}: {
  teams:          { id: string; name: string }[]
  pendingInvites: PendingInvite[]
  activeMembers:  ActiveMember[]
  canManage:      boolean
}) {
  const router = useRouter()

  // ── Invite form state ──────────────────────────────────────────────────────
  const [email,           setEmail]           = useState('')
  const [role,            setRole]            = useState<'admin' | 'coach'>('coach')
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

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day:   'numeric',
      year:  'numeric',
    })
  }

  function roleLabel(r: string) {
    return r === 'admin' ? 'Admin' : 'Coach'
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
                onChange={e => setRole(e.target.value as 'admin' | 'coach')}
                className={inputClass}
                style={{ appearance: 'auto' }}
              >
                <option value="coach">Coach — can view and manage events</option>
                <option value="admin">Admin — full team management access</option>
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

        {activeMembers.length === 0 ? (
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
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {activeMembers.map(m => (
                  <tr key={m.user_id}>
                    <td className="px-6 py-3 text-white font-medium">{m.name || '—'}</td>
                    <td className="px-4 py-3 text-slate-400">{m.email}</td>
                    <td className="px-4 py-3 text-slate-400">{roleLabel(m.role)}</td>
                    <td className="px-4 py-3 text-slate-400">{m.team_names.join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  )
}
