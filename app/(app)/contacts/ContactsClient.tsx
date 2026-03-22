'use client'

import { useState } from 'react'
import { updateContact, deleteContact } from './actions'

// ── Types ─────────────────────────────────────────────────────

type Contact = {
  id: string
  first_name: string
  last_name: string
  phone: string | null
  email: string | null
  contact_type: string
  sms_consent: boolean
  player_id: string | null
  created_at: string
  notes: string | null
}

type Player = {
  id: string
  first_name: string
  last_name: string
  jersey_number: string | null
}

// ── Helpers ───────────────────────────────────────────────────

function formatPhone(phone: string | null): string {
  if (!phone) return '—'
  const d = phone.replace(/\D/g, '')
  if (d.length !== 10) return phone
  return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric'
  })
}

function roleLabel(type: string): string {
  const map: Record<string, string> = {
    parent: 'Parent', player: 'Player',
    volunteer: 'Volunteer', official: 'Official', other: 'Other',
  }
  return map[type] ?? type
}

function roleBadge(type: string) {
  const map: Record<string, string> = {
    parent:    'bg-sky-500/20 text-sky-300 border-sky-500/30',
    player:    'bg-green-500/20 text-green-300 border-green-500/30',
    volunteer: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    official:  'bg-amber-500/20 text-amber-300 border-amber-500/30',
    other:     'bg-slate-700 text-slate-300 border-white/10',
  }
  const cls = map[type] ?? 'bg-slate-700 text-slate-300 border-white/10'
  return (
    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      {roleLabel(type)}
    </span>
  )
}

// ── Edit Contact Modal ────────────────────────────────────────

function EditContactModal({ contact, players, teamId, onSave, onClose }: {
  contact: Contact
  players: Player[]
  teamId: string
  onSave: (updated: Contact) => void
  onClose: () => void
}) {
  const [firstName, setFirstName]   = useState(contact.first_name)
  const [lastName, setLastName]     = useState(contact.last_name)
  const [email, setEmail]           = useState(contact.email ?? '')
  const [contactType, setContactType] = useState(contact.contact_type)
  const [playerId, setPlayerId]     = useState(contact.player_id ?? '')
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState<string | null>(null)

  const inputClass = "w-full rounded-xl border border-white/10 bg-slate-800 px-4 py-2.5 text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none text-sm"

  async function handleSave() {
    if (!firstName.trim() || !lastName.trim()) {
      setError('Name is required.')
      return
    }
    setLoading(true)
    setError(null)

    const result = await updateContact(contact.id, {
      first_name:   firstName,
      last_name:    lastName,
      email:        email || undefined,
      contact_type: contactType,
      player_id:    playerId || null,
      team_id:      teamId,
    })

    if (result?.error) {
      setError(result.error)
      setLoading(false)
      return
    }

    onSave({
      ...contact,
      first_name:   firstName,
      last_name:    lastName,
      email:        email || null,
      contact_type: contactType,
      player_id:    playerId || null,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-bold">Edit Contact</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none">×</button>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">First Name</label>
              <input type="text" value={firstName}
                onChange={e => setFirstName(e.target.value)}
                className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">Last Name</label>
              <input type="text" value={lastName}
                onChange={e => setLastName(e.target.value)}
                className={inputClass} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">Email</label>
            <input type="email" value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="optional"
              className={inputClass} />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">Role</label>
            <select value={contactType} onChange={e => setContactType(e.target.value)}
              className={inputClass} style={{ appearance: 'auto' }}>
              <option value="parent">Parent</option>
              <option value="player">Player</option>
              <option value="volunteer">Volunteer</option>
              <option value="official">Official</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">
              Linked Player <span className="text-slate-500 font-normal">(optional)</span>
            </label>
            <select value={playerId} onChange={e => setPlayerId(e.target.value)}
              className={inputClass} style={{ appearance: 'auto' }}>
              <option value="">— Not linked —</option>
              {players.map(p => (
                <option key={p.id} value={p.id}>
                  {p.last_name}, {p.first_name}
                  {p.jersey_number ? ` (#${p.jersey_number})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Phone is read-only — only signup flow can set it */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">
              Phone <span className="text-slate-500 font-normal">(set via signup)</span>
            </label>
            <div className="rounded-xl border border-white/5 bg-slate-800/50 px-4 py-2.5 text-sm text-slate-500">
              {formatPhone(contact.phone)}
            </div>
          </div>
        </div>

        {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

        <div className="flex gap-3 mt-5">
          <button
            onClick={handleSave}
            disabled={loading}
            className="flex-1 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 px-4 py-2.5 text-sm font-semibold transition-colors"
          >
            {loading ? 'Saving...' : 'Save Changes'}
          </button>
          <button
            onClick={onClose}
            disabled={loading}
            className="rounded-xl border border-white/10 hover:bg-slate-800 disabled:opacity-50 px-4 py-2.5 text-sm font-semibold transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Contact Row ───────────────────────────────────────────────

function ContactRow({ contact, players, canManage, teamId, onEdit, onDelete }: {
  contact: Contact
  players: Player[]
  canManage: boolean
  teamId: string
  onEdit: (c: Contact) => void
  onDelete: (id: string) => void
}) {
  const [deleting, setDeleting] = useState(false)

  const linkedPlayer = players.find(p => p.id === contact.player_id)

  async function handleDelete() {
    if (!confirm(`Remove ${contact.first_name} ${contact.last_name} from contacts?`)) return
    setDeleting(true)
    const result = await deleteContact(contact.id, teamId)
    if (!result?.error) onDelete(contact.id)
    setDeleting(false)
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900 px-5 py-4 hover:border-white/20 transition-colors">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">

        {/* Left: info */}
        <div className="min-w-0 flex-1">
          {/* Name + role badge */}
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="text-sm font-semibold text-white">
              {contact.last_name}, {contact.first_name}
            </span>
            {roleBadge(contact.contact_type)}
            {contact.sms_consent ? (
              <span className="rounded-full border border-green-500/30 bg-green-500/10 px-2.5 py-0.5 text-xs text-green-400">
                ✓ SMS
              </span>
            ) : (
              <span className="rounded-full border border-white/10 bg-slate-800 px-2.5 py-0.5 text-xs text-slate-500">
                No consent
              </span>
            )}
            {!contact.player_id && contact.contact_type === 'parent' && (
              <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs text-amber-400">
                ⚠ Unlinked
              </span>
            )}
          </div>

          {/* Contact details */}
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-400">
            <span>{formatPhone(contact.phone)}</span>
            {contact.email && <span>{contact.email}</span>}
            {linkedPlayer && (
              <span className="text-sky-400">
                → {linkedPlayer.last_name}, {linkedPlayer.first_name}
                {linkedPlayer.jersey_number ? ` #${linkedPlayer.jersey_number}` : ''}
              </span>
            )}
            <span className="text-slate-600">Signed up {formatDate(contact.created_at)}</span>
          </div>

          {/* Notes (unlinked player name) */}
          {contact.notes && (
            <p className="mt-1.5 text-xs text-amber-400/80 italic">{contact.notes}</p>
          )}
        </div>

        {/* Right: actions */}
        {canManage && (
          <div className="flex shrink-0 gap-2">
            {contact.phone && contact.sms_consent && (
      
                <a href={`sms:${contact.phone}`}
                style={{ padding: '2px 10px' }}
                className="rounded-lg border border-green-500/20 bg-green-500/10 hover:bg-green-500/20 text-green-400 text-xs font-semibold transition-colors"
            >
                💬 Text
            </a>
            )}
            <button
              onClick={() => onEdit(contact)}
              style={{ padding: '2px 10px' }}
              className="rounded-lg border border-white/10 bg-slate-800 hover:bg-slate-700 text-xs font-semibold transition-colors"
            >
              Edit
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              style={{ padding: '2px 10px' }}
              className="rounded-lg border border-red-500/20 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-semibold transition-colors disabled:opacity-50"
            >
              {deleting ? '...' : 'Remove'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Contacts Client ──────────────────────────────────────

export default function ContactsClient({
  contacts: initialContacts,
  players,
  teamId,
  teamName,
  programName,
  canManageContacts,
}: {
  contacts: Contact[]
  players: Player[]
  teamId: string
  teamName: string
  programName: string
  canManageContacts: boolean
}) {
  const [contacts, setContacts]       = useState(initialContacts)
  const [editingContact, setEditing]  = useState<Contact | null>(null)
  const [roleFilter, setRoleFilter]   = useState('all')
  const [playerFilter, setPlayerFilter] = useState('all')
  const [unlinkedOnly, setUnlinkedOnly] = useState(false)
  const [search, setSearch]           = useState('')

  // Stats
  const totalContacts  = contacts.length
  const smsReady       = contacts.filter(c => c.sms_consent).length
  const unlinkedCount  = contacts.filter(
    c => c.contact_type === 'parent' && !c.player_id
  ).length

  // Apply filters
  const filtered = contacts.filter(c => {
    if (roleFilter !== 'all' && c.contact_type !== roleFilter) return false
    if (playerFilter !== 'all' && c.player_id !== playerFilter) return false
    if (unlinkedOnly && (c.contact_type !== 'parent' || c.player_id)) return false
    if (search) {
      const q = search.toLowerCase()
      const name = `${c.first_name} ${c.last_name}`.toLowerCase()
      if (!name.includes(q) && !(c.phone ?? '').includes(q) && !(c.email ?? '').toLowerCase().includes(q)) {
        return false
      }
    }
    return true
  })

  function handleContactSaved(updated: Contact) {
    setContacts(prev => prev.map(c => c.id === updated.id ? updated : c))
    setEditing(null)
  }

  function handleContactDeleted(id: string) {
    setContacts(prev => prev.filter(c => c.id !== id))
  }

  return (
    <div className="text-white">

      {editingContact && (
        <EditContactModal
          contact={editingContact}
          players={players}
          teamId={teamId}
          onSave={handleContactSaved}
          onClose={() => setEditing(null)}
        />
      )}

      <div className="mx-auto max-w-5xl px-6 py-8">

        {/* Header */}
        <div className="mb-6">
          <p className="text-sm text-slate-400">{programName}</p>
          <h1 className="text-2xl font-bold">{teamName} — Contacts</h1>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="rounded-2xl border border-white/10 bg-slate-900 p-4 text-center">
            <p className="text-2xl font-bold text-white">{totalContacts}</p>
            <p className="text-xs text-slate-400 mt-0.5">Total Contacts</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-900 p-4 text-center">
            <p className="text-2xl font-bold text-green-400">{smsReady}</p>
            <p className="text-xs text-slate-400 mt-0.5">SMS Ready</p>
          </div>
          <div className={`rounded-2xl border p-4 text-center ${
            unlinkedCount > 0
              ? 'border-amber-500/30 bg-amber-500/5'
              : 'border-white/10 bg-slate-900'
          }`}>
            <p className={`text-2xl font-bold ${unlinkedCount > 0 ? 'text-amber-400' : 'text-white'}`}>
              {unlinkedCount}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">Unlinked Parents</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-5">
          {/* Search */}
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name, phone, email..."
            className="flex-1 min-w-48 rounded-xl border border-white/10 bg-slate-900 px-4 py-2 text-sm text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none"
          />

          {/* Role filter */}
          <select
            value={roleFilter}
            onChange={e => setRoleFilter(e.target.value)}
            className="rounded-xl border border-white/10 bg-slate-900 px-4 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
            style={{ appearance: 'auto' }}
          >
            <option value="all">All Roles</option>
            <option value="parent">Parents</option>
            <option value="player">Players</option>
            <option value="volunteer">Volunteers</option>
            <option value="official">Officials</option>
          </select>

          {/* Player filter */}
          <select
            value={playerFilter}
            onChange={e => setPlayerFilter(e.target.value)}
            className="rounded-xl border border-white/10 bg-slate-900 px-4 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
            style={{ appearance: 'auto' }}
          >
            <option value="all">All Players</option>
            {players.map(p => (
              <option key={p.id} value={p.id}>
                {p.last_name}, {p.first_name}
              </option>
            ))}
          </select>

          {/* Unlinked toggle */}
          {unlinkedCount > 0 && (
            <button
              onClick={() => setUnlinkedOnly(!unlinkedOnly)}
              className={`rounded-xl border px-4 py-2 text-sm font-semibold transition-colors ${
                unlinkedOnly
                  ? 'border-amber-500/40 bg-amber-500/20 text-amber-300'
                  : 'border-white/10 bg-slate-900 text-slate-400 hover:text-white'
              }`}
            >
              ⚠ Unlinked ({unlinkedCount})
            </button>
          )}
        </div>

        {/* Results count */}
        <p className="text-xs text-slate-500 mb-3">
          Showing {filtered.length} of {totalContacts} contact{totalContacts !== 1 ? 's' : ''}
        </p>

        {/* Contact list */}
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-slate-900 p-10 text-center">
            <p className="text-slate-400 font-semibold">No contacts found</p>
            <p className="text-slate-500 text-sm mt-1">
              {totalContacts === 0
                ? 'Share your roster join link with parents to collect contacts.'
                : 'Try adjusting your filters.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(contact => (
              <ContactRow
                key={contact.id}
                contact={contact}
                players={players}
                canManage={canManageContacts}
                teamId={teamId}
                onEdit={setEditing}
                onDelete={handleContactDeleted}
              />
            ))}
          </div>
        )}

      </div>
    </div>
  )
}