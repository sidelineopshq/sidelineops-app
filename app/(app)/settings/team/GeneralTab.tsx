'use client'

import { useState, useTransition } from 'react'
import { saveTeamInfo, saveHomeLocation } from './actions'
import { LEVELS } from '@/lib/utils/team-label'

type TeamInfo = {
  id:    string
  name:  string
  level: string | null
  slug:  string | null
}

function TeamInfoSection({
  team,
  canManage,
  showTeamName,
}: {
  team:         TeamInfo
  canManage:    boolean
  showTeamName: boolean
}) {
  const [name,   setName]   = useState(team.name)
  const [level,  setLevel]  = useState(team.level  ?? '')
  const [slug,   setSlug]   = useState(team.slug   ?? '')
  const [saved,  setSaved]  = useState(false)
  const [error,  setError]  = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const inputClass = "w-full rounded-xl border border-white/10 bg-slate-800 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none"
  const labelClass = "block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5"

  function handleSave() {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const result = await saveTeamInfo(team.id, name, level, slug)
      if (result?.error) {
        setError(result.error)
      } else {
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      }
    })
  }

  return (
    <div className="px-6 py-5 space-y-4">
      {showTeamName && (
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{team.name}</p>
      )}

      {/* Team name */}
      <div>
        <label className={labelClass}>Team Name</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Varsity Basketball"
          className={inputClass}
          disabled={!canManage}
        />
      </div>

      {/* Level */}
      <div>
        <label className={labelClass}>Level</label>
        <select
          value={level}
          onChange={e => setLevel(e.target.value)}
          className={inputClass}
          style={{ appearance: 'auto' }}
          disabled={!canManage}
        >
          <option value="">Select level…</option>
          {LEVELS.map(l => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
      </div>

      {/* Slug */}
      <div>
        <label className={labelClass}>Schedule URL Slug</label>
        <div className="flex items-center gap-0">
          <span className="rounded-l-xl border border-r-0 border-white/10 bg-slate-700 px-3 py-2.5 text-sm text-slate-400 whitespace-nowrap">
            /schedule/
          </span>
          <input
            type="text"
            value={slug}
            onChange={e => setSlug(e.target.value)}
            placeholder="team-slug"
            className="flex-1 rounded-l-none rounded-r-xl border border-white/10 bg-slate-800 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none"
            disabled={!canManage}
          />
        </div>
        <p className="mt-1.5 text-xs text-slate-500">
          Changing the slug will break existing schedule links.
        </p>
      </div>

      {canManage && (
        <>
          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={isPending}
              className="rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 px-5 py-2.5 text-sm font-semibold transition-colors"
            >
              {isPending ? 'Saving…' : 'Save Changes'}
            </button>
            {saved && (
              <span className="text-sm text-green-400">Saved</span>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function HomeLocationSection({
  programId,
  initialName,
  initialAddress,
  canManage,
}: {
  programId:       string
  initialName:     string | null
  initialAddress:  string | null
  canManage:       boolean
}) {
  const [locName,    setLocName]    = useState(initialName    ?? '')
  const [locAddress, setLocAddress] = useState(initialAddress ?? '')
  const [saved,      setSaved]      = useState(false)
  const [error,      setError]      = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const inputClass = "w-full rounded-xl border border-white/10 bg-slate-800 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none"
  const labelClass = "block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5"

  function handleSave() {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const result = await saveHomeLocation(programId, locName, locAddress)
      if (result?.error) {
        setError(result.error)
      } else {
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      }
    })
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900 overflow-hidden mt-6">
      <div className="px-6 py-4 border-b border-white/10">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-sky-400">Home Location</h2>
        <p className="text-slate-400 text-xs mt-1">
          Default location for home games. Can be overridden per event.
        </p>
      </div>
      <div className="px-6 py-5 space-y-4">
        <div>
          <label className={labelClass}>
            Home Field / Facility Name <span className="normal-case font-normal text-slate-500">(optional)</span>
          </label>
          <input
            type="text"
            value={locName}
            onChange={e => setLocName(e.target.value)}
            placeholder="e.g. Memorial Field"
            className={inputClass}
            disabled={!canManage}
          />
        </div>

        <div>
          <label className={labelClass}>
            Home Field Address <span className="normal-case font-normal text-slate-500">(optional)</span>
          </label>
          <input
            type="text"
            value={locAddress}
            onChange={e => setLocAddress(e.target.value)}
            placeholder="e.g. 123 Main Street, Springfield, IL 62701"
            className={inputClass}
            disabled={!canManage}
          />
          <p className="text-xs text-slate-500 mt-1.5">
            This will be used as the default location for home games. You can always change it per event.
          </p>
        </div>

        {canManage && (
          <>
            {error && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {error}
              </div>
            )}
            <div className="flex items-center gap-3">
              <button
                onClick={handleSave}
                disabled={isPending}
                className="rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 px-5 py-2.5 text-sm font-semibold transition-colors"
              >
                {isPending ? 'Saving…' : 'Save Changes'}
              </button>
              {saved && (
                <span className="text-sm text-green-400">Saved</span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export function GeneralTab({
  teams,
  programId,
  homeLocationName,
  homeLocationAddress,
  canManage,
}: {
  teams:               TeamInfo[]
  programId:           string
  homeLocationName:    string | null
  homeLocationAddress: string | null
  canManage:           boolean
}) {
  const showDividers = teams.length > 1

  return (
    <>
      <div className="rounded-2xl border border-white/10 bg-slate-900 overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-sky-400">General</h2>
          <p className="text-slate-400 text-xs mt-1">Basic team name, level, and schedule URL.</p>
        </div>
        <div className={showDividers ? 'divide-y divide-white/5' : ''}>
          {teams.map(t => (
            <TeamInfoSection
              key={t.id}
              team={t}
              canManage={canManage}
              showTeamName={showDividers}
            />
          ))}
        </div>
      </div>

      <HomeLocationSection
        programId={programId}
        initialName={homeLocationName}
        initialAddress={homeLocationAddress}
        canManage={canManage}
      />
    </>
  )
}
