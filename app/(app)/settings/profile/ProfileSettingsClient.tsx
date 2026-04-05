'use client'

import { useState } from 'react'
import { updateProfile, updatePassword } from './actions'

const inputClass =
  'w-full rounded-xl border border-white/10 bg-slate-800 px-4 py-2.5 text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none text-sm'

function Toast({ message, type }: { message: string; type: 'success' | 'error' }) {
  return (
    <div className={`mt-3 rounded-xl px-4 py-2.5 text-sm font-medium ${
      type === 'success'
        ? 'bg-green-500/15 border border-green-500/30 text-green-400'
        : 'bg-red-500/15 border border-red-500/30 text-red-400'
    }`}>
      {message}
    </div>
  )
}

export default function ProfileSettingsClient({
  initialFirstName,
  initialLastName,
  email,
  roleLabel,
  teamNames,
  programLabel,
  memberSince,
}: {
  initialFirstName: string
  initialLastName: string
  email: string
  roleLabel: string
  teamNames: string[]
  programLabel: string
  memberSince: string
}) {
  // ── Personal info ────────────────────────────────────────────
  const [firstName, setFirstName]     = useState(initialFirstName)
  const [lastName, setLastName]       = useState(initialLastName)
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileMsg, setProfileMsg]   = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  async function handleSaveProfile() {
    if (!firstName.trim() || !lastName.trim()) {
      setProfileMsg({ text: 'First and last name are required.', type: 'error' })
      return
    }
    setProfileSaving(true)
    setProfileMsg(null)
    const result = await updateProfile(firstName, lastName)
    setProfileSaving(false)
    if (result.error) {
      setProfileMsg({ text: result.error, type: 'error' })
    } else {
      setProfileMsg({ text: 'Profile updated', type: 'success' })
      setTimeout(() => setProfileMsg(null), 3000)
    }
  }

  // ── Password ─────────────────────────────────────────────────
  const [newPassword, setNewPassword]         = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSaving, setPasswordSaving]   = useState(false)
  const [passwordMsg, setPasswordMsg]         = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  async function handleUpdatePassword() {
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ text: "Passwords don't match.", type: 'error' })
      return
    }
    if (newPassword.length < 8) {
      setPasswordMsg({ text: 'Password must be at least 8 characters.', type: 'error' })
      return
    }
    setPasswordSaving(true)
    setPasswordMsg(null)
    const result = await updatePassword(newPassword)
    setPasswordSaving(false)
    if (result.error) {
      setPasswordMsg({ text: result.error, type: 'error' })
    } else {
      setNewPassword('')
      setConfirmPassword('')
      setPasswordMsg({ text: 'Password updated successfully', type: 'success' })
      setTimeout(() => setPasswordMsg(null), 3000)
    }
  }

  return (
    <section className="mx-auto max-w-3xl px-6 py-10">

      {/* Header */}
      <div className="mb-8">
        <a
          href="/settings/team"
          className="text-xs text-slate-500 hover:text-slate-400 transition-colors mb-4 inline-block"
        >
          ← Settings
        </a>
        <h1 className="text-2xl font-bold">Profile Settings</h1>
      </div>

      {/* ── Section 1: Personal Information ─────────────────────── */}
      <div className="rounded-2xl border border-white/10 bg-slate-900 overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-white/10">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-sky-400">
            Personal Information
          </h2>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                First Name
              </label>
              <input
                type="text"
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                Last Name
              </label>
              <input
                type="text"
                value={lastName}
                onChange={e => setLastName(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">
              Email
            </label>
            <div className="rounded-xl border border-white/5 bg-slate-800/50 px-4 py-2.5 text-sm text-slate-400">
              {email}
            </div>
            <p className="mt-1.5 text-xs text-slate-600">
              Contact support to change your email address.
            </p>
          </div>

          <div className="pt-1">
            <button
              onClick={handleSaveProfile}
              disabled={profileSaving}
              className="rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 px-5 py-2.5 text-sm font-semibold transition-colors"
            >
              {profileSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>

          {profileMsg && <Toast message={profileMsg.text} type={profileMsg.type} />}
        </div>
      </div>

      {/* ── Section 2: Change Password ──────────────────────────── */}
      <div className="rounded-2xl border border-white/10 bg-slate-900 overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-white/10">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-sky-400">
            Change Password
          </h2>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">
              New Password
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="Minimum 8 characters"
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">
              Confirm New Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Re-enter new password"
              className={inputClass}
            />
          </div>

          <div className="pt-1">
            <button
              onClick={handleUpdatePassword}
              disabled={passwordSaving}
              className="rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 px-5 py-2.5 text-sm font-semibold transition-colors"
            >
              {passwordSaving ? 'Updating...' : 'Update Password'}
            </button>
          </div>

          {passwordMsg && <Toast message={passwordMsg.text} type={passwordMsg.type} />}
        </div>
      </div>

      {/* ── Section 3: Account Info (read-only) ─────────────────── */}
      <div className="rounded-2xl border border-white/10 bg-slate-900 overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-sky-400">
            Account Info
          </h2>
        </div>
        <div className="px-6 py-5 space-y-3">
          <div className="flex items-start gap-4">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide w-24 pt-0.5 shrink-0">Role</span>
            <span className="text-sm text-slate-300">{roleLabel}</span>
          </div>
          <div className="flex items-start gap-4">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide w-24 pt-0.5 shrink-0">Teams</span>
            <span className="text-sm text-slate-300">{teamNames.join(' · ')}</span>
          </div>
          <div className="flex items-start gap-4">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide w-24 pt-0.5 shrink-0">Program</span>
            <span className="text-sm text-slate-300">{programLabel}</span>
          </div>
          <div className="flex items-start gap-4">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide w-24 pt-0.5 shrink-0">Member since</span>
            <span className="text-sm text-slate-300">{memberSince}</span>
          </div>
        </div>
      </div>

    </section>
  )
}
