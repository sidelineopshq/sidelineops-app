'use client'

import { useState } from 'react'
import { addPlayer, updatePlayer, deactivatePlayer, generateJoinToken } from './actions'

// ── Types ─────────────────────────────────────────────────────

type Player = {
  id: string
  first_name: string
  last_name: string
  jersey_number: string | null
  is_active: boolean
  notes: string | null
}

// ── Add / Edit Player Form ────────────────────────────────────

function PlayerForm({ teamId, player, onSave, onCancel }: {
  teamId: string
  player?: Player
  onSave: (player: Player) => void
  onCancel: () => void
}) {
  const [firstName, setFirstName]     = useState(player?.first_name ?? '')
  const [lastName, setLastName]       = useState(player?.last_name ?? '')
  const [jersey, setJersey]           = useState(player?.jersey_number ?? '')
  const [notes, setNotes]             = useState(player?.notes ?? '')
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState<string | null>(null)

  const inputClass = "w-full rounded-xl border border-white/10 bg-slate-800 px-4 py-2.5 text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none text-sm"

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
        notes:         notes || undefined,
        team_id:       teamId,
      })
      if (result?.error) { setError(result.error); setLoading(false); return }
      onSave({ ...player, first_name: firstName, last_name: lastName, jersey_number: jersey || null, notes: notes || null })
    } else {
      const result = await addPlayer({
        first_name:    firstName,
        last_name:     lastName,
        jersey_number: jersey || undefined,
        notes:         notes || undefined,
        team_id:       teamId,
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

      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}

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

function PlayerRow({ player, canManage, teamId, onEdit, onRemove }: {
  player: Player
  canManage: boolean
  teamId: string
  onEdit: (player: Player) => void
  onRemove: (playerId: string) => void
}) {
  const [removing, setRemoving] = useState(false)

  async function handleRemove() {
    if (!confirm(`Remove ${player.first_name} ${player.last_name} from the roster?`)) return
    setRemoving(true)
    const result = await deactivatePlayer(player.id, teamId)
    if (!result?.error) {
      onRemove(player.id)
    }
    setRemoving(false)
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-900 px-4 py-3 hover:border-white/20 transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        {/* Jersey badge */}
        <div className="shrink-0 w-9 h-9 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center">
          <span className="text-xs font-bold text-slate-400">
            {player.jersey_number ?? '—'}
          </span>
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
  )
}

// ── Join Link Card ────────────────────────────────────────────

function JoinLinkCard({ teamId, initialToken }: {
  teamId: string
  initialToken: string | null
}) {
  const [token, setToken]         = useState(initialToken)
  const [copied, setCopied]       = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError]         = useState<string | null>(null)

  const joinUrl = token
    ? `${typeof window !== 'undefined' ? window.location.origin : 'https://sidelineopshq.com'}/join/${token}`
    : null

  async function handleGenerate() {
    setGenerating(true)
    setError(null)
    const result = await generateJoinToken(teamId)
    if (result?.error) {
      setError(result.error)
    } else if (result?.token) {
      setToken(result.token)
    }
    setGenerating(false)
  }

  async function handleCopy() {
    if (!joinUrl) return
    try {
      await navigator.clipboard.writeText(joinUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      const el = document.createElement('textarea')
      el.value = joinUrl
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900 p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-sm font-bold text-white">Parent Signup Link</p>
          <p className="text-xs text-slate-500 mt-0.5">
            Share this link with parents to collect contact info and SMS consent.
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-0.5 text-xs text-sky-300 font-semibold">
          Roster Feature
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
              {generating ? 'Rotating...' : 'Rotate Link'}
            </button>
          </div>
          <p className="text-xs text-slate-600">
            Rotating generates a new link and invalidates the old one.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-slate-400">
            No join link generated yet. Generate one to start collecting parent contacts.
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
  teamId,
  teamName,
  programName,
  sport,
  canManageContacts,
  joinToken,
  playerCount,
  contactCount,
}: {
  players: Player[]
  teamId: string
  teamName: string
  programName: string
  sport: string
  canManageContacts: boolean
  joinToken: string | null
  playerCount: number
  contactCount: number
}) {
  const [players, setPlayers]     = useState(initialPlayers)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null)
  const [search, setSearch]       = useState('')

  const filteredPlayers = players.filter(p =>
    `${p.first_name} ${p.last_name}`.toLowerCase().includes(search.toLowerCase()) ||
    (p.jersey_number ?? '').includes(search)
  )

  const completionPct = playerCount > 0
    ? Math.round((contactCount / playerCount) * 100)
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

  return (
    <div className="text-white">
      <div className="mx-auto max-w-4xl px-6 py-8">

        {/* Page header */}
        <div className="mb-8">
          <p className="text-sm text-slate-400">{programName}</p>
          <h1 className="text-2xl font-bold">{teamName} — Roster</h1>
          <p className="text-sm text-slate-500 mt-0.5">{sport}</p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="rounded-2xl border border-white/10 bg-slate-900 p-4 text-center">
            <p className="text-2xl font-bold text-white">{playerCount}</p>
            <p className="text-xs text-slate-400 mt-0.5">Players</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-900 p-4 text-center">
            <p className="text-2xl font-bold text-white">{contactCount}</p>
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
                  teamId={teamId}
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
                teamId={teamId}
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
                No players match your search.
              </p>
            ) : (
              <div className="space-y-2">
                {filteredPlayers.map(player => (
                  <PlayerRow
                    key={player.id}
                    player={player}
                    canManage={canManageContacts}
                    teamId={teamId}
                    onEdit={p => { setEditingPlayer(p); setShowAddForm(false) }}
                    onRemove={handlePlayerRemoved}
                  />
                ))}
                <p className="text-xs text-slate-600 text-center pt-2">
                  {filteredPlayers.length} player{filteredPlayers.length !== 1 ? 's' : ''}
                  {search && ` matching "${search}"`}
                </p>
              </div>
            )}
          </div>

          {/* ── RIGHT: Join link + instructions ── */}
          <div className="space-y-4">

            <JoinLinkCard teamId={teamId} initialToken={joinToken} />

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
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}