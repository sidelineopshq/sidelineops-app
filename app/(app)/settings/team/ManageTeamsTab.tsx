'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { setPrimaryTeam } from '@/app/(app)/settings/teams/actions'
import { addTeam } from '@/app/actions/teams'
import { LEVELS } from '@/lib/utils/team-label'

export type ManageTeam = {
  id:         string
  name:       string
  slug:       string | null
  is_primary: boolean
  sort_order: number | null
}

function slugify(val: string) {
  return val
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

export function ManageTeamsTab({
  teams: initialTeams,
  programId,
  programLabel,
  canManage,
  canManageTeamSettings,
}: {
  teams:                ManageTeam[]
  programId:            string
  programLabel:         string
  canManage:            boolean
  canManageTeamSettings: boolean
}) {
  const router = useRouter()

  const [teams,          setTeams]          = useState<ManageTeam[]>(initialTeams)
  const [settingPrimary, setSettingPrimary] = useState<string | null>(null)

  // ── Modal state ────────────────────────────────────────────────────────────
  const [showModal,   setShowModal]   = useState(false)
  const [level,       setLevel]       = useState('Varsity')
  const [slug,        setSlug]        = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [sortOrder,   setSortOrder]   = useState(initialTeams.length + 1)
  const [modalError,  setModalError]  = useState<string | null>(null)
  const [isCreating,  startCreate]    = useTransition()

  // ── Toast state ────────────────────────────────────────────────────────────
  const [toast, setToast] = useState<string | null>(null)

  // Auto-generate slug from program label + level (unless user has manually edited)
  useEffect(() => {
    if (!slugTouched && programLabel) {
      setSlug(slugify(`${programLabel} ${level}`))
    }
  }, [programLabel, level, slugTouched])

  function openModal() {
    setLevel('Varsity')
    setSlug('')
    setSlugTouched(false)
    setSortOrder(teams.length + 1)
    setModalError(null)
    setShowModal(true)
  }

  function closeModal() {
    setShowModal(false)
  }

  async function handleSetPrimary(teamId: string) {
    setSettingPrimary(teamId)
    await setPrimaryTeam(teamId)
    setSettingPrimary(null)
    router.refresh()
  }

  function handleCreate() {
    setModalError(null)
    startCreate(async () => {
      const result = await addTeam(level, slug.trim(), sortOrder, programId)
      if (result?.error) {
        setModalError(result.error)
        return
      }
      const newTeam = result.team as ManageTeam
      setTeams(prev => [...prev, newTeam])
      closeModal()
      setToast(`${newTeam.name} has been created`)
      setTimeout(() => setToast(null), 4000)
      router.refresh()
    })
  }

  const inputClass = "w-full rounded-xl border border-white/10 bg-slate-800 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none"
  const labelClass = "block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5"

  const previewName = programLabel ? `${programLabel} — ${level}` : level

  return (
    <>
      <div className="rounded-2xl border border-white/10 bg-slate-900 overflow-hidden">

        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-sky-400">
              Primary Team
            </h2>
            <p className="text-slate-400 text-xs mt-1">
              The primary team&apos;s start time is used as the default display time on the public schedule.
            </p>
          </div>
          {canManageTeamSettings && (
            <button
              onClick={openModal}
              className="shrink-0 rounded-xl bg-sky-600 hover:bg-sky-500 px-4 py-2 text-sm font-semibold text-white transition-colors"
            >
              + New Team
            </button>
          )}
        </div>

        {/* Team list */}
        <div className="divide-y divide-white/5">
          {teams.map(team => (
            <div key={team.id} className="flex items-center justify-between px-6 py-4 gap-4">
              <div className="min-w-0">
                <p className="font-semibold text-sm text-white">{team.name}</p>
                {team.slug && (
                  <p className="text-xs text-slate-500 mt-0.5">/schedule/{team.slug}</p>
                )}
              </div>
              {team.is_primary ? (
                <span className="shrink-0 rounded-full border border-green-500/30 bg-green-500/10 px-3 py-1 text-xs font-semibold text-green-400">
                  Primary Team
                </span>
              ) : canManage ? (
                <button
                  onClick={() => handleSetPrimary(team.id)}
                  disabled={settingPrimary === team.id}
                  className="shrink-0 rounded-lg border border-white/10 bg-slate-800 hover:bg-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white transition-colors disabled:opacity-40"
                >
                  {settingPrimary === team.id ? 'Saving…' : 'Set as Primary'}
                </button>
              ) : (
                <span className="shrink-0 text-xs text-slate-600">Not primary</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Toast ─────────────────────────────────────────────────────────── */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-xl border border-green-500/30 bg-green-500/10 px-5 py-3 text-sm font-medium text-green-400 shadow-lg backdrop-blur-sm">
          {toast}
        </div>
      )}

      {/* ── New Team Modal ─────────────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 space-y-5">

            <h3 className="text-base font-semibold text-white">Add Team</h3>

            {/* Level */}
            <div>
              <label className={labelClass}>Level</label>
              <select
                value={level}
                onChange={e => setLevel(e.target.value)}
                className={inputClass}
                style={{ appearance: 'auto' }}
                autoFocus
              >
                {LEVELS.map(l => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>

            {/* Team Name (read-only preview) */}
            <div>
              <label className={labelClass}>Team Name (auto-generated)</label>
              <div className="w-full rounded-xl border border-white/10 bg-slate-700/50 px-4 py-2.5 text-sm text-slate-400">
                {previewName}
              </div>
            </div>

            {/* Slug */}
            <div>
              <label className={labelClass}>URL Slug</label>
              <div className="flex items-center gap-0">
                <span className="rounded-l-xl border border-r-0 border-white/10 bg-slate-700 px-3 py-2.5 text-xs text-slate-400 whitespace-nowrap">
                  /schedule/
                </span>
                <input
                  type="text"
                  value={slug}
                  onChange={e => { setSlugTouched(true); setSlug(e.target.value) }}
                  placeholder="james-clemens-softball-jv"
                  className="flex-1 rounded-r-xl border border-white/10 bg-slate-800 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Sort Order */}
            <div>
              <label className={labelClass}>Sort Order</label>
              <input
                type="number"
                value={sortOrder}
                onChange={e => setSortOrder(Number(e.target.value))}
                min={1}
                className={inputClass}
              />
            </div>

            {/* Error */}
            {modalError && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {modalError}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 justify-end pt-1">
              <button
                onClick={closeModal}
                disabled={isCreating}
                className="rounded-xl border border-white/10 bg-slate-800 hover:bg-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 hover:text-white transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={isCreating || !slug.trim()}
                className="rounded-xl bg-sky-600 hover:bg-sky-500 px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-50"
              >
                {isCreating ? 'Creating…' : 'Create Team'}
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  )
}
