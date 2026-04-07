'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateContact, deleteContact } from './actions'
import { regenerateProgramJoinToken } from '@/app/join/[programSlug]/actions'

// ── Parent Signup Section ─────────────────────────────────────

function ParentSignupSection({
  signupUrl,
  qrDataUrl,
  teamSlug,
  teamId,
  programId,
  programSlug,
  canManage,
}: {
  signupUrl: string | null
  qrDataUrl: string | null
  teamSlug: string
  teamId: string
  programId: string
  programSlug: string | null
  canManage: boolean
}) {
  const [copied, setCopied]         = useState(false)
  const [regenerating, setRegen]    = useState(false)
  const [regenError, setRegenError] = useState<string | null>(null)
  const router = useRouter()

  async function handleCopy() {
    if (!signupUrl) return
    try {
      await navigator.clipboard.writeText(signupUrl)
    } catch {
      const el = document.createElement('textarea')
      el.value = signupUrl
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleDownload() {
    if (!qrDataUrl) return
    const link = document.createElement('a')
    link.download = `${teamSlug || 'team'}-parent-signup-qr.png`
    link.href = qrDataUrl
    link.click()
  }

  async function handleRegenerate() {
    if (!confirm('Regenerating the link will invalidate the current QR code and URL. Parents with the old link will not be able to sign up. Continue?')) return
    setRegen(true)
    setRegenError(null)
    const result = await regenerateProgramJoinToken(programId, teamId)
    if (result.error) {
      setRegenError(result.error)
      setRegen(false)
      return
    }
    router.refresh()
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900 overflow-hidden mb-8">
      <div className="px-6 py-4 border-b border-white/10 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-sky-400">Parent Sign-Up</h2>
          <p className="text-slate-400 text-xs mt-1">
            Share this link or QR code with parents to join the program roster.
          </p>
        </div>
        {canManage && (
          <button
            onClick={handleRegenerate}
            disabled={regenerating}
            className="shrink-0 rounded-xl border border-white/10 hover:border-white/20 hover:bg-slate-800 disabled:opacity-50 px-3 py-1.5 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
          >
            {regenerating ? 'Regenerating…' : 'Regenerate Link'}
          </button>
        )}
      </div>

      {regenError && (
        <div className="px-6 pt-3">
          <p className="text-xs text-red-400">{regenError}</p>
        </div>
      )}

      {!signupUrl || !qrDataUrl ? (
        <div className="px-6 py-5">
          <p className="text-sm text-slate-400">
            No signup link active.{' '}
            {canManage && (
              <button
                onClick={handleRegenerate}
                disabled={regenerating}
                className="text-sky-400 hover:text-sky-300 underline underline-offset-2 disabled:opacity-50"
              >
                {regenerating ? 'Generating…' : 'Generate one now.'}
              </button>
            )}
          </p>
        </div>
      ) : (
        <div className="px-6 py-5 flex flex-col sm:flex-row gap-6 items-start">
          {/* QR code */}
          <div className="shrink-0">
            <img
              src={qrDataUrl}
              alt="Parent signup QR code"
              width={160}
              height={160}
              className="rounded-xl border border-white/10"
            />
          </div>

          {/* URL + buttons */}
          <div className="flex-1 min-w-0 flex flex-col justify-center gap-3">
            <div className="rounded-xl border border-white/10 bg-slate-800 px-4 py-2.5">
              <p className="text-xs text-slate-500 mb-0.5">Signup link</p>
              <p className="text-sm text-slate-300 break-all">{signupUrl}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleCopy}
                className="rounded-xl bg-sky-600 hover:bg-sky-500 px-4 py-2 text-sm font-semibold transition-colors"
              >
                {copied ? 'Copied!' : 'Copy Link'}
              </button>
              <button
                onClick={handleDownload}
                className="rounded-xl border border-white/20 hover:border-white/40 hover:bg-white/5 px-4 py-2 text-sm font-semibold text-slate-300 hover:text-white transition-colors"
              >
                Download QR
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

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
  email_unsubscribed: boolean | null
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

function roleBadge(type: string, brandPrimary?: string | null) {
  if (type === 'parent' && brandPrimary) {
    return (
      <span
        className="rounded-full border px-2.5 py-0.5 text-xs font-semibold"
        style={{ background: `${brandPrimary}33`, borderColor: `${brandPrimary}80`, color: brandPrimary }}
      >
        Parent
      </span>
    )
  }
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

        {contact.email_unsubscribed && (
          <div className="mb-4 rounded-xl border border-white/10 bg-slate-800/60 px-4 py-3">
            <span className="inline-block rounded-full border border-white/10 bg-slate-700 px-2.5 py-0.5 text-xs font-semibold text-slate-400 mb-2">
              Unsubscribed
            </span>
            <p className="text-xs text-slate-400 leading-relaxed">
              This contact has unsubscribed from email notifications. They will not receive change alerts or weekly digests.
            </p>
          </div>
        )}

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

function ContactRow({ contact, players, canManage, teamId, brandPrimary, onEdit, onDelete }: {
  contact: Contact
  players: Player[]
  canManage: boolean
  teamId: string
  brandPrimary?: string | null
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

      {/* Name + badges row */}
      <div className="flex flex-wrap items-center gap-2 mb-1.5">
        <span className="text-base font-semibold text-white">
          {contact.last_name}, {contact.first_name}
        </span>
        {roleBadge(contact.contact_type, brandPrimary)}
        {contact.sms_consent ? (
          <span className="rounded-full border border-green-500/40 bg-green-500/20 px-2 py-0.5 text-xs text-green-400">
            ✓ SMS
          </span>
        ) : (
          <span className="rounded-full border border-slate-600 bg-slate-700/50 px-2 py-0.5 text-xs text-slate-500">
            No consent
          </span>
        )}
        {contact.email_unsubscribed && (
          <span className="rounded-full border border-slate-500 bg-slate-500/20 px-2 py-0.5 text-xs text-slate-400">
            Unsubscribed
          </span>
        )}
        {!contact.player_id && contact.contact_type === 'parent' && (
          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-400">
            ⚠ Needs Assignment
          </span>
        )}
      </div>

      {/* Contact details */}
      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-slate-400 mb-1">
        {contact.phone && <span>{formatPhone(contact.phone)}</span>}
        {contact.email && <span>{contact.email}</span>}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm mb-1">
        {linkedPlayer && (
          <span className="text-sky-400">
            → {linkedPlayer.last_name}, {linkedPlayer.first_name}
            {linkedPlayer.jersey_number ? ` #${linkedPlayer.jersey_number}` : ''}
          </span>
        )}
        <span className="text-xs text-slate-600">Signed up {formatDate(contact.created_at)}</span>
      </div>

      {contact.notes && (
        <p className="text-xs text-amber-400/80 italic mb-1">{contact.notes}</p>
      )}

      {/* Action buttons */}
      {canManage && (
        <div className="flex flex-row gap-2 mt-2">
          {contact.phone && contact.sms_consent && (
            <a
              href={`sms:${contact.phone}`}
              className="flex-1 text-center rounded-full border border-green-500 text-green-400 bg-transparent hover:bg-green-500/10 px-3 py-1.5 text-sm font-medium transition-colors min-h-[36px] flex items-center justify-center"
            >
              💬 Text
            </a>
          )}
          <button
            onClick={() => onEdit(contact)}
            className="flex-1 rounded-full border border-slate-500 text-slate-300 bg-transparent hover:bg-slate-700/50 px-3 py-1.5 text-sm font-medium transition-colors min-h-[36px]"
          >
            Edit
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="flex-1 rounded-full border border-red-500 text-red-400 bg-transparent hover:bg-red-500/10 px-3 py-1.5 text-sm font-medium transition-colors min-h-[36px] disabled:opacity-50"
          >
            {deleting ? '…' : 'Remove'}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Main Contacts Client ──────────────────────────────────────

export default function ContactsClient({
  contacts: initialContacts,
  players,
  teamId,
  teamName,
  teamSlug,
  programId,
  programSlug,
  programName,
  canManageContacts,
  canShowSignupSection,
  signupUrl,
  qrDataUrl,
  brandPrimary = null,
}: {
  contacts: Contact[]
  players: Player[]
  teamId: string
  teamName: string
  teamSlug: string
  programId: string
  programSlug: string | null
  programName: string
  canManageContacts: boolean
  canShowSignupSection: boolean
  signupUrl: string | null
  qrDataUrl: string | null
  brandPrimary?: string | null
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

        {/* Parent sign-up QR section */}
        {canShowSignupSection && (
          <ParentSignupSection
            signupUrl={signupUrl}
            qrDataUrl={qrDataUrl}
            teamSlug={teamSlug}
            teamId={teamId}
            programId={programId}
            programSlug={programSlug}
            canManage={canManageContacts}
          />
        )}

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
        <div className="flex flex-col gap-2 mb-5">
          {/* Row 1: Search (full width) */}
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name, phone, email..."
            className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none transition-colors"
            style={search ? { borderColor: brandPrimary ?? '#0284c7' } : undefined}
          />

          {/* Row 2: dropdowns + unlinked toggle */}
          <div className="flex flex-wrap gap-2">
            <select
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value)}
              className="rounded-xl border bg-slate-900 px-4 py-2 text-sm text-white focus:outline-none transition-colors"
              style={{ appearance: 'auto', borderColor: roleFilter !== 'all' ? (brandPrimary ?? '#0284c7') : 'rgba(255,255,255,0.1)' }}
            >
              <option value="all">All Roles</option>
              <option value="parent">Parents</option>
              <option value="player">Players</option>
              <option value="volunteer">Volunteers</option>
              <option value="official">Officials</option>
            </select>

            <select
              value={playerFilter}
              onChange={e => setPlayerFilter(e.target.value)}
              className="rounded-xl border bg-slate-900 px-4 py-2 text-sm text-white focus:outline-none transition-colors"
              style={{ appearance: 'auto', borderColor: playerFilter !== 'all' ? (brandPrimary ?? '#0284c7') : 'rgba(255,255,255,0.1)' }}
            >
              <option value="all">All Players</option>
              {players.map(p => (
                <option key={p.id} value={p.id}>
                  {p.last_name}, {p.first_name}
                </option>
              ))}
            </select>

            {unlinkedCount > 0 && (
              <button
                onClick={() => setUnlinkedOnly(!unlinkedOnly)}
                className={`rounded-xl border px-4 py-2 text-sm font-semibold transition-colors ${
                  unlinkedOnly
                    ? 'border-amber-500/40 bg-amber-500/20 text-amber-300'
                    : 'border-white/10 bg-slate-900 text-slate-400 hover:text-white'
                }`}
              >
                ⚠ Needs Assignment ({unlinkedCount})
              </button>
            )}
          </div>
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
                brandPrimary={brandPrimary}
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