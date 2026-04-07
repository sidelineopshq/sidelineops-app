'use client'

import { useState, useMemo } from 'react'
import {
  addPlayer, updatePlayer, deactivatePlayer,
  generateJoinToken, setPlayerPrimaryTeam, setCallUp,
} from './actions'

// ── Types ─────────────────────────────────────────────────────

type Team = { id: string; name: string }

type TeamAssignment = { team_id: string; is_call_up: boolean }

type Player = {
  id: string
  first_name: string
  last_name: string
  jersey_number: string | null
  is_active: boolean
  notes: string | null
  primary_team_id: string
  team_assignments: TeamAssignment[]
}

// ── Add / Edit Player Form ────────────────────────────────────

function PlayerForm({ teams, player, onSave, onCancel }: {
  teams: Team[]
  player?: Player
  onSave: (player: Player) => void
  onCancel: () => void
}) {
  const [selectedTeamId, setSelectedTeamId] = useState(
    player?.primary_team_id ?? teams[0]?.id ?? ''
  )
  const [firstName, setFirstName] = useState(player?.first_name ?? '')
  const [lastName,  setLastName]  = useState(player?.last_name ?? '')
  const [jersey,    setJersey]    = useState(player?.jersey_number ?? '')
  const [notes,     setNotes]     = useState(player?.notes ?? '')
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState<string | null>(null)

  const inputClass = 'w-full rounded-xl border border-white/10 bg-slate-800 px-4 py-2.5 text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none text-sm'

  async function handleSubmit() {
    if (!firstName.trim() || !lastName.trim()) {
      setError('First and last name are required.')
      return
    }
    setLoading(true)
    setError(null)

    if (player) {
      const result = await updatePlayer(player.id, {
        first_name:    firstName,
        last_name:     lastName,
        jersey_number: jersey || undefined,
        notes:         notes  || undefined,
        team_id:       player.primary_team_id,
      })
      if (result?.error) { setError(result.error); setLoading(false); return }
      onSave({ ...player, first_name: firstName, last_name: lastName, jersey_number: jersey || null, notes: notes || null })
    } else {
      const result = await addPlayer({
        first_name:    firstName,
        last_name:     lastName,
        jersey_number: jersey || undefined,
        notes:         notes  || undefined,
        team_id:       selectedTeamId,
      })
      if (result?.error) { setError(result.error); setLoading(false); return }
      if (result?.player) onSave(result.player as Player)
    }
  }

  return (
    <div className="rounded-2xl border border-sky-500/30 bg-slate-900 p-5 space-y-4">
      <h3 className="text-sm font-bold text-white">
        {player ? 'Edit Player' : 'Add Player'}
      </h3>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {/* Team selector — add mode only, multi-team only */}
        {!player && teams.length > 1 && (
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">Team</label>
            <select
              value={selectedTeamId}
              onChange={e => setSelectedTeamId(e.target.value)}
              className={inputClass}
              style={{ appearance: 'auto' }}
            >
              {teams.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-1.5">
            First Name <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={firstName}
            onChange={e => setFirstName(e.target.value)}
            placeholder="e.g. Sarah"
            className={inputClass}
            autoFocus
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-1.5">
            Last Name <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={lastName}
            onChange={e => setLastName(e.target.value)}
            placeholder="e.g. Johnson"
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-1.5">
            Jersey # <span className="text-slate-500 font-normal">(optional)</span>
          </label>
          <input
            type="text"
            value={jersey}
            onChange={e => setJersey(e.target.value)}
            placeholder="e.g. 12"
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-1.5">
            Notes <span className="text-slate-500 font-normal">(optional)</span>
          </label>
          <input
            type="text"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="e.g. Pitcher"
            className={inputClass}
          />
        </div>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex gap-3">
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="flex-1 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 px-4 py-2.5 text-sm font-semibold transition-colors"
        >
          {loading ? 'Saving...' : player ? 'Save Changes' : 'Add Player'}
        </button>
        <button
          onClick={onCancel}
          disabled={loading}
          className="rounded-xl border border-white/10 hover:bg-slate-800 disabled:opacity-50 px-4 py-2.5 text-sm font-semibold transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Player Row ────────────────────────────────────────────────

function PlayerRow({ player, teams, canManage, onEdit, onRemove, onTeamChanged, onCallUpChanged }: {
  player: Player
  teams: Team[]
  canManage: boolean
  onEdit: (p: Player) => void
  onRemove: (playerId: string) => void
  onTeamChanged: (playerId: string, newTeamId: string) => void
  onCallUpChanged: (playerId: string, callUpTeamId: string, enabled: boolean) => void
}) {
  const [changingTeam,    setChangingTeam]    = useState(false)
  const [togglingCallUp,  setTogglingCallUp]  = useState(false)
  const [removing,        setRemoving]        = useState(false)

  const primaryAssignment = player.team_assignments.find(a => !a.is_call_up)
  const callUpAssignment  = player.team_assignments.find(a => a.is_call_up)
  const primaryTeamId     = primaryAssignment?.team_id ?? player.primary_team_id
  const primaryTeam       = teams.find(t => t.id === primaryTeamId)
  const callUpTeam        = callUpAssignment ? teams.find(t => t.id === callUpAssignment.team_id) : null
  // For a 2-team setup, the "other" team a player could be called up to
  const otherTeam         = teams.length === 2 ? teams.find(t => t.id !== primaryTeamId) : null

  async function handleTeamChange(newTeamId: string) {
    if (newTeamId === primaryTeamId || changingTeam) return
    setChangingTeam(true)
    const result = await setPlayerPrimaryTeam(player.id, newTeamId)
    if (!result?.error) onTeamChanged(player.id, newTeamId)
    setChangingTeam(false)
  }

  async function handleCallUpToggle() {
    if (togglingCallUp) return
    const targetTeamId = callUpTeam?.id ?? otherTeam?.id
    if (!targetTeamId) return
    const enabling = !callUpAssignment
    setTogglingCallUp(true)
    const result = await setCallUp(player.id, targetTeamId, enabling)
    if (!result?.error) onCallUpChanged(player.id, targetTeamId, enabling)
    setTogglingCallUp(false)
  }

  async function handleRemove() {
    if (!confirm(`Remove ${player.first_name} ${player.last_name} from the roster?`)) return
    setRemoving(true)
    const result = await deactivatePlayer(player.id, primaryTeamId)
    if (!result?.error) onRemove(player.id)
    setRemoving(false)
  }

  return (
    <div className="rounded-xl border border-white/10 bg-slate-900 px-4 py-3 hover:border-white/20 transition-colors">
      {/* Row 1: jersey + name + actions */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="shrink-0 w-9 h-9 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center">
            <span className="text-xs font-bold text-slate-400">{player.jersey_number ?? '—'}</span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white">
              {player.last_name}, {player.first_name}
            </p>
            {player.notes && (
              <p className="text-xs text-slate-500 truncate">{player.notes}</p>
            )}
          </div>
        </div>

        {canManage && (
          <div className="flex shrink-0 gap-2">
            <button
              onClick={() => onEdit(player)}
              style={{ padding: '2px 10px' }}
              className="rounded-lg border border-white/10 bg-slate-800 hover:bg-slate-700 text-xs font-semibold transition-colors"
            >
              Edit
            </button>
            <button
              onClick={handleRemove}
              disabled={removing}
              style={{ padding: '2px 10px' }}
              className="rounded-lg border border-red-500/20 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-semibold transition-colors disabled:opacity-50"
            >
              {removing ? '...' : 'Remove'}
            </button>
          </div>
        )}
      </div>

      {/* Row 2: team assignment (only shown for multi-team programs) */}
      {teams.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 mt-2 ml-12">
          {/* Primary team — dropdown if can manage, badge if not */}
          {canManage ? (
            <select
              value={primaryTeamId}
              onChange={e => handleTeamChange(e.target.value)}
              disabled={changingTeam}
              style={{ appearance: 'auto' }}
              className="rounded-lg border border-white/10 bg-slate-800 px-2.5 py-1 text-xs font-semibold text-slate-300 focus:border-sky-500 focus:outline-none disabled:opacity-50 transition-colors"
            >
              {teams.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          ) : (
            <span className="rounded-full border border-white/10 bg-slate-800 px-2.5 py-0.5 text-xs font-medium text-slate-400">
              {primaryTeam?.name ?? '—'}
            </span>
          )}

          {/* Call-up badge or toggle */}
          {callUpTeam ? (
            <span className="flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-300">
              ↑ Called Up · {callUpTeam.name}
              {canManage && (
                <button
                  onClick={handleCallUpToggle}
                  disabled={togglingCallUp}
                  className="ml-0.5 text-amber-400 hover:text-amber-200 leading-none disabled:opacity-50"
                  title="Remove call-up"
                >
                  ×
                </button>
              )}
            </span>
          ) : (
            canManage && otherTeam && (
              <button
                onClick={handleCallUpToggle}
                disabled={togglingCallUp}
                style={{ padding: '1px 8px' }}
                className="rounded-full border border-white/10 bg-slate-800 hover:border-amber-500/30 hover:bg-amber-500/10 hover:text-amber-300 text-slate-500 text-xs font-medium transition-colors disabled:opacity-50"
              >
                {togglingCallUp ? '...' : `+ Call Up`}
              </button>
            )
          )}
        </div>
      )}
    </div>
  )
}

// ── Join Link Card ────────────────────────────────────────────

function JoinLinkCard({ team, initialToken, isPrimary }: {
  team: Team
  initialToken: string | null
  isPrimary: boolean
}) {
  const [token,      setToken]      = useState(initialToken)
  const [copied,     setCopied]     = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'
  const joinUrl = token ? `${baseUrl}/join/${token}` : null

  async function handleGenerate() {
    setGenerating(true)
    setError(null)
    const result = await generateJoinToken(team.id)
    if (result?.error) setError(result.error)
    else if (result?.token) setToken(result.token)
    setGenerating(false)
  }

  async function handleCopy() {
    if (!joinUrl) return
    try {
      await navigator.clipboard.writeText(joinUrl)
    } catch {
      const el = document.createElement('textarea')
      el.value = joinUrl
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900 p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-sm font-bold text-white">{team.name} Parent Signup</p>
          <p className="text-xs text-slate-500 mt-0.5">
            {isPrimary
              ? 'Share at your parent meeting to collect all contacts at once.'
              : 'Use for individual players added to this team after the season starts.'}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-0.5 text-xs text-sky-300 font-semibold">
          {team.name}
        </span>
      </div>

      {token ? (
        <div className="space-y-3">
          <div className="rounded-xl border border-white/10 bg-slate-800 px-4 py-2.5">
            <p className="text-xs text-slate-500 font-mono break-all">{joinUrl}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCopy}
              className={`flex-1 rounded-xl border px-4 py-2 text-xs font-semibold transition-colors ${
                copied
                  ? 'border-green-500/30 bg-green-500/10 text-green-400'
                  : 'border-white/10 bg-slate-800 hover:bg-slate-700 text-slate-300'
              }`}
            >
              {copied ? '✓ Copied!' : 'Copy Link'}
            </button>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="rounded-xl border border-red-500/20 bg-red-500/10 hover:bg-red-500/20 text-red-400 px-4 py-2 text-xs font-semibold transition-colors disabled:opacity-50"
            >
              {generating ? 'Rotating...' : 'Rotate'}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-slate-400">
            No join link yet. Generate one to start collecting {team.name} parent contacts.
          </p>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="w-full rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 px-4 py-2.5 text-sm font-semibold transition-colors"
          >
            {generating ? 'Generating...' : 'Generate Join Link'}
          </button>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  )
}

// ── Main Roster Client ────────────────────────────────────────

export default function RosterClient({
  players: initialPlayers,
  teams,
  programName,
  sport,
  canManageContacts,
  joinTokensByTeam,
  totalContactCount,
}: {
  players: Player[]
  teams: Team[]
  programName: string
  sport: string
  canManageContacts: boolean
  joinTokensByTeam: Record<string, string>
  totalContactCount: number
}) {
  const [players,       setPlayers]       = useState(initialPlayers)
  const [showAddForm,   setShowAddForm]   = useState(false)
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null)
  const [search,        setSearch]        = useState('')
  const [activeTeamId,  setActiveTeamId]  = useState<string | null>(null)

  // Filter by team tab + search
  const filteredPlayers = useMemo(() => {
    return players.filter(p => {
      if (activeTeamId && !p.team_assignments.some(a => a.team_id === activeTeamId)) {
        return false
      }
      const q = search.toLowerCase()
      return (
        `${p.first_name} ${p.last_name}`.toLowerCase().includes(q) ||
        (p.jersey_number ?? '').includes(search)
      )
    })
  }, [players, activeTeamId, search])

  const uniquePlayerCount = players.length
  const completionPct = uniquePlayerCount > 0
    ? Math.round((totalContactCount / uniquePlayerCount) * 100)
    : 0

  function handlePlayerSaved(saved: Player) {
    setPlayers(prev => {
      const exists = prev.find(p => p.id === saved.id)
      if (exists) return prev.map(p => p.id === saved.id ? saved : p)
      return [...prev, saved].sort((a, b) =>
        a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name)
      )
    })
    setShowAddForm(false)
    setEditingPlayer(null)
  }

  function handlePlayerRemoved(playerId: string) {
    setPlayers(prev => prev.filter(p => p.id !== playerId))
  }

  function handleTeamChanged(playerId: string, newTeamId: string) {
    setPlayers(prev => prev.map(p => {
      if (p.id !== playerId) return p
      // Replace primary assignment, keep call-up rows (except any for the new team)
      const callUps = p.team_assignments.filter(a =>
        a.is_call_up && a.team_id !== newTeamId
      )
      return {
        ...p,
        primary_team_id: newTeamId,
        team_assignments: [{ team_id: newTeamId, is_call_up: false }, ...callUps],
      }
    }))
  }

  function handleCallUpChanged(playerId: string, callUpTeamId: string, enabled: boolean) {
    setPlayers(prev => prev.map(p => {
      if (p.id !== playerId) return p
      if (enabled) {
        const alreadyHas = p.team_assignments.some(a => a.team_id === callUpTeamId)
        if (alreadyHas) {
          return {
            ...p,
            team_assignments: p.team_assignments.map(a =>
              a.team_id === callUpTeamId ? { ...a, is_call_up: true } : a
            ),
          }
        }
        return {
          ...p,
          team_assignments: [...p.team_assignments, { team_id: callUpTeamId, is_call_up: true }],
        }
      } else {
        return {
          ...p,
          team_assignments: p.team_assignments.filter(a => a.team_id !== callUpTeamId),
        }
      }
    }))
  }

  // Count players per team for tab labels
  const countByTeam = useMemo(() => {
    const counts: Record<string, number> = {}
    players.forEach(p => {
      p.team_assignments.forEach(a => {
        counts[a.team_id] = (counts[a.team_id] ?? 0) + 1
      })
    })
    return counts
  }, [players])

  return (
    <div className="text-white">
      <div className="mx-auto max-w-4xl px-6 py-8">

        {/* Page header */}
        <div className="mb-6">
          <p className="text-sm text-slate-400">{programName}</p>
          <h1 className="text-2xl font-bold">Roster</h1>
          <p className="text-sm text-slate-500 mt-0.5">{sport}</p>
        </div>

        {/* Team filter tabs */}
        {teams.length > 1 && (
          <div className="flex flex-wrap gap-2 mb-6">
            <button
              onClick={() => setActiveTeamId(null)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
                activeTeamId === null
                  ? 'bg-sky-600 text-white'
                  : 'border border-white/10 bg-slate-900 text-slate-400 hover:text-white'
              }`}
            >
              All Players
              <span className="ml-1.5 text-xs opacity-70">({uniquePlayerCount})</span>
            </button>
            {teams.map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTeamId(t.id)}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
                  activeTeamId === t.id
                    ? 'bg-sky-600 text-white'
                    : 'border border-white/10 bg-slate-900 text-slate-400 hover:text-white'
                }`}
              >
                {t.name}
                <span className="ml-1.5 text-xs opacity-70">({countByTeam[t.id] ?? 0})</span>
              </button>
            ))}
          </div>
        )}

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="rounded-2xl border border-white/10 bg-slate-900 p-4 text-center">
            <p className="text-2xl font-bold text-white">{uniquePlayerCount}</p>
            <p className="text-xs text-slate-400 mt-0.5">Players</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-900 p-4 text-center">
            <p className="text-2xl font-bold text-white">{totalContactCount}</p>
            <p className="text-xs text-slate-400 mt-0.5">Contacts</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-900 p-4 text-center">
            <p className={`text-2xl font-bold ${
              completionPct >= 80 ? 'text-green-400'
              : completionPct >= 50 ? 'text-amber-400'
              : 'text-slate-400'
            }`}>
              {completionPct}%
            </p>
            <p className="text-xs text-slate-400 mt-0.5">Complete</p>
            <div className="mt-2 h-1.5 rounded-full bg-slate-700">
              <div
                className={`h-1.5 rounded-full transition-all ${
                  completionPct >= 80 ? 'bg-green-500'
                  : completionPct >= 50 ? 'bg-amber-500'
                  : 'bg-slate-500'
                }`}
                style={{ width: `${completionPct}%` }}
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">

          {/* ── LEFT: Roster ── */}
          <div className="space-y-4">

            {/* Add form or button */}
            {canManageContacts && (
              showAddForm ? (
                <PlayerForm
                  teams={teams}
                  onSave={handlePlayerSaved}
                  onCancel={() => setShowAddForm(false)}
                />
              ) : (
                <button
                  onClick={() => setShowAddForm(true)}
                  className="w-full rounded-2xl border border-dashed border-white/20 hover:border-sky-500/50 bg-slate-900/50 hover:bg-slate-900 px-5 py-4 text-sm font-semibold text-slate-400 hover:text-sky-300 transition-colors"
                >
                  + Add Player
                </button>
              )
            )}

            {/* Edit form */}
            {editingPlayer && (
              <PlayerForm
                teams={teams}
                player={editingPlayer}
                onSave={handlePlayerSaved}
                onCancel={() => setEditingPlayer(null)}
              />
            )}

            {/* Search */}
            {players.length > 5 && (
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by name or jersey #..."
                className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-2.5 text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none text-sm"
              />
            )}

            {/* Player list */}
            {players.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-slate-900 p-10 text-center">
                <p className="text-slate-400 font-semibold">No players on roster yet</p>
                <p className="text-slate-500 text-sm mt-1">
                  Add player names to get started. Parents will link to players during signup.
                </p>
              </div>
            ) : filteredPlayers.length === 0 ? (
              <p className="text-slate-500 text-sm text-center py-6">
                {search ? 'No players match your search.' : `No players on ${teams.find(t => t.id === activeTeamId)?.name ?? ''} roster.`}
              </p>
            ) : (
              <div className="space-y-2">
                {filteredPlayers.map(player => (
                  <PlayerRow
                    key={player.id}
                    player={player}
                    teams={teams}
                    canManage={canManageContacts}
                    onEdit={p => { setEditingPlayer(p); setShowAddForm(false) }}
                    onRemove={handlePlayerRemoved}
                    onTeamChanged={handleTeamChanged}
                    onCallUpChanged={handleCallUpChanged}
                  />
                ))}
                <p className="text-xs text-slate-600 text-center pt-2">
                  {filteredPlayers.length} player{filteredPlayers.length !== 1 ? 's' : ''}
                  {search && ` matching "${search}"`}
                </p>
              </div>
            )}
          </div>

          {/* ── RIGHT: Join links + instructions ── */}
          <div className="space-y-4">

            {/* One join link card per team */}
            {teams.map((t, i) => (
              <JoinLinkCard
                key={t.id}
                team={t}
                initialToken={joinTokensByTeam[t.id] ?? null}
                isPrimary={i === 0}
              />
            ))}

            {/* Instructions card */}
            <div className="rounded-2xl border border-white/10 bg-slate-900 p-5">
              <p className="text-sm font-bold text-white mb-3">How it works</p>
              <ol className="space-y-2.5 text-xs text-slate-400">
                <li className="flex gap-2">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-sky-600 text-white flex items-center justify-center text-xs font-bold">1</span>
                  <span>Add all player names to the roster above</span>
                </li>
                <li className="flex gap-2">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-sky-600 text-white flex items-center justify-center text-xs font-bold">2</span>
                  <span>Generate a join link and share it with parents via text, email, or QR code</span>
                </li>
                <li className="flex gap-2">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-sky-600 text-white flex items-center justify-center text-xs font-bold">3</span>
                  <span>Parents visit the link, select their player, and provide contact info with SMS consent</span>
                </li>
                <li className="flex gap-2">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-sky-600 text-white flex items-center justify-center text-xs font-bold">4</span>
                  <span>Contacts appear automatically — ready for notifications and volunteer signup</span>
                </li>
              </ol>
              {teams.length > 1 && (
                <div className="mt-4 pt-4 border-t border-white/5">
                  <p className="text-xs text-slate-500">
                    <span className="text-amber-400 font-medium">Call-ups:</span> Use the <span className="text-amber-300">+ Call Up</span> button on a player row to assign them to both teams. Called-up players appear on both rosters.
                  </p>
                </div>
              )}
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}
